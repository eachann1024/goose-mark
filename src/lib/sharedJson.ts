import { applyImportDataToStore } from '@/hooks/useImportExport'
import { useBookmarkStore } from '@/stores/bookmark'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { useSettingsStore, setSettingsFileReadOnly } from '@/stores/settings'
import { currentFileSettings, currentLocalSettings } from './shared-json/settings'
import { hash, portableSnapshot, type Snapshot } from './shared-json/files'
import { createSourceActions, SOURCE_PATH_KEY } from './shared-json/source-actions'
import { useSharedJsonStatus } from './shared-json/status'
import { readSource, writeSource, type Source, type SourceRead } from './shared-json/folder'
import { defaultSourcePath } from './shared-json/startup'
import { createSourceInitialization } from './shared-json/initialization'
import { preserveLocalData } from './shared-json/local-cache'
import { createLegacyMigration } from './shared-json/migration'
import type { Connection } from './shared-json/runtime-types'
export { useSharedJsonStatus } from './shared-json/status'

const PATH_KEY = SOURCE_PATH_KEY
let remoteBaseline: SourceRead | undefined
let baseline = ''
let localBaseline = ''
let applying = false
let blocked = false
let epoch = 0
let connection: Connection | undefined
let timer: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined
let unsubscribeSettings: (() => void) | undefined
let lifecycleBound = false
let syncQueue = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = syncQueue.then(operation)
  syncQueue = task.then(() => undefined, () => undefined)
  return task
}

function currentSnapshot(): Snapshot {
  const { groups, bookmarks } = useBookmarkStore.getState()
  return { groups, bookmarks, settings: currentFileSettings() }
}

function snapshotStamp() { return JSON.stringify(currentSnapshot()) }
function isActive(source: Connection) { return connection === source && source.epoch === epoch && !blocked }

function saveCheckpoint(remote: string, local: string) { baseline = remote; localBaseline = local }

function apply(snapshot: Snapshot) {
  applying = true
  try {
    // Validated source snapshots must replace the cache even while user edits are locked.
    applyImportDataToStore({ ...useBookmarkStore.getState(),
      setData: data => useBookmarkStore.setState(data) }, snapshot, 'overwrite')
    useBookmarkStore.getState().ensureValidSelection()
    if (snapshot.settings) {
      useSettingsStore.setState(snapshot.settings)
      if (snapshot.settings.windowHeight !== undefined) window.utools?.setExpendHeight?.(snapshot.settings.windowHeight)
    }
  }
  finally { applying = false }
}

function stopSource() {
  unsubscribe?.()
  unsubscribe = undefined
  unsubscribeSettings?.()
  unsubscribeSettings = undefined
  if (timer) clearInterval(timer)
  timer = undefined
  connection = undefined
  ++epoch
}

function beginSource(target: Source): Connection {
  const file = target.path
  stopSource()
  blocked = false
  connection = { ...target, file, epoch: ++epoch }
  setSettingsFileReadOnly(true)
  useBookmarkStore.getState().setReadOnly(true)
  useSharedJsonStatus.setState({ phase: 'connecting', sourceMode: target.mode, path: file, error: null })
  return connection
}

function report(source: Connection, message: string, localPending = false) {
  if (!isActive(source)) return
  blocked = true
  setSettingsFileReadOnly(true)
  useBookmarkStore.getState().setReadOnly(true)
  useSharedJsonStatus.setState({ phase: 'paused', sourceMode: source.mode, path: source.file, error: message })
  const result = localPending
    ? '同步未完成，数据源可能部分更新。本地修改仍保留，请先导出备份并检查数据源。'
    : '文件未被覆盖，当前缓存仅供查看。请检查文件并重新打开书签。'
  window.alert(`文件同步已暂停\n\n${message}\n\n${result}`)
}

async function synchronizeExternal(source: Connection) {
  return enqueue(async () => {
    if (!isActive(source)) return
    try {
      const remote = await readSource(source)
      const nextHash = remote.digest
      if (!isActive(source) || nextHash === baseline) return
      const stamp = snapshotStamp()
      const local = await portableSnapshot(currentSnapshot(), source.mode === 'folder')
      if (!isActive(source)) return
      if (snapshotStamp() !== stamp || hash(local) !== localBaseline) {
        return report(source, '文件与本地都有未同步修改，检测到冲突。', true)
      }
      // 先验证外部图标，再改本地库；等待文件读取期间发生的编辑不能被覆盖。
      const incoming = remote.snapshot
      const unchangedFile = (await readSource(source)).digest === nextHash
      if (!isActive(source)) return
      if (!unchangedFile || snapshotStamp() !== stamp) {
        return report(source, '刷新期间文件或本地数据发生变化，检测到冲突。', true)
      }
      const previousSnapshot = currentSnapshot()
      apply(incoming)
      useBookmarkStore.getState().setReadOnly(true)
      setSettingsFileReadOnly(true)
      try { await preserveLocalData() }
      catch (error) {
        apply(previousSnapshot)
        throw error
      }
      const appliedLocal = await portableSnapshot(currentSnapshot(), source.mode === 'folder')
      if (isActive(source)) {
        remoteBaseline = remote; saveCheckpoint(nextHash, hash(appliedLocal))
        if (source.mode === 'folder') {
          useBookmarkStore.getState().setReadOnly(false); setSettingsFileReadOnly(false)
        }
      }
    } catch (error) { report(source, error instanceof Error ? error.message : '文件读取失败') }
  })
}

async function publishLocal(source: Connection) {
  if (!isActive(source) || applying || source.mode === 'legacy') return
  return enqueue(async () => {
    if (!isActive(source)) return
    try {
      const text = await portableSnapshot(currentSnapshot(), source.mode === 'folder')
      const localHash = hash(text)
      if (!isActive(source) || localHash === localBaseline) return
      if (!remoteBaseline) throw new Error('数据源基线缺失，请重新连接')
      const receipt = await writeSource(source, JSON.parse(text) as Snapshot, remoteBaseline, () => isActive(source))
      if (receipt && isActive(source)) {
        remoteBaseline = receipt
        saveCheckpoint(receipt.digest, localHash)
      }
    } catch (error) { report(source, error instanceof Error ? error.message : '文件写入失败', true) }
  })
}

function watchSource(source: Connection) {
  unsubscribe = useBookmarkStore.subscribe((state, previous) => {
    if (!applying && (state.groups !== previous.groups || state.bookmarks !== previous.bookmarks)) void publishLocal(source)
  })
  unsubscribeSettings = useSettingsStore.subscribe(() => { if (!applying) void publishLocal(source) })
  timer = setInterval(() => { void synchronizeExternal(source) }, 1500)
}

async function activateSource(source: Connection, remote: SourceRead) {
  const incoming = remote.snapshot
  if (!isActive(source)) return false
  const previousSnapshot = currentSnapshot()
  apply(incoming)
  useBookmarkStore.getState().setReadOnly(true)
  setSettingsFileReadOnly(true)
  try { await preserveLocalData() }
  catch (error) {
    apply(previousSnapshot)
    throw error
  }
  const appliedLocal = await portableSnapshot(currentSnapshot(), source.mode === 'folder')
  if (!isActive(source)) return false
  remoteBaseline = remote
  saveCheckpoint(remote.digest, hash(appliedLocal))
  watchSource(source)
  if (source.mode === 'folder') {
    useBookmarkStore.getState().setReadOnly(false)
    setSettingsFileReadOnly(false)
  }
  useSharedJsonStatus.setState({ phase: 'connected', sourceMode: source.mode, path: source.file,
    error: source.mode === 'legacy' ? '旧 JSON（只读），请迁移到新数据文件夹' : null })
  if (source.mode === 'folder') void publishLocal(source)
  return true
}

function bindLifecycle() {
  if (lifecycleBound) return
  lifecycleBound = true
  window.addEventListener('goose-marks:plugin-enter', () => {
    if (connection && !blocked) void synchronizeExternal(connection)
    else void initializeSharedJsonSync()
  })
  window.addEventListener('goose-marks:plugin-out', () => { void flushSharedJsonSync() })
  window.addEventListener('pagehide', () => { void flushSharedJsonSync() })
}

export function sharedJsonConnected() { return !!connection }
export async function flushSharedJsonSync() {
  if (connection && isActive(connection)) await publishLocal(connection)
  await syncQueue
}

function useLocal() {
  stopSource()
  blocked = false
  remoteBaseline = undefined
  saveCheckpoint('', '')
  setSettingsFileReadOnly(false)
  useBookmarkStore.getState().setReadOnly(false)
  useSharedJsonStatus.setState({ phase: 'local', sourceMode: null, path: null, error: null })
}

const initializeSource = createSourceInitialization({
  enqueue, stamp: snapshotStamp, connected: () => !!connection, paused: () => blocked,
  connect: connectSource, useLocal
})

export async function initializeSharedJsonSync(_options: { allowDefaultCreation?: boolean } = {}) {
  if (!window.utools || !window.require) return false
  bindLifecycle()
  return initializeSource()
}

function restorePath(value: string | null) {
  if (utoolsStorage.getItem(PATH_KEY) === value) return
  if (value === null) utoolsStorage.removeItem(PATH_KEY)
  else utoolsStorage.setItem(PATH_KEY, value)
}

async function connectSource(target: Source, remote: SourceRead) {
  const file = target.path
  const savedPath = utoolsStorage.getItem(PATH_KEY)
  const previous = { source: connection, baseline, localBaseline, remoteBaseline, blocked,
    status: useSharedJsonStatus.getState(), state: useBookmarkStore.getState(), settings: currentLocalSettings() }
  utoolsStorage.setItem(PATH_KEY, file)
  if (utoolsStorage.getItem(PATH_KEY) !== file) {
    restorePath(savedPath)
    throw new Error('文件路径保存失败，未切换连接')
  }
  try {
    if (!await activateSource(beginSource(target), remote)) throw new Error('文件连接已失效')
    return true
  } catch (error) {
    restorePath(savedPath)
    stopSource()
    blocked = previous.blocked
    useBookmarkStore.setState({ groups: previous.state.groups, bookmarks: previous.state.bookmarks,
      activeGroupId: previous.state.activeGroupId, activeSubGroupId: previous.state.activeSubGroupId,
      isReadOnly: previous.state.isReadOnly })
    useSettingsStore.setState(previous.settings)
    setSettingsFileReadOnly(previous.state.isReadOnly)
    remoteBaseline = previous.remoteBaseline
    saveCheckpoint(previous.baseline, previous.localBaseline)
    if (previous.source) {
      connection = { ...previous.source, epoch: ++epoch }
      if (!blocked) watchSource(connection)
    }
    useSharedJsonStatus.setState(previous.status)
    try { window.utools?.setExpendHeight?.(previous.settings.windowHeight) } catch {}
    throw error
  }
}

async function disconnectSource() {
  const savedPath = utoolsStorage.getItem(PATH_KEY)
  await preserveLocalData()
  utoolsStorage.setItem(PATH_KEY, '')
  if (utoolsStorage.getItem(PATH_KEY) !== '') {
    restorePath(savedPath)
    throw new Error('移除连接失败，请重试')
  }
  useLocal()
  return true
}

export const migrateLegacySource = createLegacyMigration({ enqueue, active: isActive, stamp: snapshotStamp,
  snapshot: currentSnapshot, connect: connectSource, source: () => connection, baseline: () => remoteBaseline })

export const { chooseSharedJsonSource, createSharedJsonSource, removeSharedJsonSource } = createSourceActions({
  enqueue, snapshot: currentSnapshot, stamp: snapshotStamp, defaultPath: defaultSourcePath,
  connect: connectSource, disconnect: disconnectSource
})

export function sharedJsonSourcePath() { return connection?.file || utoolsStorage.getItem(PATH_KEY) || null }
