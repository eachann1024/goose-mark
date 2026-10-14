import { useBookmarkStore } from '@/stores/bookmark'
import { currentFileSettings } from './settings'
import { jsonValue, portableLibrary, prepareFolder, readSource } from './folder'
import { modules, type Snapshot } from './files'

export async function previewFolderImport(): Promise<Snapshot | null> {
  const selected = await window.utools?.showOpenDialog?.({ title: '导入数据文件夹', properties: ['openDirectory'] })
  if (!selected?.[0]) return null
  return (await readSource({ path: selected[0], mode: 'folder' })).snapshot
}

export async function exportFolderBackup(connectedPath: string | null): Promise<boolean> {
  const selected = await window.utools?.showOpenDialog?.({ title: '导出完整备份（选择空文件夹）', properties: ['openDirectory', 'createDirectory'] })
  if (!selected?.[0]) return false
  const { groups, bookmarks } = useBookmarkStore.getState()
  const settings = currentFileSettings()
  const prepared = await prepareFolder({ groups, bookmarks, settings })
  // 只使用本地已展开的图片；源故障或暂停不会阻断备份。
  if (connectedPath) {
    const source = modules().path.resolve(connectedPath)
    const target = modules().path.resolve(selected[0])
    const relative = modules().path.relative(source, target)
    if (!relative || (!relative.startsWith(`..${modules().path.sep}`) && relative !== '..' && !modules().path.isAbsolute(relative))) {
      throw new Error('备份不能覆盖数据源或保存在数据源内')
    }
  }
  await portableLibrary().createFolder(selected[0], prepared, { settings: jsonValue(settings) })
  return true
}
