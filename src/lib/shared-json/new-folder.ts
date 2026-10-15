import { modules } from './files'

export type NewDataFolder = { directory: string; name: string }

export async function newFolderDestination({ directory, name }: NewDataFolder) {
  const { fs, path } = modules()
  const folderName = name.trim()
  if (!directory || !path.isAbsolute(directory)) throw new Error('请选择保存位置')
  if (!folderName || folderName === '.' || folderName === '..' || /[/\\\0<>:"|?*]/.test(folderName)) {
    throw new Error('请输入有效的文件夹名称，不要包含斜杠等特殊字符')
  }
  const parent = await fs.realpath(directory)
  if (!(await fs.lstat(parent)).isDirectory()) throw new Error('保存位置不是文件夹，请重新选择')
  const target = path.join(parent, folderName)
  try {
    await fs.lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return target
    throw error
  }
  throw new Error('这个名称已存在，请换一个名称；连接已有数据请使用“打开文件夹”')
}

export async function reserveNewFolder(target: string) {
  try {
    // mkdir must claim a new child; selecting a parent never authorizes reusing its contents.
    await modules().fs.mkdir(target, { mode: 0o700 })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') throw new Error('这个名称已存在，请换一个名称')
    if (code === 'EACCES' || code === 'EPERM') throw new Error('没有权限在此位置创建文件夹，请选择其他位置')
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error('保存位置已不可用，请重新选择')
    throw error
  }
}
