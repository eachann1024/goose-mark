import type { Snapshot } from './files'
import { jsonValue, portableLibrary, prepareFolder, readSource, type Source, type SourceRead } from './folder'
import { sourceAction } from './status'
import { importPreviewCounts } from '@/hooks/import-export/preview'
import { identifySource } from './folder'
import { newFolderDestination, reserveNewFolder, type NewDataFolder } from './new-folder'

export const SOURCE_PATH_KEY = 'shared-json-source-path'
type SourceRuntime = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  snapshot: () => Snapshot
  stamp: () => string
  connect: (source: Source, remote: SourceRead) => Promise<boolean>
  disconnect: () => Promise<boolean>
}

export function createSourceActions(runtime: SourceRuntime) {
  const openSource = async (directory: string) => {
    const target = await identifySource(directory)
    return runtime.enqueue(async () => {
      const stamp = runtime.stamp()
      const remote = await readSource(target)
      const counts = importPreviewCounts(remote.snapshot, runtime.snapshot())
      if (!window.confirm(`使用此文件夹中的书签、分组和设置替换当前数据？\n书签 ${counts.bookmarks} · 分组 ${counts.groups} · 回收站 ${counts.trash} · 冲突 ${counts.conflicts}\n\n${target.path}`)) return false
      if ((await readSource(target)).digest !== remote.digest || runtime.stamp() !== stamp) throw new Error('预览期间数据发生变化，请重新打开')
      return runtime.connect(target, remote)
    })
  }
  const openSharedJsonSource = (directory: string) => sourceAction(() => openSource(directory))
  const chooseSharedJsonSource = () => sourceAction(async () => {
    const files = await window.utools?.showOpenDialog?.({ title: '选择数据文件夹', properties: ['openDirectory'] })
    return files?.[0] ? openSource(files[0]) : false
  })
  const createSharedJsonSource = (location: NewDataFolder) => sourceAction(() =>
    runtime.enqueue(async () => {
      const target: Source = { path: await newFolderDestination(location), mode: 'folder' }
      const stamp = runtime.stamp()
      const snapshot = runtime.snapshot()
      const prepared = await prepareFolder(snapshot)
      if (runtime.stamp() !== stamp) throw new Error('创建期间本地数据发生变化，请重试')
      await reserveNewFolder(target.path)
      await portableLibrary().createFolder(target.path, prepared, { settings: jsonValue(snapshot.settings) })
      const remote = await readSource(target)
      if (runtime.stamp() !== stamp) throw new Error('创建期间本地数据发生变化，文件夹已保留，请重新打开')
      return runtime.connect(target, remote)
    }))
  const removeSharedJsonSource = () => sourceAction(async () => {
    if (!window.confirm('移除数据文件夹？当前书签和设置会保留在应用中，磁盘上的文件不会删除。')) return false
    return runtime.enqueue(runtime.disconnect)
  })
  return { chooseSharedJsonSource, openSharedJsonSource, createSharedJsonSource, removeSharedJsonSource }
}
