import type { Bookmark, Group, IconSource } from '@/types/bookmark'
import type { SettingsState } from '@/stores/settings'
import {
  allDocs,
  getAttachment,
  getAttachmentType,
  getDbStorage,
  getDoc,
  isUToolsDbAvailable,
  postAttachment,
  putDocWithRetry,
  removeDoc
} from '@/lib/utoolsDb'

const BOOKMARK_DOC_PREFIX = 'gm:bookmark:'
const GROUP_DOC_PREFIX = 'gm:group:'
const ICON_ATTACHMENT_PREFIX = 'gm:icon/'
const LEGACY_BOOKMARK_META_DOC_ID = 'gm:bookmark:meta'
const BOOKMARK_META_DOC_ID = 'gm:meta:bookmark'
const SETTINGS_DOC_ID = 'gm:settings'
const STORAGE_DOC_PREFIX = 'gm:storage:'
const LEGACY_FALLBACK_DOC_PREFIX = 'goose-marks:storage:'

const LEGACY_KEYS = {
  bookmark: 'bookmark',
  settings: 'settings'
} as const

const ATTACHMENT_REF_PREFIX = 'att:'

type BookmarkIconRef = Extract<IconSource, { type: 'remote' }> & { cacheRef?: string }
type BookmarkCustomIconRef = Extract<IconSource, { type: 'custom' }> & { dataRef?: string }

type PersistedIconSource =
  | Extract<IconSource, { type: 'file' }>
  | Extract<IconSource, { type: 'text' }>
  | BookmarkIconRef
  | BookmarkCustomIconRef

type PersistedBookmark = Omit<Bookmark, 'icon'> & { icon?: PersistedIconSource }

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
  const blob = new Blob([bytes], { type: mimeType })
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

  return `${ATTACHMENT_REF_PREFIX}${attachmentId}`
}

const extractAttachmentId = (ref: string | undefined): string | null => {
  if (!ref?.startsWith(ATTACHMENT_REF_PREFIX)) return null
  return ref.slice(ATTACHMENT_REF_PREFIX.length)
}

const collectAttachmentIdsFromPersistedIcon = (icon?: PersistedIconSource): string[] => {
  if (!icon) return []
  const refs: string[] = []
  if (icon.type === 'remote') {
    const id = extractAttachmentId(icon.cacheRef)
    if (id) refs.push(id)
  }
  if (icon.type === 'custom') {
    const id = extractAttachmentId(icon.dataRef)
    if (id) refs.push(id)
  }
  return refs
}

const toPersistedIcon = async (icon?: IconSource): Promise<PersistedIconSource | undefined> => {
  if (!icon) return undefined
  if (icon.type === 'remote') {
    const next: BookmarkIconRef = { ...icon }
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
      return { ...icon, cache: dataUrl || icon.cache, cacheRef: undefined } as IconSource
    }
    return clone(icon) as IconSource
  }
  if (icon.type === 'custom') {
    if (icon.dataRef) {
      const dataUrl = await readAttachmentAsDataUrl(icon.dataRef.slice(ATTACHMENT_REF_PREFIX.length))
      return { ...icon, data: dataUrl || icon.data || '', dataRef: undefined } as IconSource
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

const loadPersistedBookmarks = async (): Promise<Bookmark[]> => {
  const docs = allDocs<PersistedBookmark>(BOOKMARK_DOC_PREFIX)
  const hydrated = await Promise.all(
    docs.filter(isPersistedBookmarkDoc).map(async (doc) => {
      const icon = await hydrateIcon(doc.data.icon)
      return { ...clone(doc.data), icon }
    })
  )
  return hydrated
}

const loadPersistedGroups = (): Group[] => allDocs<Group>(GROUP_DOC_PREFIX).map((doc) => clone(doc.data))

export const loadBookmarkSnapshot = async (): Promise<BookmarkSnapshot | null> => {
  if (!isUToolsDbAvailable()) return null

  const meta = getDoc<BookmarkMetaDoc>(BOOKMARK_META_DOC_ID)?.data ?? getDoc<BookmarkMetaDoc>(LEGACY_BOOKMARK_META_DOC_ID)?.data
  const groups = loadPersistedGroups()
  const bookmarks = await loadPersistedBookmarks()

  if (groups.length || bookmarks.length) {
    return {
      groups,
      bookmarks,
      activeGroupId: meta?.activeGroupId || '',
      activeSubGroupId: meta?.activeSubGroupId || ''
    }
  }

  const legacy = readLegacyJson<BookmarkSnapshot>(LEGACY_KEYS.bookmark)
  if (!legacy || !Array.isArray(legacy.groups) || !Array.isArray(legacy.bookmarks)) return null

  const snapshot: BookmarkSnapshot = {
    groups: clone(legacy.groups),
    bookmarks: clone(legacy.bookmarks),
    activeGroupId: typeof legacy.activeGroupId === 'string' ? legacy.activeGroupId : '',
    activeSubGroupId: typeof legacy.activeSubGroupId === 'string' ? legacy.activeSubGroupId : ''
  }

  await saveBookmarkSnapshot(snapshot)
  cleanupLegacyKeySet(LEGACY_KEYS.bookmark)
  return snapshot
}

export const saveBookmarkSnapshot = async (snapshot: BookmarkSnapshot): Promise<string> => {
  if (!isUToolsDbAvailable()) {
    throw new Error('uTools db 不可用，无法保存书签')
  }

  const previousBookmarks = allDocs<PersistedBookmark>(BOOKMARK_DOC_PREFIX)
  const previousGroups = allDocs<Group>(GROUP_DOC_PREFIX)
  const previousAttachmentIds = new Set<string>()
  previousBookmarks.forEach((doc) => {
    collectAttachmentIdsFromPersistedIcon(doc.data.icon).forEach((id) => previousAttachmentIds.add(id))
  })

  const nextAttachmentIds = new Set<string>()
  for (const group of snapshot.groups) {
    const result = putDocWithRetry(`${GROUP_DOC_PREFIX}${group.id}`, clone(group))
    if (result.ok === false) {
      throw new Error(`保存分组失败: ${group.id}`)
    }
  }

  for (const bookmark of snapshot.bookmarks) {
    const persistedIcon = await toPersistedIcon(bookmark.icon)
    collectAttachmentIdsFromPersistedIcon(persistedIcon).forEach((id) => nextAttachmentIds.add(id))
    const persistedBookmark: PersistedBookmark = {
      ...clone(bookmark),
      ...(persistedIcon ? { icon: persistedIcon } : {})
    }
    const result = putDocWithRetry(`${BOOKMARK_DOC_PREFIX}${bookmark.id}`, persistedBookmark)
    if (result.ok === false) {
      throw new Error(`保存书签失败: ${bookmark.id}`)
    }
  }

  const metaResult = putDocWithRetry(BOOKMARK_META_DOC_ID, {
    activeGroupId: snapshot.activeGroupId,
    activeSubGroupId: snapshot.activeSubGroupId,
    updatedAt: Date.now(),
    schemaVersion: 1
  } satisfies BookmarkMetaDoc)
  if (metaResult.ok === false) {
    throw new Error('保存书签元数据失败')
  }
  removeDoc(LEGACY_BOOKMARK_META_DOC_ID)

  const nextGroupIds = new Set(snapshot.groups.map((group) => `${GROUP_DOC_PREFIX}${group.id}`))
  previousGroups.forEach((doc) => {
    if (!nextGroupIds.has(doc._id)) removeDoc(doc._id)
  })

  const nextBookmarkIds = new Set(snapshot.bookmarks.map((bookmark) => `${BOOKMARK_DOC_PREFIX}${bookmark.id}`))
  previousBookmarks.forEach((doc) => {
    if (!nextBookmarkIds.has(doc._id)) removeDoc(doc._id)
  })

  previousAttachmentIds.forEach((id) => {
    if (!nextAttachmentIds.has(id)) {
      removeDoc(id)
    }
  })

  return JSON.stringify(snapshot)
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
