import type { Bookmark, Group, IconSource } from '@/types/bookmark'
import type { SettingsState } from '@/stores/settings'
import {
  allDocsAsyncStrict,
  bulkWriteDocs,
  getAttachment,
  getAttachmentType,
  getDbStorage,
  getDoc,
  getDocAsyncStrict,
  isUToolsDbAvailable,
  postAttachment,
  putDoc,
  putDocWithRetry,
  removeDoc,
  type HostWriteDoc
} from '@/lib/utoolsDb'
import {
  BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
  parseBookmarkSnapshotEnvelope,
  type BookmarkSnapshotEnvelope,
} from '@/lib/bookmarkSnapshotProtocol'
import {
  parseLocalMirrorRecoverySnapshot,
  type LocalMirrorRecoverySnapshot,
} from '@/lib/localMirrorRecovery'

const BOOKMARK_SNAPSHOT_DOC_PREFIX = 'gm:bookmark-snapshot:'
const RECOVERY_BOOKMARK_DOC_PREFIX = 'gm:bookmark:'
const RECOVERY_GROUP_DOC_PREFIX = 'gm:group:'
const RECOVERY_META_DOC_ID = 'gm:bookmark:meta'
const RECOVERY_COMPLETED_DOC_ID = 'gm:bookmark-recovery:completed:v2'
const LOCAL_MIRROR_RECOVERY_COMPLETED_DOC_ID = 'gm:bookmark-recovery:local-mirror-v1'
const ICON_ATTACHMENT_PREFIX = 'gm:icon/'
const BOOKMARK_META_DOC_ID = 'gm:meta:bookmark'
const ROLLBACK_RECOVERY_META_DOC_ID = 'gm:meta:bookmark:v2'
const SETTINGS_DOC_ID = 'gm:settings'
const STORAGE_DOC_PREFIX = 'gm:storage:'
const LEGACY_FALLBACK_DOC_PREFIX = 'goose-marks:storage:'

const LEGACY_KEYS = {
  settings: 'settings'
} as const

const ATTACHMENT_REF_PREFIX = 'att:'
const ICON_HYDRATE_CONCURRENCY = 8
const attachmentRefCache = new Map<string, string>()

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
  schemaVersion: typeof BOOKMARK_SNAPSHOT_SCHEMA_VERSION
  revision: number
  snapshotId: string
  groupCount: number
  bookmarkCount: number
  previousSnapshotId?: string
}

interface BookmarkRecoveryCompletedDoc {
  completedAt: number
  revision: number
  snapshotId: string
}

export type BookmarkSnapshot = BookmarkSnapshotEnvelope

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

const readAttachmentAsDataUrl = async (attachmentId: string): Promise<string | null> => {
  const bytes = getAttachment(attachmentId)
  if (!bytes) return null
  const mimeType = getAttachmentType(attachmentId) || 'image/png'
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  const blob = new Blob([arrayBuffer], { type: mimeType })
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
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

  if (!getAttachment(attachmentId)) {
    const result = postAttachment(attachmentId, new Uint8Array(arrayBuffer), blob.type || 'image/png')
    if (result.ok === false) {
      console.error('[stateRepository] 保存图标 attachment 失败:', attachmentId, result.error)
      return null
    }
  }

  const ref = `${ATTACHMENT_REF_PREFIX}${attachmentId}`
  attachmentRefCache.set(dataUrl, ref)
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
      if (cacheRef) {
        delete next.cache
        next.cacheRef = cacheRef
      }
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
      if (dataRef) {
        delete next.data
        next.dataRef = dataRef
      }
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
  typeof doc.data?.id === 'string' &&
  typeof doc.data?.url === 'string' &&
  typeof doc.data?.title === 'string'

const snapshotDocPrefix = (snapshotId: string): string => `${BOOKMARK_SNAPSHOT_DOC_PREFIX}${snapshotId}:`
const snapshotGroupPrefix = (snapshotId: string): string => `${snapshotDocPrefix(snapshotId)}group:`
const snapshotBookmarkPrefix = (snapshotId: string): string => `${snapshotDocPrefix(snapshotId)}bookmark:`

const removeSnapshotDocs = async (snapshotId: string): Promise<void> => {
  if (!snapshotId) return
  const docs = await allDocsAsyncStrict(snapshotDocPrefix(snapshotId))
  if (docs.length === 0) return
  await bulkWriteDocs(docs.map((doc) => ({ _id: doc._id, _rev: doc._rev, _deleted: true })))
}

const loadPersistedBookmarksByPrefix = async (prefix: string): Promise<Bookmark[]> => {
  const docs = (await allDocsAsyncStrict<PersistedBookmark>(prefix))
    .filter(isPersistedBookmarkDoc)
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

const loadPersistedGroupsByPrefix = async (prefix: string): Promise<Group[]> =>
  (await allDocsAsyncStrict<PersistedGroup>(prefix))
    .map((doc, fallbackIndex) => ({ ...clone(doc.data), fallbackIndex }))
    .sort((a, b) => {
      const aOrder = typeof a.orderIndex === 'number' ? a.orderIndex : Number.POSITIVE_INFINITY
      const bOrder = typeof b.orderIndex === 'number' ? b.orderIndex : Number.POSITIVE_INFINITY
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt
      return a.fallbackIndex - b.fallbackIndex
    })
    .map(({ fallbackIndex: _fallbackIndex, ...group }) => group)

const loadPersistedBookmarks = (snapshotId: string): Promise<Bookmark[]> =>
  loadPersistedBookmarksByPrefix(snapshotBookmarkPrefix(snapshotId))

const loadPersistedGroups = (snapshotId: string): Promise<Group[]> =>
  loadPersistedGroupsByPrefix(snapshotGroupPrefix(snapshotId))

const isCurrentBookmarkMeta = (meta: Partial<BookmarkMetaDoc> | null | undefined): meta is BookmarkMetaDoc =>
  meta?.schemaVersion === BOOKMARK_SNAPSHOT_SCHEMA_VERSION &&
  Number.isSafeInteger(meta.revision) &&
  Number(meta.revision) >= 1 &&
  typeof meta.snapshotId === 'string' &&
  meta.snapshotId.length > 0 &&
  Number.isSafeInteger(meta.groupCount) &&
  Number.isSafeInteger(meta.bookmarkCount)

export const loadBookmarkSnapshot = async (): Promise<BookmarkSnapshot | null> => {
  if (!isUToolsDbAvailable()) return null

  const currentMetaDoc = await getDocAsyncStrict<Partial<BookmarkMetaDoc>>(BOOKMARK_META_DOC_ID)
  const currentMeta = currentMetaDoc?.data
  let meta: BookmarkMetaDoc
  let needsRollbackMigration = false
  if (isCurrentBookmarkMeta(currentMeta)) {
    meta = currentMeta
  } else {
    const rollbackMetaDoc = await getDocAsyncStrict<Partial<BookmarkMetaDoc>>(ROLLBACK_RECOVERY_META_DOC_ID)
    if (!isCurrentBookmarkMeta(rollbackMetaDoc?.data)) return null
    meta = rollbackMetaDoc.data
    needsRollbackMigration = true
  }

  const [groups, bookmarks] = await Promise.all([
    loadPersistedGroups(meta.snapshotId),
    loadPersistedBookmarks(meta.snapshotId),
  ])
  if (groups.length !== meta.groupCount || bookmarks.length !== meta.bookmarkCount) {
    throw new Error(`书签快照不完整: revision=${meta.revision}`)
  }
  const loaded: BookmarkSnapshot = {
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: meta.revision,
    snapshotId: meta.snapshotId,
    groups,
    bookmarks,
    activeGroupId: meta.activeGroupId,
    activeSubGroupId: meta.activeSubGroupId,
  }
  const validated = parseBookmarkSnapshotEnvelope(JSON.stringify(loaded))
  if (!validated) throw new Error(`书签快照格式损坏: revision=${meta.revision}`)

  if (needsRollbackMigration) {
    const migratedMeta: BookmarkMetaDoc = {
      ...meta,
      activeGroupId: validated.activeGroupId,
      activeSubGroupId: validated.activeSubGroupId,
      updatedAt: Date.now(),
      groupCount: validated.groups.length,
      bookmarkCount: validated.bookmarks.length,
    }
    const result = putDoc(BOOKMARK_META_DOC_ID, migratedMeta, currentMetaDoc?._rev)
    if (result.ok === false || result.error === true) {
      throw new Error('完整书签快照已找到，但撤回遗留指针回迁失败；已禁止 seed 写入')
    }
  }
  return validated
}

/**
 * 一次性事故恢复入口：读取被 schema v2 忽略、但从未删除的原分组/书签文档。
 * recoveryCompleted 写入后永久关闭，避免以后用历史副本反向覆盖。
 */
export const loadRecoverableBookmarkSnapshot = async (): Promise<BookmarkSnapshot | null> => {
  if (!isUToolsDbAvailable()) return null

  const completed = await getDocAsyncStrict<BookmarkRecoveryCompletedDoc>(RECOVERY_COMPLETED_DOC_ID)
  if (completed) return null

  const currentMetaDoc = await getDocAsyncStrict<BookmarkMetaDoc>(BOOKMARK_META_DOC_ID)
  const currentMeta = currentMetaDoc?.data

  const [groups, bookmarks, recoveryMetaDoc] = await Promise.all([
    loadPersistedGroupsByPrefix(RECOVERY_GROUP_DOC_PREFIX),
    loadPersistedBookmarksByPrefix(RECOVERY_BOOKMARK_DOC_PREFIX),
    getDocAsyncStrict<Partial<BookmarkMetaDoc>>(RECOVERY_META_DOC_ID),
  ])
  if (groups.length === 0) return null

  const recoveryMeta = recoveryMetaDoc?.data
  const candidate: BookmarkSnapshot = {
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: Math.max(1, currentMeta?.schemaVersion === BOOKMARK_SNAPSHOT_SCHEMA_VERSION ? currentMeta.revision : 0),
    snapshotId: currentMeta?.schemaVersion === BOOKMARK_SNAPSHOT_SCHEMA_VERSION
      ? currentMeta.snapshotId
      : 'recovery-source',
    groups,
    bookmarks,
    activeGroupId: typeof recoveryMeta?.activeGroupId === 'string' ? recoveryMeta.activeGroupId : '',
    activeSubGroupId: typeof recoveryMeta?.activeSubGroupId === 'string' ? recoveryMeta.activeSubGroupId : '',
  }
  const validated = parseBookmarkSnapshotEnvelope(JSON.stringify(candidate))
  if (!validated) throw new Error('原书签文档仍存在，但格式校验失败；已停止自动恢复和写入')
  return validated
}

/** 固定路径本地镜像恢复；校验失败会抛错并阻止启动写入。 */
export const loadLocalMirrorRecoverySnapshot = async (
  options: { retryCompletedRecovery?: boolean } = {},
): Promise<LocalMirrorRecoverySnapshot | null> => {
  if (!isUToolsDbAvailable()) return null
  const completed = await getDocAsyncStrict<BookmarkRecoveryCompletedDoc>(LOCAL_MIRROR_RECOVERY_COMPLETED_DOC_ID)
  if (completed && options.retryCompletedRecovery !== true) return null

  const result = window.gooseBookmarkRecovery?.readLocalMirrorSnapshot()
  if (!result || result.ok === false) return null
  const recovered = await parseLocalMirrorRecoverySnapshot(result.raw)
  if (!recovered) throw new Error('找到本地书签镜像，但完整性校验失败；已停止恢复和写入')
  return recovered
}

export interface SaveBookmarkSnapshotResult {
  serialized: string
  dataChanged: boolean
  snapshot: BookmarkSnapshot
}

export class BookmarkRevisionConflictError extends Error {
  constructor(public readonly expectedRevision: number, public readonly actualRevision: number) {
    super(`书签 revision 冲突: expected=${expectedRevision}, actual=${actualRevision}`)
    this.name = 'BookmarkRevisionConflictError'
  }
}

const createSnapshotId = (): string => {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${random}`
}

export const saveBookmarkSnapshot = async (
  snapshot: BookmarkSnapshot,
  expectedRevision: number,
  options?: {
    markRecoveryCompleted?: boolean
    markLocalMirrorRecoveryCompleted?: boolean
  },
): Promise<SaveBookmarkSnapshotResult> => {
  if (!isUToolsDbAvailable()) {
    throw new Error('uTools db 不可用，无法保存书签')
  }
  if (!Array.isArray(snapshot.groups) || snapshot.groups.length === 0) {
    throw new Error('拒绝保存空分组快照，防止覆盖已有书签数据')
  }
  const inputValidated = parseBookmarkSnapshotEnvelope(JSON.stringify({
    ...snapshot,
    revision: Math.max(1, snapshot.revision),
    snapshotId: snapshot.snapshotId || 'local-uncommitted',
  }))
  if (!inputValidated) throw new Error('拒绝保存格式不完整的书签快照')

  const previousMeta = await getDocAsyncStrict<BookmarkMetaDoc>(BOOKMARK_META_DOC_ID)
  const actualRevision = previousMeta?.data?.schemaVersion === BOOKMARK_SNAPSHOT_SCHEMA_VERSION
    ? previousMeta.data.revision
    : 0
  if (actualRevision !== expectedRevision) {
    throw new BookmarkRevisionConflictError(expectedRevision, actualRevision)
  }

  const snapshotId = createSnapshotId()
  const nextRevision = actualRevision + 1
  const mutations: HostWriteDoc[] = []

  for (const [orderIndex, group] of snapshot.groups.entries()) {
    mutations.push({
      _id: `${snapshotGroupPrefix(snapshotId)}${group.id}`,
      data: { ...clone(group), orderIndex } satisfies PersistedGroup,
    })
  }

  for (const bookmark of snapshot.bookmarks) {
    const persistedIcon = await toPersistedIcon(bookmark.icon)
    const persistedBookmark: PersistedBookmark = {
      ...clone(bookmark),
      ...(persistedIcon ? { icon: persistedIcon } : {})
    }
    mutations.push({ _id: `${snapshotBookmarkPrefix(snapshotId)}${bookmark.id}`, data: persistedBookmark })
  }

  const writeResult = await bulkWriteDocs(mutations)
  if (!writeResult.ok) {
    throw new Error(`保存书签数据失败: ${writeResult.failedIds.join(', ')}`)
  }

  const committed: BookmarkSnapshot = {
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: nextRevision,
    snapshotId,
    groups: clone(snapshot.groups),
    bookmarks: clone(snapshot.bookmarks),
    activeGroupId: snapshot.activeGroupId,
    activeSubGroupId: snapshot.activeSubGroupId,
  }
  const metaWrite = putDoc(BOOKMARK_META_DOC_ID, {
    activeGroupId: committed.activeGroupId,
    activeSubGroupId: committed.activeSubGroupId,
    updatedAt: Date.now(),
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: nextRevision,
    snapshotId,
    groupCount: committed.groups.length,
    bookmarkCount: committed.bookmarks.length,
    previousSnapshotId: previousMeta?.data?.snapshotId,
  } satisfies BookmarkMetaDoc, previousMeta?._rev)
  if (metaWrite.ok === false || metaWrite.error === true) {
    const latest = await getDocAsyncStrict<BookmarkMetaDoc>(BOOKMARK_META_DOC_ID)
    const latestRevision = latest?.data?.schemaVersion === BOOKMARK_SNAPSHOT_SCHEMA_VERSION
      ? latest.data.revision
      : 0
    void removeSnapshotDocs(snapshotId).catch(() => {})
    if (latestRevision === expectedRevision) {
      throw new Error('提交书签 meta 失败，快照未生效')
    }
    throw new BookmarkRevisionConflictError(expectedRevision, latestRevision)
  }

  if (options?.markRecoveryCompleted === true) {
    const existingMarker = await getDocAsyncStrict<BookmarkRecoveryCompletedDoc>(RECOVERY_COMPLETED_DOC_ID)
    if (!existingMarker) {
      const markerWrite = putDoc(RECOVERY_COMPLETED_DOC_ID, {
        completedAt: Date.now(),
        revision: committed.revision,
        snapshotId: committed.snapshotId,
      } satisfies BookmarkRecoveryCompletedDoc)
      if (markerWrite.ok === false || markerWrite.error === true) {
        throw new Error('真实书签已恢复，但恢复标记写入失败；将安全重试')
      }
    }
  }
  if (options?.markLocalMirrorRecoveryCompleted === true) {
    const existingMarker = await getDocAsyncStrict<BookmarkRecoveryCompletedDoc>(LOCAL_MIRROR_RECOVERY_COMPLETED_DOC_ID)
    if (!existingMarker) {
      const markerWrite = putDoc(LOCAL_MIRROR_RECOVERY_COMPLETED_DOC_ID, {
        completedAt: Date.now(),
        revision: committed.revision,
        snapshotId: committed.snapshotId,
      } satisfies BookmarkRecoveryCompletedDoc)
      if (markerWrite.ok === false || markerWrite.error === true) {
        throw new Error('本地镜像已恢复，但恢复标记写入失败；将安全重试')
      }
    }
  }

  const obsoleteSnapshotId = previousMeta?.data?.previousSnapshotId
  if (obsoleteSnapshotId) void removeSnapshotDocs(obsoleteSnapshotId).catch(() => {})

  return { serialized: JSON.stringify(committed), dataChanged: true, snapshot: committed }
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
