import { applyImportDataToStore } from '@/hooks/useImportExport'
import { useBookmarkStore } from '@/stores/bookmark'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { createSharedFile, hash, modules, parse, portableSnapshot, readFile, replaceSharedFile, type Snapshot } from './shared-json/files'

const PATH_KEY = 'shared-json-source-path'
const BASE_KEY = 'shared-json-source-baseline'
const LOCAL_KEY = 'shared-json-local-baseline'
type Connection = { file: string; epoch: number }
let baseline = ''
let localBaseline = ''
let applying = false
let blocked = false
let epoch = 0
let connection: Connection | undefined
let timer: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined
let syncQueue = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = syncQueue.then(operation)
  syncQueue = task.then(() => undefined, () => undefined)
  return task
}

function currentSnapshot(): Snapshot {
  const { groups, bookmarks } = useBookmarkStore.getState()
  return { groups, bookmarks }
}

function snapshotStamp() { return JSON.stringify(currentSnapshot()) }
function isActive(source: Connection) { return connection === source && source.epoch === epoch && !blocked }

function saveCheckpoint(remote: string, local: string) {
  baseline = remote
  localBaseline = local
  utoolsStorage.setItem(BASE_KEY, remote)
  utoolsStorage.setItem(LOCAL_KEY, local)
}

function apply(snapshot: Snapshot) {
  applying = true
  try { applyImportDataToStore(useBookmarkStore.getState(), snapshot, 'overwrite') }
  finally { applying = false }
}

function beginSource(file: string): Connection {
  unsubscribe?.()
  unsubscribe = undefined
  if (timer) clearInterval(timer)
  timer = undefined
  blocked = false
  connection = { file, epoch: ++epoch }
  return connection
}

function report(source: Connection, message: string, localPending = false) {
  if (!isActive(source)) return
  blocked = true
  useBookmarkStore.getState().setReadOnly(true)
  const result = localPending
    ? '本地事务已保存到 uTools 本机库；共享 JSON 未更新，本地修改仍保留。请先检查并解决冲突。'
    : '文件和本地数据均未自动覆盖。请检查文件并重新打开书签。'
  window.alert(`共享 JSON 已暂停同步\n\n${message}\n\n${result}`)
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
  useBookmarkStore.getState().setReadOnly(false)
  apply(incoming)
  const appliedLocal = await portableSnapshot(currentSnapshot())
  if (!isActive(source)) return false
  saveCheckpoint(remoteHash, hash(appliedLocal))
  unsubscribe = useBookmarkStore.subscribe((state, previous) => {
    if (state.groups !== previous.groups || state.bookmarks !== previous.bookmarks) void publishLocal(source)
  })
  timer = setInterval(() => { void synchronizeExternal(source) }, 1500)
  // apply 后读取图标期间也可能编辑；这部分仍应按刚应用的基线发布。
  void publishLocal(source)
  return true
}

export async function initializeSharedJsonSync() {
  const file = utoolsStorage.getItem(PATH_KEY)
  if (!file || timer) return false
  const source = beginSource(file)
  return enqueue(async () => {
    try {
      const stamp = snapshotStamp()
      const text = await readFile(file)
      const incoming = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
      const previousRemote = utoolsStorage.getItem(BASE_KEY) || ''
      const previousLocal = utoolsStorage.getItem(LOCAL_KEY) || ''
      const localHash = hash(await portableSnapshot(currentSnapshot()))
      if (!isActive(source)) return false
      if (snapshotStamp() !== stamp) throw new Error('初始化期间本地库发生变化；拒绝覆盖')
      if (!previousRemote || !previousLocal) throw new Error('同步基线缺失；拒绝覆盖本地库，请重新选择文件')
      if (localHash !== previousLocal && hash(text) !== previousRemote) throw new Error('文件和本地库均已变化；检测到冲突，未覆盖')
      if (localHash !== previousLocal && hash(text) === previousRemote) throw new Error('本地库有未同步修改；文件未变化，拒绝覆盖')
      if (hash(await readFile(file)) !== hash(text)) throw new Error('初始化期间文件发生变化；拒绝覆盖')
      if (snapshotStamp() !== stamp) throw new Error('初始化期间本地库发生变化；拒绝覆盖')
      return await activateSource(source, incoming, hash(text))
    } catch (error) {
      report(source, error instanceof Error ? error.message : '文件读取失败')
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

export function sharedJsonSourcePath() { return utoolsStorage.getItem(PATH_KEY) }
