import { modules, type Snapshot } from './files'
import { jsonValue, portableLibrary, prepareFolder, readSource, type Source, type SourceRead } from './folder'
import { sourceAction, useSharedJsonStatus } from './status'
import { importPreviewCounts } from '@/hooks/import-export/preview'
import { identifySource } from './folder'

export const SOURCE_PATH_KEY = 'shared-json-source-path'
type SourceRuntime = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  snapshot: () => Snapshot
  stamp: () => string
  defaultPath: () => string
  connect: (source: Source, remote: SourceRead) => Promise<boolean>
  disconnect: () => Promise<boolean>
}

export function createSourceActions(runtime: SourceRuntime) {
  const chooseSharedJsonSource = () => sourceAction(async () => {
    const files = await window.utools?.showOpenDialog?.({ title: '选择数据文件夹', properties: ['openDirectory'] })
    if (!files?.[0]) return false
    const target = await identifySource(files[0])
    return runtime.enqueue(async () => {
      const stamp = runtime.stamp()
      const remote = await readSource(target)
      const counts = importPreviewCounts(remote.snapshot, runtime.snapshot())
      if (!window.confirm(`打开数据文件夹将替换当前书签与分组，并读取其中的 Goose 设置。\n书签 ${counts.bookmarks} · 分组 ${counts.groups} · 回收站 ${counts.trash} · 冲突 ${counts.conflicts}\n\n${target.path}\n\n确定连接？`)) return false
      if ((await readSource(target)).digest !== remote.digest || runtime.stamp() !== stamp) throw new Error('预览期间数据发生变化，请重新打开')
      return runtime.connect(target, remote)
    })
  })
  const createSharedJsonSource = () => sourceAction(async () => {
    const selected = await window.utools?.showOpenDialog?.({ title: '新建数据文件夹（选择空文件夹）', properties: ['openDirectory', 'createDirectory'] })
    if (!selected?.[0]) return false
    const target: Source = { path: selected[0], mode: 'folder' }
    return runtime.enqueue(async () => {
      if (!window.confirm('将当前书签和 Goose 设置保存到新数据文件夹并连接。确定新建？')) return false
      const stamp = runtime.stamp()
      const snapshot = runtime.snapshot()
      const prepared = await prepareFolder(snapshot)
      if (runtime.stamp() !== stamp) throw new Error('创建期间本地数据发生变化，请重试')
      await portableLibrary().createFolder(target.path, prepared, { settings: jsonValue(snapshot.settings) })
      const remote = await readSource(target)
      if (runtime.stamp() !== stamp) throw new Error('创建期间本地数据发生变化，文件夹已保留，请重新打开')
      return runtime.connect(target, remote)
    })
  })
  const removeSharedJsonSource = () => sourceAction(async () => {
    if (!window.confirm('断开连接后，当前书签和设置保留在本地，数据文件夹不会删除。确定断开？')) return false
    return runtime.enqueue(runtime.disconnect)
  })
  return { chooseSharedJsonSource, createSharedJsonSource, removeSharedJsonSource }
}
