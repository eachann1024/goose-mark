import { applyImportDataToStore } from '@/hooks/useImportExport'
import { useBookmarkStore } from '@/stores/bookmark'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { useSettingsStore, setSettingsFileReadOnly } from '@/stores/settings'
import { currentFileSettings } from './shared-json/settings'
import { createSharedFile, hash, modules, parse, portableSnapshot, readFile, replaceSharedFile, type Snapshot } from './shared-json/files'
import { createSourceActions, SOURCE_PATH_KEY } from './shared-json/source-actions'
import { sourceAction, useSharedJsonStatus } from './shared-json/status'
import { preserveLocalData } from './shared-json/local-cache'
export { useSharedJsonStatus } from './shared-json/status'

const PATH_KEY = SOURCE_PATH_KEY
type Connection = { file: string; epoch: number }
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
let defaultCreationAllowed = true
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

function saveCheckpoint(remote: string, local: string) {
  baseline = remote
  localBaseline = local
}

function apply(snapshot: Snapshot) {
  applying = true
  try {
    applyImportDataToStore(useBookmarkStore.getState(), snapshot, 'overwrite')
    useBookmarkStore.getState().ensureValidSelection()
    if (snapshot.settings) {
      useSettingsStore.setState(snapshot.settings)
      window.utools?.setExpendHeight?.(snapshot.settings.windowHeight)
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

function beginSource(file: string): Connection {
  stopSource()
  blocked = false
  connection = { file, epoch: ++epoch }
  setSettingsFileReadOnly(true)
  useBookmarkStore.getState().setReadOnly(true)
  useSharedJsonStatus.setState({ phase: 'connecting', path: file, error: null })
  return connection
}

function report(source: Connection, message: string, localPending = false) {
  if (!isActive(source)) return
  blocked = true
  setSettingsFileReadOnly(true)
  useBookmarkStore.getState().setReadOnly(true)
  useSharedJsonStatus.setState({ phase: 'paused', path: source.file, error: message })
  const result = localPending
    ? 'JSON 未更新，本地修改仍保留在当前缓存。请先导出备份并检查文件。'
    : '文件未被覆盖，当前缓存仅供查看。请检查文件并重新打开书签。'
  window.alert(`文件同步已暂停\n\n${message}\n\n${result}`)
}

async function synchronizeExternal(source: Connection) {
  return enqueue(async () => {
    if (!isActive(source)) return
    try {
      const text = await readFile(source.file)
      const nextHash = hash(text)
      if (!isActive(source) || nextHash === baseline) return
      const stamp = snapshotStamp()
      const local = await portableSnapshot(currentSnapshot())
      if (!isActive(source)) return
      if (snapshotStamp() !== stamp || hash(local) !== localBaseline) {
        return report(source, '文件与本地都有未同步修改，检测到冲突。', true)
      }
      // 先验证外部图标，再改本地库；等待文件读取期间发生的编辑不能被覆盖。
      const incoming = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
      const unchangedFile = hash(await readFile(source.file)) === nextHash
      if (!isActive(source)) return
      if (!unchangedFile || snapshotStamp() !== stamp) {
        return report(source, '刷新期间文件或本地数据发生变化，检测到冲突。', true)
      }
      apply(incoming)
      const appliedLocal = await portableSnapshot(currentSnapshot())
      if (isActive(source)) saveCheckpoint(nextHash, hash(appliedLocal))
    } catch (error) { report(source, error instanceof Error ? error.message : '文件读取失败') }
  })
}

async function publishLocal(source: Connection) {
  if (!isActive(source) || applying) return
  return enqueue(async () => {
    if (!isActive(source)) return
    try {
      const text = await portableSnapshot(currentSnapshot())
      const localHash = hash(text)
      if (!isActive(source) || localHash === localBaseline) return
      const existing = await readFile(source.file)
      if (!isActive(source)) return
      if (hash(existing) !== baseline) return report(source, '文件已被外部修改；拒绝覆盖。', true)
      if (await replaceSharedFile(source.file, text, baseline, () => isActive(source)) && isActive(source)) {
        saveCheckpoint(hash(text), localHash)
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

async function activateSource(source: Connection, incoming: Snapshot, remoteHash: string) {
  if (!isActive(source)) return false
  setSettingsFileReadOnly(false)
  useBookmarkStore.getState().setReadOnly(false)
  apply(incoming)
  const appliedLocal = await portableSnapshot(currentSnapshot())
  if (!isActive(source)) return false
  saveCheckpoint(remoteHash, incoming.settings ? hash(appliedLocal) : '')
  watchSource(source)
  useSharedJsonStatus.setState({ phase: 'connected', path: source.file, error: null })
  // apply 后读取图标期间也可能编辑；这部分仍应按刚应用的基线发布。
  void publishLocal(source)
  return true
}

function defaultSourcePath() {
  const documents = window.utools?.getPath('documents')
  if (!documents) throw new Error('无法获取用户文档目录')
  return modules().path.join(documents, 'goose-marks.json')
}

function bindLifecycle() {
  if (lifecycleBound) return
  lifecycleBound = true
  window.addEventListener('goose-marks:plugin-enter', () => { void initializeSharedJsonSync() })
  window.addEventListener('goose-marks:plugin-out', () => { void flushSharedJsonSync() })
  window.addEventListener('pagehide', () => { void flushSharedJsonSync() })
}

export function sharedJsonConnected() { return !!connection }

export async function flushSharedJsonSync() {
  if (connection && isActive(connection)) await publishLocal(connection)
  await syncQueue
}

export async function initializeSharedJsonSync(options: { allowDefaultCreation?: boolean } = {}) {
  if (!window.utools || !window.require) return false
  if (options.allowDefaultCreation === false) defaultCreationAllowed = false
  bindLifecycle()
  // 先完成已排队的编辑；每次进入均重新读取文件，不用缓存基线阻止权威文件加载。
  return sourceAction(() => enqueue(async () => {
    let source: Connection | undefined
    try {
      const savedPath = utoolsStorage.getItem(PATH_KEY)
      // 空路径是用户主动移除连接的持久化标记，不能回落到默认文件。
      if (savedPath === '') {
        stopSource()
        blocked = false
        setSettingsFileReadOnly(!defaultCreationAllowed)
        useBookmarkStore.getState().setReadOnly(!defaultCreationAllowed)
        useSharedJsonStatus.setState({ phase: 'local', path: null, error: null })
        return false
      }
      const file = savedPath || defaultSourcePath()
      source = beginSource(file)
      if (!savedPath) {
        const exists = await modules().fs.lstat(file).then(() => true, error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
          throw error
        })
        if (!exists) {
          if (!defaultCreationAllowed) throw new Error('旧缓存读取失败，未创建默认文件。请在设置中选择已有 JSON 文件')
          await modules().fs.mkdir(modules().path.dirname(file), { recursive: true })
          try { await createSharedFile(file, await portableSnapshot(currentSnapshot())) }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
        }
      }
      const text = await readFile(file)
      const incoming = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
      if (!isActive(source)) return false
      if (hash(await readFile(file)) !== hash(text)) throw new Error('初始化期间文件发生变化；拒绝覆盖')
      utoolsStorage.setItem(PATH_KEY, file)
      if (utoolsStorage.getItem(PATH_KEY) !== file) throw new Error('JSON 路径保存失败，未连接文件')
      const activated = await activateSource(source, incoming, hash(text))
      if (activated) defaultCreationAllowed = true
      return activated
    } catch (error) {
      if (source) report(source, error instanceof Error ? error.message : '文件读取失败')
      else {
        setSettingsFileReadOnly(true)
        useBookmarkStore.getState().setReadOnly(true)
        window.alert(`文件同步不可用：${error instanceof Error ? error.message : '文件读取失败'}`)
      }
      return false
    }
  }))
}

function restorePath(value: string | null) {
  if (utoolsStorage.getItem(PATH_KEY) === value) return
  if (value === null) utoolsStorage.removeItem(PATH_KEY)
  else utoolsStorage.setItem(PATH_KEY, value)
}

async function connectSource(file: string, incoming: Snapshot, remoteHash: string) {
  const savedPath = utoolsStorage.getItem(PATH_KEY)
  const previous = { source: connection, baseline, localBaseline, blocked,
    status: useSharedJsonStatus.getState(), state: useBookmarkStore.getState(), settings: currentFileSettings() }
  utoolsStorage.setItem(PATH_KEY, file)
  if (utoolsStorage.getItem(PATH_KEY) !== file) {
    restorePath(savedPath)
    throw new Error('文件路径保存失败，未切换连接')
  }
  try {
    if (!await activateSource(beginSource(file), incoming, remoteHash)) throw new Error('文件连接已失效')
    defaultCreationAllowed = true
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
    saveCheckpoint(previous.baseline, previous.localBaseline)
    if (previous.source) {
      connection = { file: previous.source.file, epoch: ++epoch }
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
  stopSource()
  blocked = false
  saveCheckpoint('', '')
  setSettingsFileReadOnly(false)
  useBookmarkStore.getState().setReadOnly(false)
  useSharedJsonStatus.setState({ phase: 'local', path: null, error: null })
  return true
}

export const { chooseSharedJsonSource, createSharedJsonSource, removeSharedJsonSource } = createSourceActions({
  enqueue, snapshot: currentSnapshot, stamp: snapshotStamp, defaultPath: defaultSourcePath,
  connect: connectSource, disconnect: disconnectSource
})

export function sharedJsonSourcePath() { return connection?.file || utoolsStorage.getItem(PATH_KEY) || null }
