import { assertBookmarkIntegrity, BookmarkDataPendingError } from './bookmarkIntegrity'
import type { Bookmark, Group, IconSource } from '@/types/bookmark'
import type { SettingsState } from '@/stores/settings'
import { overlayBookmarkUsage } from '@/lib/bookmarkUsage'
import {
  allDocs,
  allDocsAsync,
  bulkWriteDocs,
  bulkWriteDocsSync,
  getAttachmentAsync,
  getAttachmentTypeAsync,
  getDbStorage,
  getDoc,
  getDocAsync,
  isUToolsDbAvailable,
  postAttachmentAsync,
  putDocWithRetry,
  removeDoc,
  type HostDoc,
  type HostWriteDoc
} from '@/lib/utoolsDb'

const BOOKMARK_DOC_PREFIX = 'gm:bookmark:'
const GROUP_DOC_PREFIX = 'gm:group:'
const ICON_ATTACHMENT_PREFIX = 'gm:icon/'
const LEGACY_BOOKMARK_META_DOC_ID = 'gm:bookmark:meta'
const BOOKMARK_META_DOC_ID = 'gm:meta:bookmark'
const BOOKMARK_SCHEMA_VERSION = 2
const SETTINGS_DOC_ID = 'gm:settings'
const STORAGE_DOC_PREFIX = 'gm:storage:'
const LEGACY_FALLBACK_DOC_PREFIX = 'goose-marks:storage:'

const LEGACY_KEYS = {
  bookmark: 'bookmark',
  settings: 'settings'
} as const

const ATTACHMENT_REF_PREFIX = 'att:'
const ICON_HYDRATE_CONCURRENCY = 16
const attachmentRefCache = new Map<string, string>()
const attachmentDataUrlCache = new Map<string, string>()
const attachmentReadInFlight = new Map<string, Promise<string | null>>()

/** 用首屏缓存中已有的内容寻址图标预热内存表，避免后台对账时对同一哈希附件重复走 IPC。 */
export const warmAttachmentDataUrlCache = (bookmarks: Bookmark[]): void => {
  for (const bookmark of bookmarks) {
    const icon = bookmark?.icon as (PersistedBookmark['icon'] & { cache?: string; data?: string }) | undefined
    if (!icon) continue
    if (icon.type === 'remote' && typeof icon.cacheRef === 'string' && icon.cacheRef.startsWith(ATTACHMENT_REF_PREFIX) && typeof icon.cache === 'string' && icon.cache.startsWith('data:image/')) {
      const attachmentId = icon.cacheRef.slice(ATTACHMENT_REF_PREFIX.length)
      if (/^gm:icon\/[a-f0-9]{64}\./.test(attachmentId)) {
        attachmentDataUrlCache.set(attachmentId, icon.cache)
        attachmentRefCache.set(icon.cache, icon.cacheRef)
      }
    } else if (icon.type === 'custom' && typeof icon.dataRef === 'string' && icon.dataRef.startsWith(ATTACHMENT_REF_PREFIX) && typeof icon.data === 'string' && icon.data.startsWith('data:image/')) {
      const attachmentId = icon.dataRef.slice(ATTACHMENT_REF_PREFIX.length)
      if (/^gm:icon\/[a-f0-9]{64}\./.test(attachmentId)) {
        attachmentDataUrlCache.set(attachmentId, icon.data)
        attachmentRefCache.set(icon.data, icon.dataRef)
      }
    }
  }
}

type BookmarkIconRef = Extract<IconSource, { type: 'remote' }> & { cacheRef?: string }
type BookmarkCustomIconRef = Omit<Extract<IconSource, { type: 'custom' }>, 'data'> & { data?: string; dataRef?: string }

type PersistedIconSource =
  | Extract<IconSource, { type: 'file' }>
  | Extract<IconSource, { type: 'text' }>
  | BookmarkIconRef
  | BookmarkCustomIconRef

type PersistedBookmark = Omit<Bookmark, 'icon'> & { icon?: PersistedIconSource }
type PersistedGroup = Group & { orderIndex?: number }

interface BookmarkMetaDoc {
  activeGroupId: string
  activeSubGroupId: string
  updatedAt: number
  schemaVersion: number
}

export interface BookmarkSnapshot {
  groups: Group[]
  bookmarks: Bookmark[]
  activeGroupId: string
  activeSubGroupId: string
}

// 仅驻留本窗口内存；不增加文档字段，也不改变旧版可读的数据格式。
let bookmarkBaseline: Map<string, HostDoc<unknown>> | null = null
let bookmarkMigrationPending = false
let legacyBookmarkStoragePending = false
export const isBookmarkMigrationPending = (): boolean => bookmarkMigrationPending

export class BookmarkAccountChangedError extends Error {
  constructor() {
    super('uTools 登录信息或个人资料已变化，已停止写入，请重新打开应用。')
    this.name = 'BookmarkAccountChangedError'
  }
}
let sessionIdentity: string | undefined
const assertHostSession = () => {
  const user = window.utools?.getUser?.()
  const identity = JSON.stringify(user ? [user.nickname, user.avatar] : null)
  if (sessionIdentity === undefined) sessionIdentity = identity
  if (identity !== sessionIdentity) throw new BookmarkAccountChangedError()
}

export class BookmarkSyncConflictError extends Error {
  constructor() {
    super('检测到其他设备或窗口更新了书签，已暂停保存以避免覆盖。请先导出完整备份，再重新打开应用。')
    this.name = 'BookmarkSyncConflictError'
  }
}

const readBookmarkDocs = async (): Promise<Map<string, HostDoc<unknown>>> => {
  const [bookmarks, groups, meta] = await Promise.all([
    allDocsAsync<PersistedBookmark>(BOOKMARK_DOC_PREFIX, true),
    allDocsAsync<PersistedGroup>(GROUP_DOC_PREFIX, true),
    getDocAsync<BookmarkMetaDoc>(BOOKMARK_META_DOC_ID, true)
  ])
  return new Map<string, HostDoc<unknown>>([
    ...bookmarks.filter(isPersistedBookmarkDoc), ...groups, ...(meta ? [meta] : [])
  ].map(doc => [doc._id, clone(doc)]))
}

const readBookmarkDocsSync = (): Map<string, HostDoc<unknown>> => {
  const bookmarks = allDocs<PersistedBookmark>(BOOKMARK_DOC_PREFIX)
  const groups = allDocs<PersistedGroup>(GROUP_DOC_PREFIX)
  const meta = getDoc<BookmarkMetaDoc>(BOOKMARK_META_DOC_ID)
  return new Map<string, HostDoc<unknown>>([
    ...bookmarks.filter(isPersistedBookmarkDoc), ...groups, ...(meta ? [meta] : [])
  ].map(doc => [doc._id, clone(doc)]))
}

const makeWriteDoc = <T>(id: string, data: T, rev?: string): HostWriteDoc<T> =>
  rev ? { _id: id, _rev: rev, data } : { _id: id, data }

const sameDoc = (left?: HostDoc<unknown>, right?: HostDoc<unknown>): boolean =>
  left?._rev === right?._rev && JSON.stringify(left?.data) === JSON.stringify(right?.data)

const assertBookmarkBaseline = (current: Map<string, HostDoc<unknown>>): void => {
  if (!bookmarkBaseline || current.size !== bookmarkBaseline.size ||
    [...bookmarkBaseline].some(([id, doc]) => !sameDoc(doc, current.get(id)))) {
    throw new BookmarkSyncConflictError()
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const isDataUrl = (value: string): boolean => value.startsWith('data:image/')

const storageDocId = (key: string) => `${STORAGE_DOC_PREFIX}${key}`

const readLocalStorageValue = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const removeLocalStorageValue = (key: string): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

const readLegacyRawValue = (key: string): string | null => {
  const primary = getDbStorage()
  try {
    const fromPrimary = primary?.getItem(key)
    if (typeof fromPrimary === 'string') return fromPrimary
  } catch {}

  const fallback = getDoc<string | { value?: string }>(`${LEGACY_FALLBACK_DOC_PREFIX}${key}`)?.data
  if (typeof fallback === 'string') return fallback
  if (fallback && typeof fallback.value === 'string') return fallback.value

  return readLocalStorageValue(key)
}

const cleanupLegacyValue = (key: string): void => {
  try {
    getDbStorage()?.removeItem(key)
  } catch {}
  removeDoc(`${LEGACY_FALLBACK_DOC_PREFIX}${key}`)
  removeLocalStorageValue(key)
}

const cleanupLegacyKeySet = (key: string): void => {
  cleanupLegacyValue(key)
  removeDoc(storageDocId(key))
}

const decodeLegacyPersistedJson = <T>(raw: string): T | null => {
  try {
    let parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {}
    }
    if (parsed && typeof parsed === 'object' && 'state' in parsed && 'version' in parsed) {
      return (parsed as { state: T }).state
    }
    return parsed as T
  } catch {
    return null
  }
}

const readLegacyJson = <T>(key: string): T | null => {
  const raw = readLegacyRawValue(key)
  if (!raw) return null
  return decodeLegacyPersistedJson<T>(raw)
}

const inferExactMimeTypeFromAttachmentId = (attachmentId: string): string | null => {
  const lower = attachmentId.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return null
}

const bytesToDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

const CONTENT_ADDRESSED_ICON_RE = /^gm:icon\/[a-f0-9]{64}\./

const readAttachmentAsDataUrl = async (attachmentId: string): Promise<string | null> => {
  const cacheable = CONTENT_ADDRESSED_ICON_RE.test(attachmentId)
  if (cacheable) {
    const cached = attachmentDataUrlCache.get(attachmentId)
    if (cached) return cached
    const inflight = attachmentReadInFlight.get(attachmentId)
    if (inflight) return inflight
  }

  const task = (async () => {
    const bytes = await getAttachmentAsync(attachmentId)
    if (!bytes) return null
    const mimeType =
      inferExactMimeTypeFromAttachmentId(attachmentId) ||
      (await getAttachmentTypeAsync(attachmentId)) ||
      'image/png'
    const dataUrl = bytesToDataUrl(bytes, mimeType)
    if (cacheable) {
      attachmentDataUrlCache.set(attachmentId, dataUrl)
    }
    return dataUrl
  })()

  if (!cacheable) return task
  attachmentReadInFlight.set(attachmentId, task)
  try {
    return await task
  } finally {
    attachmentReadInFlight.delete(attachmentId)
  }
}

const getMimeTypeFromDataUrl = (dataUrl: string): string | null => {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl)
  return match?.[1] ?? null
}

const getExtensionFromMimeType = (mimeType: string): string => {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return 'ico'
    default:
      return 'bin'
  }
}

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const persistDataUrlAsAttachment = async (dataUrl: string): Promise<string | null> => {
  const cachedRef = attachmentRefCache.get(dataUrl)
  if (cachedRef) return cachedRef

  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()
  const hash = await sha256Hex(arrayBuffer)
  const ext = getExtensionFromMimeType(blob.type || getMimeTypeFromDataUrl(dataUrl) || 'image/png')
  const attachmentId = `${ICON_ATTACHMENT_PREFIX}${hash}.${ext}`

  const existingAttachment = await getAttachmentAsync(attachmentId)
  if (!existingAttachment) {
    const result = await postAttachmentAsync(attachmentId, new Uint8Array(arrayBuffer), blob.type || 'image/png')
    if (result.ok !== true || result.error) {
      console.error('[stateRepository] 保存图标 attachment 失败:', attachmentId, result.error)
      return null
    }
  }

  const ref = `${ATTACHMENT_REF_PREFIX}${attachmentId}`
  attachmentRefCache.set(dataUrl, ref)
  attachmentDataUrlCache.set(attachmentId, dataUrl)
  return ref
}

const toPersistedIcon = async (icon?: IconSource): Promise<PersistedIconSource | undefined> => {
  if (!icon) return undefined
  if (icon.type === 'remote') {
    const next: BookmarkIconRef = { ...icon }
    const canReuseCacheRef =
      next.cacheRef?.startsWith(ATTACHMENT_REF_PREFIX) &&
      (!isDataUrl(next.cache || '') || attachmentRefCache.get(next.cache || '') === next.cacheRef)
    if (canReuseCacheRef) {
      delete next.cache
      return next
    }
    if (typeof icon.cache === 'string' && isDataUrl(icon.cache)) {
      const cacheRef = await persistDataUrlAsAttachment(icon.cache)
      if (!cacheRef) throw new Error('保存远程图标缓存失败，未能完整保存本地数据')
      delete next.cache
      next.cacheRef = cacheRef
    }
    return next
  }
  if (icon.type === 'custom') {
    const next: BookmarkCustomIconRef = { ...icon }
    const canReuseDataRef =
      next.dataRef?.startsWith(ATTACHMENT_REF_PREFIX) &&
      (!isDataUrl(next.data || '') || attachmentRefCache.get(next.data || '') === next.dataRef)
    if (canReuseDataRef) {
      delete next.data
      return next
    }
    if (typeof icon.data === 'string' && isDataUrl(icon.data)) {
      const dataRef = await persistDataUrlAsAttachment(icon.data)
      if (!dataRef) throw new Error('保存自定义图标失败，未能完整保存本地数据')
      delete next.data
      next.dataRef = dataRef
    }
    return next
  }
  return clone(icon)
}

const hydrateIcon = async (icon?: PersistedIconSource): Promise<IconSource | undefined> => {
  if (!icon) return undefined
  if (icon.type === 'remote') {
    if (icon.cacheRef) {
      const dataUrl = await readAttachmentAsDataUrl(icon.cacheRef.slice(ATTACHMENT_REF_PREFIX.length))
      if (dataUrl) attachmentRefCache.set(dataUrl, icon.cacheRef)
      return { ...icon, cache: dataUrl || icon.cache } as IconSource
    }
    return clone(icon) as IconSource
  }
  if (icon.type === 'custom') {
    if (icon.dataRef) {
      const dataUrl = await readAttachmentAsDataUrl(icon.dataRef.slice(ATTACHMENT_REF_PREFIX.length))
      if (dataUrl) attachmentRefCache.set(dataUrl, icon.dataRef)
      return { ...icon, data: dataUrl || icon.data || '' } as IconSource
    }
    return clone(icon) as IconSource
  }
  return clone(icon)
}

const isPersistedBookmarkDoc = (doc: { _id: string; data: PersistedBookmark }): boolean =>
  doc._id !== LEGACY_BOOKMARK_META_DOC_ID &&
  typeof doc.data?.id === 'string' &&
  typeof doc.data?.url === 'string' &&
  typeof doc.data?.title === 'string'

const loadPersistedBookmarks = async (docs: HostDoc<PersistedBookmark>[]): Promise<Bookmark[]> => {
  const hydrated = new Array<Bookmark>(docs.length)
  let index = 0
  const worker = async () => {
    while (index < docs.length) {
      const currentIndex = index++
      const doc = docs[currentIndex]
      const icon = await hydrateIcon(doc.data.icon)
      hydrated[currentIndex] = { ...clone(doc.data), icon }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(ICON_HYDRATE_CONCURRENCY, docs.length) }, () => worker())
  )
  return hydrated
}

const loadPersistedGroups = (docs: HostDoc<PersistedGroup>[]): Group[] =>
  docs
    .map((doc, fallbackIndex) => ({ ...clone(doc.data), fallbackIndex }))
    .sort((a, b) => {
      const aOrder = typeof a.orderIndex === 'number' ? a.orderIndex : Number.POSITIVE_INFINITY
      const bOrder = typeof b.orderIndex === 'number' ? b.orderIndex : Number.POSITIVE_INFINITY
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt
      return a.fallbackIndex - b.fallbackIndex
    })
    .map(({ fallbackIndex: _fallbackIndex, ...group }) => group)

export const loadBookmarkSnapshot = async (allowIncomplete = false): Promise<BookmarkSnapshot | null> => {
  if (!isUToolsDbAvailable()) return null

  assertHostSession()
  const docs = await readBookmarkDocs()
  const primaryMeta = docs.get(BOOKMARK_META_DOC_ID) as HostDoc<BookmarkMetaDoc> | undefined
  const legacyMeta = primaryMeta ? null : await getDocAsync<BookmarkMetaDoc>(LEGACY_BOOKMARK_META_DOC_ID, true)
  const groups = loadPersistedGroups([...docs.values()].filter(doc => doc._id.startsWith(GROUP_DOC_PREFIX)) as HostDoc<PersistedGroup>[])
  // 使用统计只存在本机；本机没有记录时沿用文档里的旧值。
  const bookmarks = overlayBookmarkUsage(await loadPersistedBookmarks([...docs.values()].filter(doc => doc._id.startsWith(BOOKMARK_DOC_PREFIX)) as HostDoc<PersistedBookmark>[]))
  const meta = primaryMeta?.data ?? legacyMeta?.data

  // 异步 hydration 期间同步可能继续到达，不能把混合版本认作编辑基线。
  const latest = await readBookmarkDocs()
  assertHostSession()
  if (latest.size !== docs.size || [...docs].some(([id, doc]) => !sameDoc(doc, latest.get(id)))) {
    throw new BookmarkDataPendingError()
  }
  if (groups.length || bookmarks.length || meta) {
    // 仅启动时识别旧版；后续 refresh 必须严格校验，不能反复归一化同步中间态。
    // 缺失 meta 也可能是新版同步尚未到达，不能据此推断为旧版。
    if (allowIncomplete) bookmarkMigrationPending = meta?.schemaVersion === 1
    const snapshot = { groups, bookmarks, activeGroupId: meta?.activeGroupId || '', activeSubGroupId: meta?.activeSubGroupId || '' }
    if (!allowIncomplete) assertBookmarkIntegrity(snapshot)
    bookmarkBaseline = docs
    return snapshot
  }

  bookmarkBaseline = docs
  const legacy = readLegacyJson<BookmarkSnapshot>(LEGACY_KEYS.bookmark)
  if (!legacy || !Array.isArray(legacy.groups) || !Array.isArray(legacy.bookmarks)) return null

  const snapshot: BookmarkSnapshot = {
    groups: clone(legacy.groups),
    bookmarks: clone(legacy.bookmarks),
    activeGroupId: typeof legacy.activeGroupId === 'string' ? legacy.activeGroupId : '',
    activeSubGroupId: typeof legacy.activeSubGroupId === 'string' ? legacy.activeSubGroupId : ''
  }

  // 等 store 完成旧嵌套分组迁移后再保存，不能把尚未规范化的旧结构写回再复读。
  bookmarkMigrationPending = true
  legacyBookmarkStoragePending = true
  return snapshot
}

export interface SaveBookmarkSnapshotResult {
  serialized: string
  dataChanged: boolean
}

const isSamePersistedData = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export const saveBookmarkSnapshot = async (snapshot: BookmarkSnapshot): Promise<SaveBookmarkSnapshotResult> => {
  if (!isUToolsDbAvailable()) {
    throw new Error('uTools db 不可用，无法保存书签')
  }

  assertHostSession()
  assertBookmarkIntegrity(snapshot)
  // 必须使用加载/上次成功保存时的版本。读取最新 _rev 再写旧快照会绕过冲突保护。
  const currentDocs = await readBookmarkDocs()
  assertHostSession()
  assertBookmarkBaseline(currentDocs)
  const baseline = bookmarkBaseline!
  const previousBookmarks = [...baseline.values()].filter(doc => doc._id.startsWith(BOOKMARK_DOC_PREFIX)) as HostDoc<PersistedBookmark>[]
  const previousGroups = [...baseline.values()].filter(doc => doc._id.startsWith(GROUP_DOC_PREFIX)) as HostDoc<PersistedGroup>[]
  const previousMeta = baseline.get(BOOKMARK_META_DOC_ID) as HostDoc<BookmarkMetaDoc> | undefined
  const previousBookmarkMap = new Map(previousBookmarks.map((doc) => [doc._id, doc]))
  const previousGroupMap = new Map(previousGroups.map((doc) => [doc._id, doc]))
  const mutations: HostWriteDoc[] = []
  let dataChanged = false

  for (const [orderIndex, group] of snapshot.groups.entries()) {
    const id = `${GROUP_DOC_PREFIX}${group.id}`
    const data = { ...clone(group), orderIndex } satisfies PersistedGroup
    const previous = previousGroupMap.get(id)
    if (!previous || !isSamePersistedData(previous.data, data)) {
      mutations.push(makeWriteDoc(id, data, previous?._rev))
      dataChanged = true
    }
  }

  for (const bookmark of snapshot.bookmarks) {
    const persistedIcon = await toPersistedIcon(bookmark.icon)
    const persistedBookmark: PersistedBookmark = {
      ...clone(bookmark),
      ...(persistedIcon ? { icon: persistedIcon } : {})
    }
    const id = `${BOOKMARK_DOC_PREFIX}${bookmark.id}`
    const previous = previousBookmarkMap.get(id)
    if (previous) {
      // visits/lastUsed 是本机统计，不属于同步文档：逐字保留旧文档的值，
      // 避免“仅打开书签”在旧 _rev 上写出整条（可能过期的）书签。
      for (const key of ['visits', 'lastUsed'] as const) {
        if (key in previous.data) (persistedBookmark as Record<string, unknown>)[key] = previous.data[key]
        else delete persistedBookmark[key]
      }
    }
    if (!previous || !isSamePersistedData(previous.data, persistedBookmark)) {
      mutations.push(makeWriteDoc(id, persistedBookmark, previous?._rev))
      dataChanged = true
    }
  }

  const previousMetaData = previousMeta?.data
  const metaChanged =
    !previousMetaData ||
    previousMetaData.activeGroupId !== snapshot.activeGroupId ||
    previousMetaData.activeSubGroupId !== snapshot.activeSubGroupId ||
    previousMetaData.schemaVersion !== BOOKMARK_SCHEMA_VERSION
  if (metaChanged) {
    mutations.push(makeWriteDoc(BOOKMARK_META_DOC_ID, {
      activeGroupId: snapshot.activeGroupId,
      activeSubGroupId: snapshot.activeSubGroupId,
      updatedAt: Date.now(),
      schemaVersion: BOOKMARK_SCHEMA_VERSION
    } satisfies BookmarkMetaDoc, previousMeta?._rev))
  }

  const nextGroupIds = new Set(snapshot.groups.map((group) => `${GROUP_DOC_PREFIX}${group.id}`))
  previousGroups.forEach((doc) => {
    if (!nextGroupIds.has(doc._id)) {
      mutations.push({ _id: doc._id, _rev: doc._rev, _deleted: true })
      dataChanged = true
    }
  })

  const nextBookmarkIds = new Set(snapshot.bookmarks.map((bookmark) => `${BOOKMARK_DOC_PREFIX}${bookmark.id}`))
  previousBookmarks.forEach((doc) => {
    if (!nextBookmarkIds.has(doc._id)) {
      mutations.push({ _id: doc._id, _rev: doc._rev, _deleted: true })
      dataChanged = true
    }
  })

  // 图标转换是异步操作，期间同步可能再次到达；提交前重新检查。
  const checkedDocs = await readBookmarkDocs()
  assertHostSession()
  assertBookmarkBaseline(checkedDocs)
  const stages = [
    mutations.filter(doc => !doc._deleted && doc._id.startsWith(BOOKMARK_DOC_PREFIX)),
    mutations.filter(doc => !doc._deleted && !doc._id.startsWith(BOOKMARK_DOC_PREFIX)),
    mutations.filter(doc => doc._deleted)
  ]
  const completed: Array<{ doc: HostWriteDoc; rev: string }> = []
  let exclusivelyConflicted = false
  let failed: Awaited<ReturnType<typeof bulkWriteDocs>> | undefined
  for (const stage of stages) {
    if (!stage.length) continue
    assertHostSession()
    const result = await bulkWriteDocs(stage)
    assertHostSession()
    stage.forEach((doc, index) => {
      const written = result.results[index]
      if (written?.ok === true && !written.error && written.rev) completed.push({ doc, rev: written.rev })
    })
    if (!result.ok || stage.some((_, index) => !result.results[index]?.rev)) {
      failed = result
      exclusivelyConflicted = result.results.length === stage.length && result.results.every(written => written.ok !== true && (written.name === 'conflict' || written.error === 'conflict' || /conflict/i.test(written.message || '')))
      break
    }
  }
  if (failed) {
    // 只补偿已确认由本次操作写成的版本。其他设备的新版本不能被回滚覆盖。
    let restored = true
    for (const { doc, rev } of [...completed].reverse()) {
      const previous = baseline.get(doc._id)
      const undo: HostWriteDoc = previous
        ? { _id: doc._id, _rev: rev, data: clone(previous.data) }
        : { _id: doc._id, _rev: rev, _deleted: true }
      assertHostSession()
      const result = await bulkWriteDocs([undo])
      if (!result.ok) restored = false
    }
    // 仅每项都明确冲突、没有成功/缺失结果时可重放，不能猜测未知写入是否成功。
    if (!completed.length && exclusivelyConflicted) throw new BookmarkSyncConflictError()
    throw new Error(restored ? '批量保存未完成，已补偿可确认的写入，未知结果需核对；本机编辑已保留。' : '批量保存未完成且存在后续修改，已停止写入并保留本机编辑，请通过恢复副本核对。')
  }
  for (const { doc, rev } of completed) {
    if (doc._deleted) baseline.delete(doc._id)
    else baseline.set(doc._id, { _id: doc._id, _rev: rev, data: clone(doc.data) })
  }
  // 附件按内容寻址，其他设备/尚未到齐的文档可能仍引用，保存快照时不做跨设备 GC。
  if (bookmarkMigrationPending) {
    bookmarkMigrationPending = false
    if (legacyBookmarkStoragePending) {
      legacyBookmarkStoragePending = false
      cleanupLegacyKeySet(LEGACY_KEYS.bookmark)
    }
  }

  return { serialized: JSON.stringify(snapshot), dataChanged }
}

const toPersistedIconSync = (icon?: IconSource): PersistedIconSource | undefined => {
  if (!icon) return undefined
  if (icon.type === 'remote') {
    const next: BookmarkIconRef = { ...icon }
    const cachedRef = typeof icon.cache === 'string' && isDataUrl(icon.cache)
      ? attachmentRefCache.get(icon.cache)
      : undefined
    if (cachedRef) {
      delete next.cache
      next.cacheRef = cachedRef
      return next
    }
    if (next.cacheRef?.startsWith(ATTACHMENT_REF_PREFIX) && !isDataUrl(next.cache || '')) {
      delete next.cache
      return next
    }
    return clone(next)
  }
  if (icon.type === 'custom') {
    const next: BookmarkCustomIconRef = { ...icon }
    const cachedRef = typeof icon.data === 'string' && isDataUrl(icon.data)
      ? attachmentRefCache.get(icon.data)
      : undefined
    if (cachedRef) {
      delete next.data
      next.dataRef = cachedRef
      return next
    }
    if (next.dataRef?.startsWith(ATTACHMENT_REF_PREFIX) && !isDataUrl(next.data || '')) {
      delete next.data
      return next
    }
    return clone(next)
  }
  return clone(icon)
}

/**
 * 退出/失焦路径专用同步落盘：
 * 在 onPluginOut / pagehide / beforeunload 时绕过异步微任务与防抖等待，直接同步写入 uTools DB，
 * 避免用户刚添加完书签就按 Esc 或关闭插件导致异步保存被宿主中断而丢数据。
 */
export const saveBookmarkSnapshotSync = (snapshot: BookmarkSnapshot): SaveBookmarkSnapshotResult => {
  if (!isUToolsDbAvailable()) {
    throw new Error('uTools db 不可用，无法保存书签')
  }

  assertHostSession()
  assertBookmarkIntegrity(snapshot)
  const currentDocs = readBookmarkDocsSync()
  assertHostSession()
  assertBookmarkBaseline(currentDocs)
  const baseline = bookmarkBaseline!
  const previousBookmarks = [...baseline.values()].filter(doc => doc._id.startsWith(BOOKMARK_DOC_PREFIX)) as HostDoc<PersistedBookmark>[]
  const previousGroups = [...baseline.values()].filter(doc => doc._id.startsWith(GROUP_DOC_PREFIX)) as HostDoc<PersistedGroup>[]
  const previousMeta = baseline.get(BOOKMARK_META_DOC_ID) as HostDoc<BookmarkMetaDoc> | undefined
  const previousBookmarkMap = new Map(previousBookmarks.map((doc) => [doc._id, doc]))
  const previousGroupMap = new Map(previousGroups.map((doc) => [doc._id, doc]))
  const mutations: HostWriteDoc[] = []
  let dataChanged = false

  for (const [orderIndex, group] of snapshot.groups.entries()) {
    const id = `${GROUP_DOC_PREFIX}${group.id}`
    const data = { ...clone(group), orderIndex } satisfies PersistedGroup
    const previous = previousGroupMap.get(id)
    if (!previous || !isSamePersistedData(previous.data, data)) {
      mutations.push(makeWriteDoc(id, data, previous?._rev))
      dataChanged = true
    }
  }

  for (const bookmark of snapshot.bookmarks) {
    const persistedIcon = toPersistedIconSync(bookmark.icon)
    const persistedBookmark: PersistedBookmark = {
      ...clone(bookmark),
      ...(persistedIcon ? { icon: persistedIcon } : {})
    }
    const id = `${BOOKMARK_DOC_PREFIX}${bookmark.id}`
    const previous = previousBookmarkMap.get(id)
    if (previous) {
      for (const key of ['visits', 'lastUsed'] as const) {
        if (key in previous.data) (persistedBookmark as Record<string, unknown>)[key] = previous.data[key]
        else delete persistedBookmark[key]
      }
    }
    if (!previous || !isSamePersistedData(previous.data, persistedBookmark)) {
      mutations.push(makeWriteDoc(id, persistedBookmark, previous?._rev))
      dataChanged = true
    }
  }

  const previousMetaData = previousMeta?.data
  const metaChanged =
    !previousMetaData ||
    previousMetaData.activeGroupId !== snapshot.activeGroupId ||
    previousMetaData.activeSubGroupId !== snapshot.activeSubGroupId ||
    previousMetaData.schemaVersion !== BOOKMARK_SCHEMA_VERSION
  if (metaChanged) {
    mutations.push(makeWriteDoc(BOOKMARK_META_DOC_ID, {
      activeGroupId: snapshot.activeGroupId,
      activeSubGroupId: snapshot.activeSubGroupId,
      updatedAt: Date.now(),
      schemaVersion: BOOKMARK_SCHEMA_VERSION
    } satisfies BookmarkMetaDoc, previousMeta?._rev))
  }

  const nextGroupIds = new Set(snapshot.groups.map((group) => `${GROUP_DOC_PREFIX}${group.id}`))
  previousGroups.forEach((doc) => {
    if (!nextGroupIds.has(doc._id)) {
      mutations.push({ _id: doc._id, _rev: doc._rev, _deleted: true })
      dataChanged = true
    }
  })

  const nextBookmarkIds = new Set(snapshot.bookmarks.map((bookmark) => `${BOOKMARK_DOC_PREFIX}${bookmark.id}`))
  previousBookmarks.forEach((doc) => {
    if (!nextBookmarkIds.has(doc._id)) {
      mutations.push({ _id: doc._id, _rev: doc._rev, _deleted: true })
      dataChanged = true
    }
  })

  const stages = [
    mutations.filter(doc => !doc._deleted && doc._id.startsWith(BOOKMARK_DOC_PREFIX)),
    mutations.filter(doc => !doc._deleted && !doc._id.startsWith(BOOKMARK_DOC_PREFIX)),
    mutations.filter(doc => doc._deleted)
  ]
  const completed: Array<{ doc: HostWriteDoc; rev: string }> = []
  let exclusivelyConflicted = false
  let failed: ReturnType<typeof bulkWriteDocsSync> | undefined
  for (const stage of stages) {
    if (!stage.length) continue
    assertHostSession()
    const result = bulkWriteDocsSync(stage)
    assertHostSession()
    stage.forEach((doc, index) => {
      const written = result.results[index]
      if (written?.ok === true && !written.error && written.rev) completed.push({ doc, rev: written.rev })
    })
    if (!result.ok || stage.some((_, index) => !result.results[index]?.rev)) {
      failed = result
      exclusivelyConflicted = result.results.length === stage.length && result.results.every(written => written.ok !== true && (written.name === 'conflict' || written.error === 'conflict' || /conflict/i.test(written.message || '')))
      break
    }
  }
  if (failed) {
    let restored = true
    for (const { doc, rev } of [...completed].reverse()) {
      const previous = baseline.get(doc._id)
      const undo: HostWriteDoc = previous
        ? { _id: doc._id, _rev: rev, data: clone(previous.data) }
        : { _id: doc._id, _rev: rev, _deleted: true }
      assertHostSession()
      const result = bulkWriteDocsSync([undo])
      if (!result.ok) restored = false
    }
    if (!completed.length && exclusivelyConflicted) throw new BookmarkSyncConflictError()
    throw new Error(restored ? '同步保存未完成，已补偿可确认的写入；本机编辑已保留。' : '同步保存未完成且存在后续修改，已停止写入并保留本机编辑。')
  }
  for (const { doc, rev } of completed) {
    if (doc._deleted) baseline.delete(doc._id)
    else baseline.set(doc._id, { _id: doc._id, _rev: rev, data: clone(doc.data) })
  }
  if (bookmarkMigrationPending) {
    bookmarkMigrationPending = false
    if (legacyBookmarkStoragePending) {
      legacyBookmarkStoragePending = false
      cleanupLegacyKeySet(LEGACY_KEYS.bookmark)
    }
  }

  return { serialized: JSON.stringify(snapshot), dataChanged }
}

export const loadSettingsSnapshot = (): Partial<SettingsState> | null => {
  if (!isUToolsDbAvailable()) return null

  const persisted = getDoc<Partial<SettingsState>>(SETTINGS_DOC_ID)?.data
  if (persisted && typeof persisted === 'object') return clone(persisted)

  const legacy = readLegacyJson<Partial<SettingsState>>(LEGACY_KEYS.settings)
  if (!legacy || typeof legacy !== 'object') return null

  saveSettingsSnapshot(legacy)
  cleanupLegacyKeySet(LEGACY_KEYS.settings)
  return clone(legacy)
}

export const loadSettingsSnapshotAsync = async (): Promise<Partial<SettingsState> | null> => {
  if (!isUToolsDbAvailable()) return null

  const persisted = (await getDocAsync<Partial<SettingsState>>(SETTINGS_DOC_ID))?.data
  if (persisted && typeof persisted === 'object') return clone(persisted)

  const legacy = readLegacyJson<Partial<SettingsState>>(LEGACY_KEYS.settings)
  if (!legacy || typeof legacy !== 'object') return null

  saveSettingsSnapshot(legacy)
  cleanupLegacyKeySet(LEGACY_KEYS.settings)
  return clone(legacy)
}

export const saveSettingsSnapshot = (settings: Partial<SettingsState>): string => {
  if (!isUToolsDbAvailable()) {
    throw new Error('uTools db 不可用，无法保存设置')
  }
  const result = putDocWithRetry(SETTINGS_DOC_ID, clone(settings))
  if (result.ok === false) {
    throw new Error('保存设置失败')
  }
  return JSON.stringify(settings)
}
