import type { Bookmark, Group } from '@/types/bookmark'

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
  }
}

type MirrorValidationResult = {
  ok: boolean
  reason?: string
}

type NodeLikeFs = {
  existsSync: (path: string) => boolean
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void
  readFileSync: (path: string, encoding: string) => string
  writeFileSync: (path: string, data: string, encoding?: string) => void
  renameSync: (oldPath: string, newPath: string) => void
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

type BrowserDirectoryHandleLike = {
  name?: string
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
  }>
}

const MIRROR_SCHEMA_VERSION = 'goose-marks.local-data.v1'
const MIRROR_DIR_NAME = 'goose-marks-sync'
const MIRROR_FILE_NAME = 'snapshot.json'
const MIRROR_TMP_FILE_NAME = 'snapshot.tmp'
const MIRROR_FALLBACK_HOME_DIR = '.goose-marks'
const WRITE_DEBOUNCE_MS = 500
const WEB_MIRROR_STORAGE_KEY = 'goose-marks.local-mirror.snapshot.v1'
const WEB_MIRROR_DIR_PATH = 'browser://local-storage/goose-marks-sync'
const WEB_MIRROR_FILE_PATH = `${WEB_MIRROR_DIR_PATH}/snapshot.json`
const DEVICE_MIRROR_DIR_KEY = 'goose-marks.local-mirror.directory.device.v1'
const DEVICE_DEFAULT_DIR_SENTINEL = '__default__'

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
  const settingsStore = useSettingsStore()
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

const cloneState = (groups: Group[], bookmarks: Bookmark[]): { groups: Group[]; bookmarks: Bookmark[] } => ({
  groups: JSON.parse(JSON.stringify(groups)),
  bookmarks: JSON.parse(JSON.stringify(bookmarks))
})

const toBasePayload = (payload: MirrorPayload | Omit<MirrorPayload, 'meta'>) => ({
  schemaVersion: payload.schemaVersion,
  generatedAt: payload.generatedAt,
  revision: payload.revision,
  data: payload.data
})

let started = false
let stopHandle: (() => void) | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let pendingStore: ReturnType<typeof useBookmarkStore> | null = null
let pendingFilePath = ''
let webPickedDirectoryHandle: BrowserDirectoryHandleLike | null = null

const getDeviceMirrorDirectoryPreference = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DEVICE_MIRROR_DIR_KEY)
    if (typeof raw !== 'string') return null
    const normalized = raw.trim()
    return normalized || null
  } catch {
    return null
  }
}

const setDeviceMirrorDirectoryPreference = (value: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEVICE_MIRROR_DIR_KEY, value)
  } catch {}
}

const clearDeviceMirrorDirectoryPreference = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DEVICE_MIRROR_DIR_KEY)
  } catch {}
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
  const settingsStore = useSettingsStore()
  if (!settingsStore.preferLocalSnapshotOnStartup) return false
  return !isMirrorDirectoryConfiguredOnDevice()
}

const isMirrorDirectoryConfiguredOnDevice = (): boolean => {
  const stored = getDeviceMirrorDirectoryPreference()
  if (stored === DEVICE_DEFAULT_DIR_SENTINEL) return true
  if (stored && stored !== DEVICE_DEFAULT_DIR_SENTINEL) {
    return isDirectoryPathAvailable(stored)
  }

  const settingsStore = useSettingsStore()
  const legacyValue = String(settingsStore.localMirrorDirectory || '').trim()
  return isDirectoryPathAvailable(legacyValue)
}

const hydrateMirrorDirectoryForDevice = () => {
  const settingsStore = useSettingsStore()
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
  const settingsStore = useSettingsStore()
  setDeviceMirrorDirectoryPreference(normalized)
  settingsStore.setLocalMirrorDirectory(normalized)
}

const setDefaultMirrorDirectoryForDevice = () => {
  const settingsStore = useSettingsStore()
  setDeviceMirrorDirectoryPreference(DEVICE_DEFAULT_DIR_SENTINEL)
  settingsStore.setLocalMirrorDirectory('')
}

const joinPathLike = (base: string, file: string): string => {
  const cleanBase = base.replace(/[\\/]+$/, '')
  return `${cleanBase}/${file}`
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

const writeMirrorNow = (store: ReturnType<typeof useBookmarkStore>) => {
  const fs = getNodeModule<NodeLikeFs>('fs')
  const pathModule = getNodeModule<NodeLikePath>('path')

  const snapshot = cloneState(store.groups, store.bookmarks)
  const basePayload: Omit<MirrorPayload, 'meta'> = {
    schemaVersion: MIRROR_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    revision: Date.now(),
    data: snapshot
  }
  const baseJson = buildStableString(toBasePayload(basePayload))
  const checksum = buildChecksum(baseJson)

  const payload: MirrorPayload = {
    ...basePayload,
    meta: {
      recordCount: snapshot.bookmarks.length,
      checksum
    }
  }

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
      return
    } catch (error) {
      console.warn('[LocalDataMirror] 写入失败:', error)
    }
  }

  try {
    window.localStorage.setItem(WEB_MIRROR_STORAGE_KEY, json)
    const settingsStore = useSettingsStore()
    const customDir = String(settingsStore.localMirrorDirectory || '').trim()
    pendingFilePath = customDir ? joinPathLike(customDir, MIRROR_FILE_NAME) : WEB_MIRROR_FILE_PATH
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
  const checksum = buildChecksum(buildStableString(toBasePayload(payload)))
  if (payload.meta.checksum !== checksum) return { ok: false, reason: 'checksum_mismatch' }

  return { ok: true }
}

const applyMirrorToStore = (store: ReturnType<typeof useBookmarkStore>, payload: MirrorPayload) => {
  const snapshot = cloneState(payload.data.groups, payload.data.bookmarks)
  if (typeof store.loadFromSnapshot === 'function') {
    store.loadFromSnapshot({
      groups: snapshot.groups,
      bookmarks: snapshot.bookmarks
    }, false)
    return
  }
  store.$patch({
    groups: snapshot.groups,
    bookmarks: snapshot.bookmarks
  })
}

const scheduleWrite = () => {
  if (!pendingStore) return
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    if (!pendingStore) return
    writeMirrorNow(pendingStore)
    writeTimer = null
  }, WRITE_DEBOUNCE_MS)
}

export function useLocalDataMirror() {
  const canPickMirrorDirectory = () => {
    if (window.utools?.showOpenDialog) return true
    return typeof (window as any).showDirectoryPicker === 'function'
  }

  const pickMirrorDirectory = async (): Promise<string | null> => {
    const openDialog = window.utools?.showOpenDialog
    if (openDialog) {
      try {
        const paths = await openDialog({
          title: '选择本地快照保存文件夹',
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

  const syncNow = () => {
    const store = useBookmarkStore()
    writeMirrorNow(store)
  }

  const getResolvedMirrorDirectoryPath = () => {
    const settingsStore = useSettingsStore()
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
    const settingsStore = useSettingsStore()
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
    const store = useBookmarkStore()
    const settingsStore = useSettingsStore()
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

    applyMirrorToStore(store, payload)
  }

  const start = () => {
    if (started) return
    if (!canUseLocalMirror()) return

    const store = useBookmarkStore()
    pendingStore = store

    stopHandle = watch(
      () => [store.groups, store.bookmarks],
      () => scheduleWrite(),
      { deep: true, immediate: true }
    )

    window.addEventListener('beforeunload', () => {
      if (pendingStore) {
        writeMirrorNow(pendingStore)
      }
    })

    started = true
  }

  const stop = () => {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    stopHandle?.()
    stopHandle = null
    pendingStore = null
    started = false
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
