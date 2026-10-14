import { createSharedFile, hash, modules, parse, portableSnapshot, readFile, type Snapshot } from './files'
import { sourceAction } from './status'

export const SOURCE_PATH_KEY = 'shared-json-source-path'

type SourceRuntime = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  snapshot: () => Snapshot
  stamp: () => string
  defaultPath: () => string
  connect: (file: string, incoming: Snapshot, remoteHash: string) => Promise<boolean>
  disconnect: () => Promise<boolean>
}

export function createSourceActions(runtime: SourceRuntime) {
  const chooseSharedJsonSource = () => sourceAction(async () => {
    const ut = window.utools
    if (!ut?.showOpenDialog) throw new Error('当前版本不支持文件选择')
    const files = await ut.showOpenDialog({ title: '选择书签 JSON 文件', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    const file = files?.[0]
    if (!file) return false
    return runtime.enqueue(async () => {
      const stamp = runtime.stamp()
      const text = await readFile(file)
      const incoming = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
      if (!window.confirm(`使用此文件后，当前书签和设置将被文件中的内容替换。文件含 ${incoming.bookmarks.length} 条书签。\n\n${file}\n\n确定使用？`)) return false
      if (hash(await readFile(file)) !== hash(text)) throw new Error('选择期间文件发生变化，请重新选择')
      if (runtime.stamp() !== stamp) throw new Error('选择期间当前数据发生变化，请重新选择')
      return runtime.connect(file, incoming, hash(text))
    })
  })

  const createSharedJsonSource = () => sourceAction(async () => {
    const ut = window.utools
    if (!ut?.showSaveDialog) throw new Error('当前版本不支持保存文件对话框')
    const selectedPath = await ut.showSaveDialog({
      title: '将当前书签和设置保存为新文件', defaultPath: runtime.defaultPath(),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!selectedPath) return false
    const file = /\.json$/i.test(selectedPath) ? selectedPath : `${selectedPath}.json`
    return runtime.enqueue(async () => {
      try {
        await modules().fs.lstat(file)
        throw new Error('文件已存在，请选择已有文件或使用新的文件名')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const stamp = runtime.stamp()
      const text = await portableSnapshot(runtime.snapshot())
      const incoming = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
      if (runtime.stamp() !== stamp) throw new Error('创建期间当前数据发生变化，未创建文件')
      await createSharedFile(file, text)
      if (hash(await readFile(file)) !== hash(text)) throw new Error('新文件发生变化，未连接文件')
      if (runtime.stamp() !== stamp) throw new Error('创建期间当前数据发生变化，文件已创建，请重新选择')
      return runtime.connect(file, incoming, hash(text))
    })
  })

  const removeSharedJsonSource = () => sourceAction(async () => {
    if (!window.confirm('移除文件连接后，当前书签和设置将继续保存在本地，原 JSON 文件会保留。\n\n确定移除连接？')) return false
    return runtime.enqueue(runtime.disconnect)
  })

  return { chooseSharedJsonSource, createSharedJsonSource, removeSharedJsonSource }
}
