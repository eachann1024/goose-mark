import { syncBookmarkLocations } from '@/hooks/useImportExport'
import { getPersistentItem, removePersistentItem, utoolsStorage } from '@/lib/utoolsStorage'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import type { Bookmark, Group, SubGroup } from '@/types/bookmark'

/**
 * 本地数据镜像（文件 / localStorage 双写 + 外部变更监听 + 冲突合并）（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue composable 内绝大多数为框架无关纯函数 + 模块级单例可变量。React 版改动点：
 *   - useSettingsStore.getState()/useBookmarkStore.getState() as MirrorStore → .getState()（回调内取最新值）。
 *   - start() 里的 Vue watch(deep) → useBookmarkStore.subscribe()，退订函数存为 stopHandle。
 *   - store.$patch(...) → store.setData(...)（业务阶段方法）；store.loadFromSnapshot 同为业务阶段方法。
 * 无埋点。useLocalDataMirror 仍是一个返回命令式操作集合的 hook，内部不持有 React state，
 * start/stop 等由调用方在副作用中驱动。
 */

// bookmark store 状态类型（含业务阶段方法 setData / loadFromSnapshot / refreshMissingIcons）
type MirrorStore = ReturnType<typeof useBookmarkStore.getState> & {
  loadFromSnapshot?: (data: { groups: Group[]; bookmarks: Bookmark[] }, replace?: boolean) => void
  setData: (state: Partial<{ groups: Group[]; bookmarks: Bookmark[]; activeGroupId: string; activeSubGroupId: string }>) => void
  refreshMissingIcons: () => void | Promise<void>
}

type MirrorPayload = {
  schemaVersion: string
  generatedAt: string
  revision: number
  data: {
    groups: Group[]
    bookmarks: Bookmark[]
  }
  meta: {
    recordCount: number
    checksum: string
    writerClientId?: string
    writtenAt?: number
  }
}

type MirrorData = {
  groups: Group[]
  bookmarks: Bookmark[]
}

type MirrorValidationResult = {
  ok: boolean
  reason?: string
}

type MergeContext = {
  incomingRevision: number
  incomingWriterClientId: string
  localRevision: number
  localWriterClientId: string
}

type NodeLikeStats = {
  mtimeMs?: number
  size?: number
}

type NodeLikeFs = {
  existsSync: (path: string) => boolean
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void
  readFileSync: (path: string, encoding: string) => string
  writeFileSync: (path: string, data: string, encoding?: string) => void
  renameSync: (oldPath: string, newPath: string) => void
  watchFile?: (path: string, options: { interval: number }, listener: (curr: NodeLikeStats, prev: NodeLikeStats) => void) => void
  unwatchFile?: (path: string, listener?: (curr: NodeLikeStats, prev: NodeLikeStats) => void) => void
  statSync?: (path: string) => { isDirectory?: () => boolean }
}

type NodeLikePath = {
  join: (...parts: string[]) => string
}

type NodeLikeCrypto = {
  createHash: (algorithm: string) => {
    update: (data: string) => { digest: (encoding: 'hex') => string }
  }
}

type NodeLikeOs = {
  platform?: () => string
}

type BrowserDirectoryHandleLike = {
  name?: string
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
  }>
}

type GroupLike = Group & Record<string, any>
type SubGroupLike = SubGroup & Record<string, any>
type BookmarkLike = Bookmark & Record<string, any>
type FlatSubEntry = {
  parentGroupId: string
  sub: SubGroupLike
}

type MirrorPlatformKey = 'mac' | 'windows' | 'linux' | 'unknown'
type DeviceMirrorDirectoryPreferences = Partial<Record<MirrorPlatformKey, string>>
type MirrorDirectoryAction = 'overwrite' | 'read'
type MirrorDirectoryInspectionResult = {
  directoryPath: string
  filePath: string
  hasExistingFile: boolean
  canReadExistingFile: boolean
  invalidReason?: string
}
type MirrorDirectoryActivationResult = {
  ok: boolean
  filePath: string
  backupPath?: string
  reason?: string
}

const MIRROR_SCHEMA_VERSION = 'goose-marks.local-data.v1'
const MIRROR_DIR_NAME = 'goose-marks-sync'
const MIRROR_FILE_NAME = 'snapshot.json'
const MIRROR_TMP_FILE_NAME = 'snapshot.tmp'
const MIRROR_BACKUP_SUFFIX = 'bak'
const MIRROR_FALLBACK_HOME_DIR = '.goose-marks'
const WRITE_DEBOUNCE_MS = 500
const EXTERNAL_WATCH_INTERVAL_MS = 1000
const REMOTE_APPLY_SILENCE_MS = WRITE_DEBOUNCE_MS + 160
const WEB_MIRROR_STORAGE_KEY = 'goose-marks.local-mirror.snapshot.v1'
const WEB_MIRROR_DIR_PATH = 'browser://local-storage/goose-marks-sync'
const WEB_MIRROR_FILE_PATH = `${WEB_MIRROR_DIR_PATH}/snapshot.json`
const DEVICE_MIRROR_DIR_KEY = 'goose-marks.local-mirror.directory.device.v2'
const DEVICE_MIRROR_DIR_LEGACY_KEY = 'goose-marks.local-mirror.directory.device.v1'
const DEVICE_DEFAULT_DIR_SENTINEL = '__default__'
const MIRROR_CLIENT_ID_KEY = 'goose-marks.local-mirror.client-id.v1'
const TRASH_GROUP_ID = 'g-trash'
const MIRROR_PLATFORM_KEYS: MirrorPlatformKey[] = ['mac', 'windows', 'linux', 'unknown']

const getNodeModule = <T = unknown>(name: string): T | null => {
  if (typeof window === 'undefined' || !window.require) return null
  try {
    return window.require(name) as T
  } catch {
    return null
  }
}

const getRuntimeDataRoot = (pathModule: NodeLikePath): string | null => {
  const runtimePath = window.utools?.getPath?.('userData')
  if (runtimePath && typeof runtimePath === 'string') {
    return runtimePath
  }

  const os = getNodeModule<{ homedir?: () => string }>('os')
  const home = os?.homedir?.()
  if (home && typeof home === 'string') {
    return pathModule.join(home, MIRROR_FALLBACK_HOME_DIR)
  }

  return null
}

const resolveMirrorDirectory = (pathModule: NodeLikePath): string | null => {
  const settingsStore = useSettingsStore.getState()
  const customDir = String(settingsStore.localMirrorDirectory || '').trim()
  if (customDir) {
    return customDir
  }

  const root = getRuntimeDataRoot(pathModule)
  if (!root) return null
  return pathModule.join(root, MIRROR_DIR_NAME)
}

const resolveMirrorPaths = (pathModule: NodeLikePath): { dirPath: string; filePath: string; tmpPath: string } | null => {
  const dirPath = resolveMirrorDirectory(pathModule)
  if (!dirPath) return null
  return {
    dirPath,
    filePath: pathModule.join(dirPath, MIRROR_FILE_NAME),
    tmpPath: pathModule.join(dirPath, MIRROR_TMP_FILE_NAME)
  }
}

const canUseLocalMirror = (): boolean => {
  const fs = getNodeModule<NodeLikeFs>('fs')
  const pathModule = getNodeModule<NodeLikePath>('path')
  if (fs && pathModule && resolveMirrorPaths(pathModule)) return true
  return typeof window !== 'undefined' && !!window.localStorage
}

const buildStableString = (value: unknown): string => JSON.stringify(value)

const buildChecksum = (json: string): string => {
  const cryptoModule = getNodeModule<NodeLikeCrypto>('crypto')
  if (!cryptoModule?.createHash) return ''
  try {
    return cryptoModule.createHash('sha256').update(json).digest('hex')
  } catch {
    return ''
  }
}

const cloneState = (groups: Group[], bookmarks: Bookmark[]): MirrorData => ({
  groups: JSON.parse(JSON.stringify(groups)),
  bookmarks: JSON.parse(JSON.stringify(bookmarks))
})

const cloneAny = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const buildMirrorSyncSnapshot = (groups: Group[], bookmarks: Bookmark[]): MirrorData => {
  const clonedGroups = cloneAny(groups) as Group[]
  const clonedBookmarks = cloneAny(bookmarks) as Bookmark[]

  const bookmarkMap = new Map<string, Bookmark>()
  clonedBookmarks.forEach(item => {
    const id = String(item?.id || '').trim()
    if (!id || item?.isDeleted) return
    item.id = id
    bookmarkMap.set(id, item)
  })

  const locationsMap = new Map<string, Bookmark['locations']>()
  const filteredGroups = clonedGroups
    .filter(group => {
      const groupId = String(group?.id || '').trim()
      return !!groupId && groupId !== TRASH_GROUP_ID && !group?.isDeleted
    })
    .map(group => {
      const groupId = String(group.id).trim()
      const children = (Array.isArray(group.children) ? group.children : [])
        .map(sub => {
          const subId = String(sub?.id || '').trim()
          if (!subId || sub?.isDeleted) return null

          const ids: string[] = []
          const seen = new Set<string>()
          const rawIds = Array.isArray(sub.bookmarkIds) ? sub.bookmarkIds : []
          rawIds.forEach(rawId => {
            const id = String(rawId || '').trim()
            if (!id || seen.has(id) || !bookmarkMap.has(id)) return
            seen.add(id)
            ids.push(id)

            const prev = locationsMap.get(id) || []
            prev.push({ groupId, subGroupId: subId })
            locationsMap.set(id, prev)
          })

          return {
            ...sub,
            id: subId,
            bookmarkIds: ids
          }
        })
        .filter((sub): sub is SubGroup => !!sub)

      return {
        ...group,
        id: groupId,
        children
      }
    })

  const referencedIds = new Set<string>()
  filteredGroups.forEach(group => {
    group.children.forEach(sub => {
      sub.bookmarkIds.forEach(id => referencedIds.add(id))
    })
  })

  const filteredBookmarks = clonedBookmarks
    .filter(item => {
      const id = String(item?.id || '').trim()
      return !!id && !item?.isDeleted && referencedIds.has(id)
    })
    .map(item => {
      const id = String(item.id || '').trim()
      return {
        ...item,
        id,
        locations: locationsMap.get(id) || [],
        prevLocations: Array.isArray(item.prevLocations)
          ? item.prevLocations.filter(loc => loc?.groupId && loc.groupId !== TRASH_GROUP_ID)
          : item.prevLocations
      }
    })

  const validBookmarkIds = new Set(filteredBookmarks.map(item => item.id))
  filteredGroups.forEach(group => {
    group.children.forEach(sub => {
      sub.bookmarkIds = sub.bookmarkIds.filter(id => validBookmarkIds.has(id))
    })
  })

  return {
    groups: filteredGroups,
    bookmarks: filteredBookmarks
  }
}

const normalizeRevision = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
  }
  return 0
}

const normalizeClientId = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized || ''
}

const getEntityUpdatedAt = (entity: { updatedAt?: number; createdAt?: number } | null | undefined): number => {
  const updatedAt = normalizeRevision(entity?.updatedAt)
  const createdAt = normalizeRevision(entity?.createdAt)
  return Math.max(updatedAt, createdAt)
}

const toBasePayload = (payload: MirrorPayload | Omit<MirrorPayload, 'meta'>) => ({
  schemaVersion: payload.schemaVersion,
  generatedAt: payload.generatedAt,
  revision: payload.revision,
  data: payload.data
})

const toStableDataString = (data: MirrorData): string => buildStableString({ groups: data.groups, bookmarks: data.bookmarks })

const mergeOrder = (left: string[], right: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const id of [...left, ...right]) {
    const normalized = String(id || '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `gm-${crypto.randomUUID()}`
  }
  return `gm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let started = false
let stopHandle: (() => void) | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let writeBackTimer: ReturnType<typeof setTimeout> | null = null
let remoteApplyTimer: ReturnType<typeof setTimeout> | null = null
let webPollTimer: ReturnType<typeof setInterval> | null = null
let beforeUnloadHandler: (() => void) | null = null
let pendingStore: MirrorStore | null = null
let pendingFilePath = ''
let webPickedDirectoryHandle: BrowserDirectoryHandleLike | null = null
let watchFilePath = ''
let watchFileListener: ((curr: NodeLikeStats, prev: NodeLikeStats) => void) | null = null
let selfClientId = ''
let lastSeenRevision = 0
let lastAppliedRevision = 0
let lastAppliedChecksum = ''
let lastAppliedWriterClientId = ''
let isApplyingRemote = false
let suppressWritesUntil = 0
let writeBackStore: MirrorStore | null = null

const getSelfClientId = (): string => {
  if (selfClientId) return selfClientId

  const fallback = createClientId()
  if (typeof window === 'undefined') {
    selfClientId = fallback
    return selfClientId
  }

  try {
    const existing = normalizeClientId(getPersistentItem(MIRROR_CLIENT_ID_KEY))
    if (existing) {
      selfClientId = existing
      return selfClientId
    }

    selfClientId = fallback
    utoolsStorage.setItem(MIRROR_CLIENT_ID_KEY, selfClientId)
    return selfClientId
  } catch {
    selfClientId = fallback
    return selfClientId
  }
}

const rememberSeenRevision = (revision: number) => {
  const normalized = normalizeRevision(revision)
  if (normalized <= 0) return
  if (normalized > lastSeenRevision) {
    lastSeenRevision = normalized
  }
}

const buildNextRevision = () => {
  const now = Date.now()
  const candidate = lastSeenRevision + 1
  const next = Math.max(now, candidate)
  lastSeenRevision = next
  return next
}

const markAppliedSnapshot = (payload: MirrorPayload) => {
  const revision = normalizeRevision(payload.revision)
  const checksum = typeof payload.meta?.checksum === 'string' ? payload.meta.checksum : ''
  const writerClientId = normalizeClientId(payload.meta?.writerClientId)

  rememberSeenRevision(revision)
  lastAppliedRevision = Math.max(lastAppliedRevision, revision)
  lastAppliedChecksum = checksum
  lastAppliedWriterClientId = writerClientId
}

const shouldSuppressWrite = () => {
  if (isApplyingRemote) return true
  if (Date.now() < suppressWritesUntil) return true
  return false
}

const markRemoteApplying = () => {
  isApplyingRemote = true
  suppressWritesUntil = Date.now() + REMOTE_APPLY_SILENCE_MS
  if (remoteApplyTimer) clearTimeout(remoteApplyTimer)
  remoteApplyTimer = setTimeout(() => {
    isApplyingRemote = false
    remoteApplyTimer = null
  }, REMOTE_APPLY_SILENCE_MS)
}

const pickWinner = (localUpdatedAt: number, incomingUpdatedAt: number, context: MergeContext): 'local' | 'incoming' => {
  if (incomingUpdatedAt > localUpdatedAt) return 'incoming'
  if (incomingUpdatedAt < localUpdatedAt) return 'local'

  if (context.incomingRevision > context.localRevision) return 'incoming'
  if (context.incomingRevision < context.localRevision) return 'local'

  if (context.incomingWriterClientId.localeCompare(context.localWriterClientId) > 0) return 'incoming'
  return 'local'
}

const selectEntity = <T extends { updatedAt?: number; createdAt?: number }>(
  local: T | undefined,
  incoming: T | undefined,
  context: MergeContext
): { winner: 'local' | 'incoming'; value?: T } => {
  if (!local && !incoming) return { winner: 'local', value: undefined }
  if (!local && incoming) return { winner: 'incoming', value: cloneAny(incoming) }
  if (local && !incoming) return { winner: 'local', value: cloneAny(local) }

  const localUpdatedAt = getEntityUpdatedAt(local)
  const incomingUpdatedAt = getEntityUpdatedAt(incoming)
  const winner = pickWinner(localUpdatedAt, incomingUpdatedAt, context)
  return {
    winner,
    value: winner === 'incoming' ? cloneAny(incoming!) : cloneAny(local!)
  }
}

const flattenGroups = (groups: GroupLike[]) => {
  const groupMap = new Map<string, GroupLike>()
  const groupOrder: string[] = []
  const subMap = new Map<string, FlatSubEntry>()
  const subOrderByGroup = new Map<string, string[]>()

  groups.forEach(rawGroup => {
    const groupId = String(rawGroup?.id || '').trim()
    if (!groupId) return
    if (!groupMap.has(groupId)) {
      const groupCopy: GroupLike = {
        ...(cloneAny(rawGroup) as GroupLike),
        children: []
      }
      groupMap.set(groupId, groupCopy)
      groupOrder.push(groupId)
    }

    const order: string[] = []
    const children = Array.isArray(rawGroup.children) ? rawGroup.children : []
    children.forEach(rawSub => {
      const subId = String(rawSub?.id || '').trim()
      if (!subId) return
      if (subMap.has(subId)) return

      const subCopy: SubGroupLike = {
        ...(cloneAny(rawSub) as SubGroupLike),
        bookmarkIds: Array.isArray(rawSub.bookmarkIds)
          ? Array.from(new Set(rawSub.bookmarkIds.map(id => String(id || '').trim()).filter(Boolean)))
          : []
      }

      subMap.set(subId, {
        parentGroupId: groupId,
        sub: subCopy
      })
      order.push(subId)
    })

    subOrderByGroup.set(groupId, order)
  })

  return {
    groupMap,
    groupOrder,
    subMap,
    subOrderByGroup
  }
}

const resolveFallbackGroupId = (groupOrder: string[], groupMap: Map<string, GroupLike>): string => {
  for (const groupId of groupOrder) {
    if (groupId !== TRASH_GROUP_ID && groupMap.has(groupId)) return groupId
  }
  for (const groupId of groupOrder) {
    if (groupMap.has(groupId)) return groupId
  }
  const first = groupMap.keys().next().value
  return typeof first === 'string' ? first : ''
}

const mergeGroupsByEntity = (localGroups: GroupLike[], incomingGroups: GroupLike[], context: MergeContext): GroupLike[] => {
  const localFlat = flattenGroups(localGroups)
  const incomingFlat = flattenGroups(incomingGroups)

  const mergedGroupOrder = mergeOrder(localFlat.groupOrder, incomingFlat.groupOrder)
  const mergedGroupMap = new Map<string, GroupLike>()

  mergedGroupOrder.forEach(groupId => {
    const localGroup = localFlat.groupMap.get(groupId)
    const incomingGroup = incomingFlat.groupMap.get(groupId)
    const selected = selectEntity(localGroup, incomingGroup, context)
    if (!selected.value) return

    mergedGroupMap.set(groupId, {
      ...(selected.value as GroupLike),
      children: []
    })
  })

  const fallbackGroupId = resolveFallbackGroupId(mergedGroupOrder, mergedGroupMap)
  const mergedSubIds = mergeOrder(Array.from(localFlat.subMap.keys()), Array.from(incomingFlat.subMap.keys()))
  const mergedSubMap = new Map<string, FlatSubEntry>()

  mergedSubIds.forEach(subId => {
    const localEntry = localFlat.subMap.get(subId)
    const incomingEntry = incomingFlat.subMap.get(subId)
    const selected = selectEntity(localEntry?.sub, incomingEntry?.sub, context)
    if (!selected.value) return

    let parentGroupId = ''
    if (selected.winner === 'incoming') {
      parentGroupId = incomingEntry?.parentGroupId || localEntry?.parentGroupId || ''
    } else {
      parentGroupId = localEntry?.parentGroupId || incomingEntry?.parentGroupId || ''
    }

    if (!parentGroupId || !mergedGroupMap.has(parentGroupId)) {
      parentGroupId = fallbackGroupId
    }
    if (!parentGroupId || !mergedGroupMap.has(parentGroupId)) {
      return
    }

    mergedSubMap.set(subId, {
      parentGroupId,
      sub: selected.value as SubGroupLike
    })
  })

  const result: GroupLike[] = []
  mergedGroupOrder.forEach(groupId => {
    const group = mergedGroupMap.get(groupId)
    if (!group) return

    const children: SubGroupLike[] = []
    const addedSubIds = new Set<string>()

    const appendByOrder = (order?: string[]) => {
      if (!Array.isArray(order)) return
      order.forEach(subId => {
        if (addedSubIds.has(subId)) return
        const mergedSub = mergedSubMap.get(subId)
        if (!mergedSub) return
        if (mergedSub.parentGroupId !== groupId) return
        children.push(mergedSub.sub)
        addedSubIds.add(subId)
      })
    }

    appendByOrder(localFlat.subOrderByGroup.get(groupId))
    appendByOrder(incomingFlat.subOrderByGroup.get(groupId))

    mergedSubMap.forEach((entry, subId) => {
      if (addedSubIds.has(subId)) return
      if (entry.parentGroupId !== groupId) return
      children.push(entry.sub)
      addedSubIds.add(subId)
    })

    group.children = children
    result.push(group)
  })

  return result
}

const mergeBookmarksByEntity = (localBookmarks: BookmarkLike[], incomingBookmarks: BookmarkLike[], context: MergeContext): BookmarkLike[] => {
  const localMap = new Map(localBookmarks.map(item => [String(item.id), item]))
  const incomingMap = new Map(incomingBookmarks.map(item => [String(item.id), item]))
  const mergedOrder = mergeOrder(localBookmarks.map(item => String(item.id)), incomingBookmarks.map(item => String(item.id)))

  const result: BookmarkLike[] = []
  mergedOrder.forEach(bookmarkId => {
    const localItem = localMap.get(bookmarkId)
    const incomingItem = incomingMap.get(bookmarkId)
    const selected = selectEntity(localItem, incomingItem, context)
    if (!selected.value) return
    result.push(selected.value as BookmarkLike)
  })

  return result
}

const getLatestUpdatedAt = (data: MirrorData): number => {
  let max = 0

  data.groups.forEach(group => {
    max = Math.max(max, getEntityUpdatedAt(group))
    group.children?.forEach(sub => {
      max = Math.max(max, getEntityUpdatedAt(sub))
    })
  })

  data.bookmarks.forEach(bookmark => {
    max = Math.max(max, getEntityUpdatedAt(bookmark))
  })

  return max
}

const mergeSnapshotData = (localData: MirrorData, incomingPayload: MirrorPayload): MirrorData => {
  const selfWriter = getSelfClientId()
  const incomingWriter = normalizeClientId(incomingPayload.meta?.writerClientId)

  const context: MergeContext = {
    incomingRevision: normalizeRevision(incomingPayload.revision),
    incomingWriterClientId: incomingWriter,
    localRevision: Math.max(lastSeenRevision, lastAppliedRevision, getLatestUpdatedAt(localData)),
    localWriterClientId: selfWriter
  }

  const localGroups = cloneAny(localData.groups) as GroupLike[]
  const localBookmarks = cloneAny(localData.bookmarks) as BookmarkLike[]
  const incomingGroups = cloneAny(incomingPayload.data.groups) as GroupLike[]
  const incomingBookmarks = cloneAny(incomingPayload.data.bookmarks) as BookmarkLike[]

  const groups = mergeGroupsByEntity(localGroups, incomingGroups, context)
  const bookmarks = mergeBookmarksByEntity(localBookmarks, incomingBookmarks, context)

  syncBookmarkLocations(groups as Group[], bookmarks as Bookmark[])

  return {
    groups: groups as Group[],
    bookmarks: bookmarks as Bookmark[]
  }
}

let cachedMirrorPlatform: MirrorPlatformKey | null = null

const normalizeMirrorDirectoryValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

const normalizeMirrorPlatform = (value: string): MirrorPlatformKey => {
  const lower = value.toLowerCase()
  if (lower.includes('darwin') || lower.includes('mac')) return 'mac'
  if (lower.includes('win')) return 'windows'
  if (lower.includes('linux')) return 'linux'
  return 'unknown'
}

const getCurrentMirrorPlatform = (): MirrorPlatformKey => {
  if (cachedMirrorPlatform) return cachedMirrorPlatform

  const os = getNodeModule<NodeLikeOs>('os')
  const runtimePlatform = os?.platform?.()
  if (typeof runtimePlatform === 'string' && runtimePlatform.trim()) {
    cachedMirrorPlatform = normalizeMirrorPlatform(runtimePlatform)
    return cachedMirrorPlatform
  }

  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || ''
    const platform = String((navigator as { platform?: unknown }).platform || '')
    const userAgentDataPlatform = String((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform || '')
    cachedMirrorPlatform = normalizeMirrorPlatform(`${userAgentDataPlatform} ${platform} ${userAgent}`)
    return cachedMirrorPlatform
  }

  cachedMirrorPlatform = 'unknown'
  return cachedMirrorPlatform
}

const normalizeDeviceMirrorDirectoryPreferences = (
  source: Record<string, unknown>
): DeviceMirrorDirectoryPreferences => {
  const result: DeviceMirrorDirectoryPreferences = {}
  MIRROR_PLATFORM_KEYS.forEach((platformKey) => {
    const value = normalizeMirrorDirectoryValue(source[platformKey])
    if (value) {
      result[platformKey] = value
    }
  })
  return result
}

const getDeviceMirrorDirectoryPreferences = (): DeviceMirrorDirectoryPreferences => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = getPersistentItem(DEVICE_MIRROR_DIR_KEY)
    if (typeof raw !== 'string' || !raw.trim()) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return normalizeDeviceMirrorDirectoryPreferences(parsed as Record<string, unknown>)
  } catch {
    return {}
  }
}

const setDeviceMirrorDirectoryPreferences = (preferences: DeviceMirrorDirectoryPreferences) => {
  if (typeof window === 'undefined') return
  const normalized = normalizeDeviceMirrorDirectoryPreferences(preferences as Record<string, unknown>)
  try {
    if (Object.keys(normalized).length === 0) {
      removePersistentItem(DEVICE_MIRROR_DIR_KEY)
      return
    }
    utoolsStorage.setItem(DEVICE_MIRROR_DIR_KEY, JSON.stringify(normalized))
  } catch {}
}

const getLegacyDeviceMirrorDirectoryPreference = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return normalizeMirrorDirectoryValue(getPersistentItem(DEVICE_MIRROR_DIR_LEGACY_KEY))
  } catch {
    return null
  }
}

const clearLegacyDeviceMirrorDirectoryPreference = () => {
  if (typeof window === 'undefined') return
  try {
    removePersistentItem(DEVICE_MIRROR_DIR_LEGACY_KEY)
  } catch {}
}

const getDeviceMirrorDirectoryPreference = (): string | null => {
  const platformKey = getCurrentMirrorPlatform()
  const preferences = getDeviceMirrorDirectoryPreferences()
  const current = normalizeMirrorDirectoryValue(preferences[platformKey])
  if (current) return current

  if (platformKey !== 'unknown') {
    const shared = normalizeMirrorDirectoryValue(preferences.unknown)
    if (shared) return shared
  }

  const legacyValue = getLegacyDeviceMirrorDirectoryPreference()
  if (legacyValue) {
    const nextPreferences = getDeviceMirrorDirectoryPreferences()
    nextPreferences[platformKey] = legacyValue
    setDeviceMirrorDirectoryPreferences(nextPreferences)
    clearLegacyDeviceMirrorDirectoryPreference()
    return legacyValue
  }

  return null
}

const setDeviceMirrorDirectoryPreference = (value: string) => {
  const normalized = normalizeMirrorDirectoryValue(value)
  if (!normalized) return

  const platformKey = getCurrentMirrorPlatform()
  const preferences = getDeviceMirrorDirectoryPreferences()
  preferences[platformKey] = normalized
  setDeviceMirrorDirectoryPreferences(preferences)
  clearLegacyDeviceMirrorDirectoryPreference()
}

const clearDeviceMirrorDirectoryPreference = () => {
  const platformKey = getCurrentMirrorPlatform()
  const preferences = getDeviceMirrorDirectoryPreferences()
  delete preferences[platformKey]
  setDeviceMirrorDirectoryPreferences(preferences)
  clearLegacyDeviceMirrorDirectoryPreference()
}

const isDirectoryPathAvailable = (value: string): boolean => {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  if (normalized.startsWith('browser://')) return true

  const fs = getNodeModule<NodeLikeFs>('fs')
  if (!fs?.existsSync) return true

  try {
    if (!fs.existsSync(normalized)) return false
    const stat = fs.statSync?.(normalized)
    if (stat?.isDirectory && !stat.isDirectory()) return false
    return true
  } catch {
    return false
  }
}

const shouldPromptMirrorDirectorySelection = (): boolean => {
  if (!canUseLocalMirror()) return false
  const settingsStore = useSettingsStore.getState()
  if (!settingsStore.preferLocalSnapshotOnStartup) return false
  return !isMirrorDirectoryConfiguredOnDevice()
}

const isMirrorDirectoryConfiguredOnDevice = (): boolean => {
  const stored = getDeviceMirrorDirectoryPreference()
  if (stored === DEVICE_DEFAULT_DIR_SENTINEL) return true
  if (stored && stored !== DEVICE_DEFAULT_DIR_SENTINEL) {
    return isDirectoryPathAvailable(stored)
  }

  const settingsStore = useSettingsStore.getState()
  const legacyValue = String(settingsStore.localMirrorDirectory || '').trim()
  return isDirectoryPathAvailable(legacyValue)
}

const hydrateMirrorDirectoryForDevice = () => {
  const settingsStore = useSettingsStore.getState()
  const stored = getDeviceMirrorDirectoryPreference()
  if (stored === DEVICE_DEFAULT_DIR_SENTINEL) {
    settingsStore.setLocalMirrorDirectory('')
    return
  }
  if (stored) {
    if (!isDirectoryPathAvailable(stored)) {
      clearDeviceMirrorDirectoryPreference()
      settingsStore.setLocalMirrorDirectory('')
      return
    }
    settingsStore.setLocalMirrorDirectory(stored)
    return
  }

  const legacyValue = String(settingsStore.localMirrorDirectory || '').trim()
  if (legacyValue && isDirectoryPathAvailable(legacyValue)) {
    setDeviceMirrorDirectoryPreference(legacyValue)
    settingsStore.setLocalMirrorDirectory(legacyValue)
    return
  }

  settingsStore.setLocalMirrorDirectory('')
}

const setMirrorDirectoryForDevice = (value: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) return
  const settingsStore = useSettingsStore.getState()
  setDeviceMirrorDirectoryPreference(normalized)
  settingsStore.setLocalMirrorDirectory(normalized)
}

const setDefaultMirrorDirectoryForDevice = () => {
  const settingsStore = useSettingsStore.getState()
  setDeviceMirrorDirectoryPreference(DEVICE_DEFAULT_DIR_SENTINEL)
  settingsStore.setLocalMirrorDirectory('')
}

const joinPathLike = (base: string, file: string): string => {
  const cleanBase = base.replace(/[\\/]+$/, '')
  return `${cleanBase}/${file}`
}

const buildBackupCandidatePath = (filePath: string, index: number) => {
  const suffix = index <= 0 ? MIRROR_BACKUP_SUFFIX : `${MIRROR_BACKUP_SUFFIX}${index}`
  return `${filePath}.${suffix}`
}

const resolveMirrorFilePathFromDirectory = (directoryPath: string) => {
  const normalizedPath = String(directoryPath || '').trim()
  if (!normalizedPath) return ''
  return joinPathLike(normalizedPath, MIRROR_FILE_NAME)
}

const readMirrorSnapshotFromFilePath = (filePath: string): MirrorPayload | null => {
  const fs = getNodeModule<NodeLikeFs>('fs')
  const normalizedPath = String(filePath || '').trim()
  if (!fs || !normalizedPath || !fs.existsSync(normalizedPath)) return null

  try {
    const raw = fs.readFileSync(normalizedPath, 'utf-8')
    return JSON.parse(raw) as MirrorPayload
  } catch (error) {
    console.warn('[LocalDataMirror] 读取或解析指定快照失败:', error)
    return null
  }
}

const inspectMirrorDirectory = (directoryPath: string): MirrorDirectoryInspectionResult => {
  const normalizedPath = String(directoryPath || '').trim()
  const filePath = resolveMirrorFilePathFromDirectory(normalizedPath)
  const fs = getNodeModule<NodeLikeFs>('fs')

  if (!normalizedPath || !filePath || !fs || normalizedPath.startsWith('browser://')) {
    return {
      directoryPath: normalizedPath,
      filePath,
      hasExistingFile: false,
      canReadExistingFile: false
    }
  }

  if (!fs.existsSync(filePath)) {
    return {
      directoryPath: normalizedPath,
      filePath,
      hasExistingFile: false,
      canReadExistingFile: false
    }
  }

  const payload = readMirrorSnapshotFromFilePath(filePath)
  const validation = validateMirrorSnapshot(payload)

  return {
    directoryPath: normalizedPath,
    filePath,
    hasExistingFile: true,
    canReadExistingFile: !!payload && validation.ok,
    invalidReason: validation.ok ? undefined : validation.reason
  }
}

const backupExistingMirrorFile = (filePath: string): MirrorDirectoryActivationResult => {
  const fs = getNodeModule<NodeLikeFs>('fs')
  const normalizedPath = String(filePath || '').trim()

  if (!normalizedPath) return { ok: false, filePath: '', reason: 'invalid_file_path' }
  if (!fs || !fs.existsSync(normalizedPath)) return { ok: true, filePath: normalizedPath }

  let nextBackupPath = buildBackupCandidatePath(normalizedPath, 0)
  let backupIndex = 1
  while (fs.existsSync(nextBackupPath)) {
    nextBackupPath = buildBackupCandidatePath(normalizedPath, backupIndex)
    backupIndex += 1
  }

  try {
    fs.renameSync(normalizedPath, nextBackupPath)
    return {
      ok: true,
      filePath: normalizedPath,
      backupPath: nextBackupPath
    }
  } catch (error) {
    console.warn('[LocalDataMirror] 备份旧快照失败，已取消本次覆盖:', error)
    return {
      ok: false,
      filePath: normalizedPath,
      reason: 'backup_failed'
    }
  }
}

const writeToPickedWebDirectory = async (json: string) => {
  if (!webPickedDirectoryHandle?.getFileHandle) return
  try {
    const fileHandle = await webPickedDirectoryHandle.getFileHandle(MIRROR_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable?.()
    if (!writable) return
    await writable.write(json)
    await writable.close()
  } catch (error) {
    console.warn('[LocalDataMirror] 浏览器目录写入失败:', error)
  }
}

const buildPayloadFromData = (data: MirrorData): MirrorPayload => {
  const revision = buildNextRevision()
  const writerClientId = getSelfClientId()
  const writtenAt = Date.now()

  const basePayload: Omit<MirrorPayload, 'meta'> = {
    schemaVersion: MIRROR_SCHEMA_VERSION,
    generatedAt: new Date(writtenAt).toISOString(),
    revision,
    data
  }

  const checksum = buildChecksum(buildStableString(toBasePayload(basePayload)))

  return {
    ...basePayload,
    meta: {
      recordCount: data.bookmarks.length,
      checksum,
      writerClientId,
      writtenAt
    }
  }
}

const writeMirrorNow = (store: MirrorStore) => {
  const fs = getNodeModule<NodeLikeFs>('fs')
  const pathModule = getNodeModule<NodeLikePath>('path')

  const snapshot = buildMirrorSyncSnapshot(store.groups, store.bookmarks)
  const payload = buildPayloadFromData(snapshot)
  const json = `${JSON.stringify(payload, null, 2)}\n`

  if (fs && pathModule) {
    const paths = resolveMirrorPaths(pathModule)
    if (!paths) return

    try {
      if (!fs.existsSync(paths.dirPath)) {
        fs.mkdirSync(paths.dirPath, { recursive: true })
      }
      fs.writeFileSync(paths.tmpPath, json, 'utf-8')
      fs.renameSync(paths.tmpPath, paths.filePath)
      pendingFilePath = paths.filePath
      markAppliedSnapshot(payload)
      return
    } catch (error) {
      console.warn('[LocalDataMirror] 写入失败:', error)
    }
  }

  try {
    window.localStorage.setItem(WEB_MIRROR_STORAGE_KEY, json)
    const settingsStore = useSettingsStore.getState()
    const customDir = String(settingsStore.localMirrorDirectory || '').trim()
    pendingFilePath = customDir ? joinPathLike(customDir, MIRROR_FILE_NAME) : WEB_MIRROR_FILE_PATH
    markAppliedSnapshot(payload)
    void writeToPickedWebDirectory(json)
  } catch (error) {
    console.warn('[LocalDataMirror] 浏览器本地写入失败:', error)
  }
}

const readMirrorSnapshot = (): MirrorPayload | null => {
  const fs = getNodeModule<NodeLikeFs>('fs')
  const pathModule = getNodeModule<NodeLikePath>('path')
  if (fs && pathModule) {
    const paths = resolveMirrorPaths(pathModule)
    if (!paths) return null

    pendingFilePath = paths.filePath
    if (!fs.existsSync(paths.filePath)) return null

    try {
      const raw = fs.readFileSync(paths.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return parsed as MirrorPayload
    } catch (error) {
      console.warn('[LocalDataMirror] 读取或解析失败:', error)
      return null
    }
  }

  try {
    const raw = window.localStorage.getItem(WEB_MIRROR_STORAGE_KEY)
    if (!raw) return null
    pendingFilePath = WEB_MIRROR_FILE_PATH
    const parsed = JSON.parse(raw)
    return parsed as MirrorPayload
  } catch (error) {
    console.warn('[LocalDataMirror] 浏览器本地读取或解析失败:', error)
    return null
  }
}

const validateMirrorSnapshot = (payload: MirrorPayload | null): MirrorValidationResult => {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid_payload' }
  if (payload.schemaVersion !== MIRROR_SCHEMA_VERSION) return { ok: false, reason: 'invalid_schema_version' }

  const groups = payload.data?.groups
  const bookmarks = payload.data?.bookmarks
  if (!Array.isArray(groups) || !Array.isArray(bookmarks)) return { ok: false, reason: 'invalid_data_shape' }

  if (!payload.meta || typeof payload.meta.recordCount !== 'number') return { ok: false, reason: 'invalid_meta' }
  if (payload.meta.recordCount !== bookmarks.length) return { ok: false, reason: 'record_count_mismatch' }

  if (typeof payload.meta.checksum !== 'string') return { ok: false, reason: 'invalid_checksum' }
  if (payload.meta.writerClientId != null && typeof payload.meta.writerClientId !== 'string') {
    return { ok: false, reason: 'invalid_writer_client_id' }
  }
  if (payload.meta.writtenAt != null && !Number.isFinite(payload.meta.writtenAt)) {
    return { ok: false, reason: 'invalid_written_at' }
  }

  const checksum = buildChecksum(buildStableString(toBasePayload(payload)))
  if (payload.meta.checksum !== checksum) return { ok: false, reason: 'checksum_mismatch' }

  return { ok: true }
}

const applyDataToStore = (store: MirrorStore, data: MirrorData) => {
  const snapshot = cloneState(data.groups, data.bookmarks)
  markRemoteApplying()

  if (typeof store.loadFromSnapshot === 'function') {
    store.loadFromSnapshot({
      groups: snapshot.groups,
      bookmarks: snapshot.bookmarks
    }, false)
    return
  }

  store.setData({
    groups: snapshot.groups,
    bookmarks: snapshot.bookmarks
  })
}

const applyMirrorToStore = (store: MirrorStore, payload: MirrorPayload) => {
  applyDataToStore(store, {
    groups: payload.data.groups,
    bookmarks: payload.data.bookmarks
  })
}

const queueWriteBack = (store: MirrorStore) => {
  writeBackStore = store
  if (writeBackTimer) {
    clearTimeout(writeBackTimer)
    writeBackTimer = null
  }

  const delay = Math.max(WRITE_DEBOUNCE_MS, suppressWritesUntil - Date.now() + 24)
  writeBackTimer = setTimeout(() => {
    if (!writeBackStore) return
    writeMirrorNow(writeBackStore)
    writeBackTimer = null
  }, Math.max(delay, WRITE_DEBOUNCE_MS))
}

const shouldQuickDiscardIncoming = (payload: MirrorPayload): boolean => {
  const incomingRevision = normalizeRevision(payload.revision)
  const incomingWriterClientId = normalizeClientId(payload.meta?.writerClientId)
  const incomingChecksum = typeof payload.meta?.checksum === 'string' ? payload.meta.checksum : ''
  const selfId = getSelfClientId()

  if (incomingRevision < lastAppliedRevision) return true

  if (incomingRevision === lastAppliedRevision) {
    if (incomingWriterClientId && incomingWriterClientId === selfId) return true
    if (incomingChecksum && incomingChecksum === lastAppliedChecksum) return true
    if (incomingWriterClientId && incomingWriterClientId === lastAppliedWriterClientId && incomingChecksum === lastAppliedChecksum) {
      return true
    }
  }

  return false
}

const processIncomingSnapshot = (store: MirrorStore, payload: MirrorPayload) => {
  rememberSeenRevision(payload.revision)

  if (shouldQuickDiscardIncoming(payload)) {
    return
  }

  const localData = cloneState(store.groups, store.bookmarks)
  const incomingData = buildMirrorSyncSnapshot(payload.data.groups, payload.data.bookmarks)
  const mergedData = mergeSnapshotData(localData, {
    ...payload,
    data: incomingData
  })

  const localDataString = toStableDataString(localData)
  const mergedDataString = toStableDataString(mergedData)
  const mergedMirrorDataString = toStableDataString(buildMirrorSyncSnapshot(mergedData.groups, mergedData.bookmarks))
  const incomingDataString = toStableDataString(incomingData)

  const shouldApplyToLocal = mergedDataString !== localDataString
  const shouldWriteBack = mergedMirrorDataString !== incomingDataString

  if (shouldApplyToLocal) {
    applyDataToStore(store, mergedData)
  }

  markAppliedSnapshot(payload)

  if (shouldWriteBack) {
    queueWriteBack(store)
  }
}

const primeSeenRevisionFromSnapshot = () => {
  const payload = readMirrorSnapshot()
  const validation = validateMirrorSnapshot(payload)
  if (!payload || !validation.ok) return
  rememberSeenRevision(payload.revision)
}

const handleExternalSnapshotRefresh = () => {
  if (!useSettingsStore.getState().preferLocalSnapshotOnStartup) return
  const store = pendingStore
  if (!store) return

  const payload = readMirrorSnapshot()
  const validation = validateMirrorSnapshot(payload)
  if (!payload || !validation.ok) return

  processIncomingSnapshot(store, payload)
}

const clearExternalWatcher = () => {
  const fs = getNodeModule<NodeLikeFs>('fs')

  if (watchFilePath && watchFileListener && fs?.unwatchFile) {
    try {
      fs.unwatchFile(watchFilePath, watchFileListener)
    } catch {
      // ignore
    }
  }

  watchFilePath = ''
  watchFileListener = null

  if (webPollTimer) {
    clearInterval(webPollTimer)
    webPollTimer = null
  }
}

const bindExternalWatcher = () => {
  clearExternalWatcher()

  const fs = getNodeModule<NodeLikeFs>('fs')
  const pathModule = getNodeModule<NodeLikePath>('path')

  if (fs?.watchFile && fs?.unwatchFile && pathModule) {
    const paths = resolveMirrorPaths(pathModule)
    if (paths?.filePath) {
      watchFilePath = paths.filePath
      pendingFilePath = paths.filePath

      watchFileListener = (curr, prev) => {
        const currMtime = Number(curr?.mtimeMs || 0)
        const prevMtime = Number(prev?.mtimeMs || 0)
        const currSize = Number(curr?.size || 0)
        const prevSize = Number(prev?.size || 0)

        if (currMtime === prevMtime && currSize === prevSize) return
        handleExternalSnapshotRefresh()
      }

      try {
        fs.watchFile(watchFilePath, { interval: EXTERNAL_WATCH_INTERVAL_MS }, watchFileListener)
      } catch (error) {
        console.warn('[LocalDataMirror] 文件监听失败，回退轮询:', error)
      }

      return
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    webPollTimer = setInterval(() => {
      handleExternalSnapshotRefresh()
    }, EXTERNAL_WATCH_INTERVAL_MS)
  }
}

const scheduleWrite = () => {
  if (!useSettingsStore.getState().preferLocalSnapshotOnStartup) return
  if (!pendingStore) return
  if (shouldSuppressWrite()) return

  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    if (!pendingStore) return
    if (shouldSuppressWrite()) return
    writeMirrorNow(pendingStore)
    writeTimer = null
  }, WRITE_DEBOUNCE_MS)
}

export function useLocalDataMirror() {
  const isMirrorSyncEnabled = () => {
    const settingsStore = useSettingsStore.getState()
    return canUseLocalMirror() && settingsStore.preferLocalSnapshotOnStartup
  }

  const canPickMirrorDirectory = () => {
    if (window.utools?.showOpenDialog) return true
    return typeof (window as any).showDirectoryPicker === 'function'
  }

  const pickMirrorDirectory = async (): Promise<string | null> => {
    const openDialog = window.utools?.showOpenDialog
    if (openDialog) {
      try {
        const paths = await openDialog({
          title: '选择同步文件夹',
          properties: ['openDirectory']
        })
        const first = Array.isArray(paths) ? paths[0] : undefined
        if (typeof first !== 'string') return null
        const normalized = first.trim()
        return normalized || null
      } catch (error) {
        console.warn('[LocalDataMirror] 选择目录失败:', error)
        return null
      }
    }

    const showDirectoryPicker = (window as any).showDirectoryPicker as undefined | (() => Promise<BrowserDirectoryHandleLike>)
    if (!showDirectoryPicker) return null

    try {
      const handle = await showDirectoryPicker()
      webPickedDirectoryHandle = handle
      const name = String(handle?.name || 'selected-folder')
      return `browser://picked/${name}`
    } catch (error) {
      console.warn('[LocalDataMirror] 选择目录失败:', error)
      return null
    }
  }

  const activateMirrorDirectory = (directoryPath: string, action: MirrorDirectoryAction): MirrorDirectoryActivationResult => {
    const normalizedPath = String(directoryPath || '').trim()
    if (!normalizedPath) {
      return {
        ok: false,
        filePath: '',
        reason: 'invalid_directory_path'
      }
    }

    const inspection = inspectMirrorDirectory(normalizedPath)
    if (action === 'read' && inspection.hasExistingFile && !inspection.canReadExistingFile) {
      return {
        ok: false,
        filePath: inspection.filePath,
        reason: inspection.invalidReason || 'invalid_snapshot'
      }
    }

    let backupPath = ''
    if (action === 'overwrite' && inspection.hasExistingFile) {
      const backupResult = backupExistingMirrorFile(inspection.filePath)
      if (!backupResult.ok) {
        return backupResult
      }
      backupPath = String(backupResult.backupPath || '')
    }

    setMirrorDirectoryForDevice(normalizedPath)
    start()

    if (action === 'overwrite' || !inspection.hasExistingFile) {
      syncNow()
    }

    return {
      ok: true,
      filePath: inspection.filePath || resolveMirrorFilePathFromDirectory(normalizedPath),
      backupPath
    }
  }

  const syncNow = () => {
    if (!isMirrorSyncEnabled()) return
    const store = useBookmarkStore.getState() as MirrorStore
    writeMirrorNow(store)
  }

  const getResolvedMirrorDirectoryPath = () => {
    const settingsStore = useSettingsStore.getState()
    const customDir = String(settingsStore.localMirrorDirectory || '').trim()
    if (customDir) return customDir

    const pathModule = getNodeModule<NodeLikePath>('path')
    if (pathModule) {
      const paths = resolveMirrorPaths(pathModule)
      if (paths?.dirPath) return paths.dirPath
    }
    return canUseLocalMirror() ? WEB_MIRROR_DIR_PATH : ''
  }

  const getResolvedMirrorFilePath = () => {
    const settingsStore = useSettingsStore.getState()
    const customDir = String(settingsStore.localMirrorDirectory || '').trim()
    if (customDir) return joinPathLike(customDir, MIRROR_FILE_NAME)

    const pathModule = getNodeModule<NodeLikePath>('path')
    if (pathModule) {
      const paths = resolveMirrorPaths(pathModule)
      if (paths?.filePath) return paths.filePath
    }
    return canUseLocalMirror() ? WEB_MIRROR_FILE_PATH : ''
  }

  const bootstrapLocalFirstIfEnabled = async (): Promise<void> => {
    const store = useBookmarkStore.getState() as MirrorStore
    const settingsStore = useSettingsStore.getState()
    if (!settingsStore.preferLocalSnapshotOnStartup) return
    if (shouldPromptMirrorDirectorySelection()) {
      console.warn('[LocalDataMirror] 当前设备未配置本地目录，跳过本地优先覆盖')
      return
    }

    const payload = readMirrorSnapshot()
    const validation = validateMirrorSnapshot(payload)

    if (!validation.ok || !payload) {
      if (validation.reason && validation.reason !== 'invalid_payload') {
        console.warn(`[LocalDataMirror] 本地快照无效，原因: ${validation.reason}，将使用当前数据回写`)
      }
      writeMirrorNow(store)
      return
    }

    processIncomingSnapshot(store, payload)
  }

  const start = () => {
    if (!isMirrorSyncEnabled()) {
      stop()
      return
    }

    const store = useBookmarkStore.getState() as MirrorStore
    pendingStore = store

    primeSeenRevisionFromSnapshot()
    if (!shouldPromptMirrorDirectorySelection()) {
      handleExternalSnapshotRefresh()
    }
    bindExternalWatcher()

    if (started) return

    // 等价旧版 Vue watch(() => [store.groups, store.bookmarks], scheduleWrite, { deep, immediate })：
    // Zustand subscribe 在 groups/bookmarks 引用变化时触发；immediate 用一次立即调用模拟。
    scheduleWrite()
    stopHandle = useBookmarkStore.subscribe((state, prev) => {
      if (state.groups !== prev.groups || state.bookmarks !== prev.bookmarks) {
        scheduleWrite()
      }
    })

    if (!beforeUnloadHandler) {
      beforeUnloadHandler = () => {
        if (pendingStore) {
          writeMirrorNow(pendingStore)
        }
      }
      window.addEventListener('beforeunload', beforeUnloadHandler)
    }

    started = true
  }

  const stop = () => {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }

    if (writeBackTimer) {
      clearTimeout(writeBackTimer)
      writeBackTimer = null
    }

    if (remoteApplyTimer) {
      clearTimeout(remoteApplyTimer)
      remoteApplyTimer = null
    }

    clearExternalWatcher()

    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
      beforeUnloadHandler = null
    }

    stopHandle?.()
    stopHandle = null
    pendingStore = null
    writeBackStore = null
    started = false
    isApplyingRemote = false
    suppressWritesUntil = 0
  }

  const getMirrorFilePath = () => pendingFilePath
  const clearPickedMirrorDirectory = () => {
    webPickedDirectoryHandle = null
  }

  return {
    start,
    stop,
    syncNow,
    canUseLocalMirror,
    canPickMirrorDirectory,
    pickMirrorDirectory,
    inspectMirrorDirectory,
    activateMirrorDirectory,
    hydrateMirrorDirectoryForDevice,
    isMirrorDirectoryConfiguredOnDevice,
    shouldPromptMirrorDirectorySelection,
    setMirrorDirectoryForDevice,
    setDefaultMirrorDirectoryForDevice,
    readMirrorSnapshot,
    validateMirrorSnapshot,
    applyMirrorToStore,
    bootstrapLocalFirstIfEnabled,
    getResolvedMirrorDirectoryPath,
    getResolvedMirrorFilePath,
    getMirrorFilePath,
    clearPickedMirrorDirectory
  }
}
