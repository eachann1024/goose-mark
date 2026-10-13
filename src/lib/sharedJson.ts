import { applyImportDataToStore } from '@/hooks/useImportExport'
import { useBookmarkStore } from '@/stores/bookmark'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { useSettingsStore, setSettingsFileReadOnly } from '@/stores/settings'
import { currentFileSettings } from './shared-json/settings'
import { createSharedFile, hash, modules, parse, portableSnapshot, readFile, replaceSharedFile, type Snapshot } from './shared-json/files'

const PATH_KEY = 'shared-json-source-path'
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

function beginSource(file: string): Connection {
  unsubscribe?.()
  unsubscribe = undefined
  unsubscribeSettings?.()
  unsubscribeSettings = undefined
  if (timer) clearInterval(timer)
  timer = undefined
  blocked = false
  connection = { file, epoch: ++epoch }
  setSettingsFileReadOnly(true)
  useBookmarkStore.getState().setReadOnly(true)
  return connection
}

function report(source: Connection, message: string, localPending = false) {
  if (!isActive(source)) return
  blocked = true
  setSettingsFileReadOnly(true)
  useBookmarkStore.getState().setReadOnly(true)
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

async function activateSource(source: Connection, incoming: Snapshot, remoteHash: string) {
  if (!isActive(source)) return false
  setSettingsFileReadOnly(false)
  useBookmarkStore.getState().setReadOnly(false)
  apply(incoming)
  const appliedLocal = await portableSnapshot(currentSnapshot())
  if (!isActive(source)) return false
  saveCheckpoint(remoteHash, incoming.settings ? hash(appliedLocal) : '')
  unsubscribe = useBookmarkStore.subscribe((state, previous) => {
    if (!applying && (state.groups !== previous.groups || state.bookmarks !== previous.bookmarks)) void publishLocal(source)
  })
  unsubscribeSettings = useSettingsStore.subscribe(() => { if (!applying) void publishLocal(source) })
  timer = setInterval(() => { void synchronizeExternal(source) }, 1500)
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

export async function initializeSharedJsonSync() {
  if (!window.utools || !window.require) return false
  bindLifecycle()
  // 先完成已排队的编辑；每次进入均重新读取文件，不用缓存基线阻止权威文件加载。
  return enqueue(async () => {
    let source: Connection | undefined
    try {
      const savedPath = utoolsStorage.getItem(PATH_KEY)
      const file = savedPath || defaultSourcePath()
      source = beginSource(file)
      if (!savedPath) {
        const exists = await modules().fs.lstat(file).then(() => true, error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
          throw error
        })
        if (!exists) {
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
      return await activateSource(source, incoming, hash(text))
    } catch (error) {
      if (source) report(source, error instanceof Error ? error.message : '文件读取失败')
      else {
        setSettingsFileReadOnly(true)
        useBookmarkStore.getState().setReadOnly(true)
        window.alert(`文件同步不可用：${error instanceof Error ? error.message : '文件读取失败'}`)
      }
      return false
    }
  })
}

export async function chooseSharedJsonSource() {
  const ut = window.utools
  if (!ut?.showOpenDialog) throw new Error('当前 uTools 版本不支持文件选择')
  const files = await ut.showOpenDialog({ title: '选择共享书签 JSON', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
  const file = files?.[0]
  if (!file) return false
  const text = await readFile(file)
  const incoming = parse(text)
  const stamp = snapshotStamp()
  const same = stamp === JSON.stringify(incoming)
  if (!same && !window.confirm(`该文件有效，包含 ${incoming.bookmarks.length} 条书签。使用文件后，当前本地书签会被文件内容替换；可先取消并导出本地备份。\n\n${file}\n\n确定使用该文件？`)) return false
  const source = beginSource(file)
  return enqueue(async () => {
    try {
      const portable = JSON.parse(await portableSnapshot(incoming)) as Snapshot
      if (!isActive(source)) return false
      if (snapshotStamp() !== stamp) throw new Error('选择文件期间本地库发生变化；拒绝覆盖，请重新选择文件')
      if (hash(await readFile(file)) !== hash(text)) throw new Error('选择期间文件发生变化；拒绝覆盖，请重新选择文件')
      if (!isActive(source)) return false
      if (snapshotStamp() !== stamp) throw new Error('选择文件期间本地库发生变化；拒绝覆盖，请重新选择文件')
      utoolsStorage.setItem(PATH_KEY, file)
      if (utoolsStorage.getItem(PATH_KEY) !== file) throw new Error('共享 JSON 路径保存失败，未连接文件')
      return await activateSource(source, portable, hash(text))
    } catch (error) {
      report(source, error instanceof Error ? error.message : '文件读取失败')
      throw error
    }
  })
}

export async function createSharedJsonSource() {
  const ut = window.utools
  if (!ut?.showOpenDialog) throw new Error('当前 uTools 版本不支持文件选择')
  const dirs = await ut.showOpenDialog({ title: '选择共享 JSON 保存位置', properties: ['openDirectory'] })
  const dir = dirs?.[0]
  if (!dir) return false
  const name = window.prompt('新 JSON 文件名', 'goose-marks.json')?.trim()
  if (!name) return false
  if (!/^[^/\\]+\.json$/i.test(name) || name === '.' || name === '..') throw new Error('请输入不含路径的 .json 文件名')
  const file = modules().path.join(dir, name)
  const stamp = snapshotStamp()
  const source = beginSource(file)
  return enqueue(async () => {
    try {
      const text = await portableSnapshot(currentSnapshot())
      const incoming = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
      if (!isActive(source)) return false
      if (snapshotStamp() !== stamp) throw new Error('创建期间本地库发生变化；未创建文件，请重试')
      await createSharedFile(file, text)
      if (hash(await readFile(file)) !== hash(text)) throw new Error('新文件发生变化；拒绝连接')
      if (!isActive(source)) return false
      if (snapshotStamp() !== stamp) throw new Error('创建期间本地库发生变化；文件已创建，但未连接，请重新选择文件')
      utoolsStorage.setItem(PATH_KEY, file)
      if (utoolsStorage.getItem(PATH_KEY) !== file) throw new Error('共享 JSON 路径保存失败，文件已创建但未连接')
      return await activateSource(source, incoming, hash(text))
    } catch (error) {
      report(source, error instanceof Error ? error.message : '文件写入失败')
      throw error
    }
  })
}

export function sharedJsonSourcePath() { return connection?.file || utoolsStorage.getItem(PATH_KEY) }
