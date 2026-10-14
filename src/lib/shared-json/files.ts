import { parseJsonImportText } from '@/hooks/useImportExport'
import type { Bookmark, Group } from '@/types/bookmark'
import { parseFileSettings, type FileSettings } from './settings'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ICON_BYTES = 2 * 1024 * 1024
export type Snapshot = { groups: Group[]; bookmarks: Bookmark[]; settings?: FileSettings }
type Fs = typeof import('node:fs/promises')
type NativeFs = typeof import('node:fs')
let fs: Fs | undefined
let nativeFs: NativeFs | undefined
let pathModule: typeof import('node:path') | undefined
export function modules() {
  if (!window.require) throw new Error('当前环境不支持文件访问')
  fs ??= window.require('node:fs/promises') as Fs
  nativeFs ??= window.require('node:fs') as NativeFs
  pathModule ??= window.require('node:path') as typeof import('node:path')
  return { fs, nativeFs, path: pathModule }
}

async function readRegularFile(file: string, max: number) {
  const { fs, nativeFs } = modules()
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || before.size > max) throw new Error('文件缺失、不是普通文件或超过大小限制')
  const handle = await fs.open(file, nativeFs.constants.O_RDONLY | nativeFs.constants.O_NOFOLLOW)
  try {
    const after = await handle.stat()
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) throw new Error('文件在读取时发生变化')
    const bytes = await handle.readFile()
    if (bytes.byteLength > max) throw new Error('文件超过大小限制')
    return bytes
  } finally { await handle.close() }
}

export function hash(value: string) {
  const crypto = window.require?.('node:crypto') as typeof import('node:crypto') | undefined
  if (!crypto) throw new Error('当前环境不支持文件校验')
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function parse(text: string): Snapshot {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('共享 JSON 超过 10 MiB')
  const shape = JSON.parse(text) as { groups?: unknown; bookmarks?: unknown; settings?: unknown }
  if (!Array.isArray(shape?.groups) || !Array.isArray(shape?.bookmarks)) throw new Error('共享 JSON 必须是含 groups 与 bookmarks 的书签数据文件')
  const result = parseJsonImportText(text)
  if (!result.ok) throw new Error(result.message)
  if (result.stats.skipped) throw new Error('共享 JSON 含无效或重复书签，拒绝读取')
  // 导入器负责结构校验与旧格式迁移；文件数据源还需保留导入器未包含的统计、恢复位置与同步元数据。
  const rawBookmarks = shape.bookmarks as Bookmark[]
  const rawGroups = shape.groups as Group[]
  const rawBookmarkById = new Map(rawBookmarks.map(item => [item.id, item]))
  const groupIds = new Set<string>()
  const subIds = new Set<string>()
  for (const group of rawGroups) {
    if (!group || typeof group.id !== 'string' || groupIds.has(group.id) || !Array.isArray(group.children)) throw new Error('JSON 分组无效或重复')
    groupIds.add(group.id)
    for (const sub of group.children) {
      if (!sub || typeof sub.id !== 'string' || subIds.has(sub.id) || !Array.isArray(sub.bookmarkIds) || sub.bookmarkIds.some(id => typeof id !== 'string')) throw new Error('JSON 子分组无效或重复')
      subIds.add(sub.id)
    }
  }
  const bookmarks = result.data.bookmarks.map(bookmark => {
    const raw = rawBookmarkById.get(bookmark.id)
    if (!raw) return bookmark
    for (const key of ['visits', 'lastUsed', 'serverUpdatedAt'] as const) {
      if (raw[key] !== undefined && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || raw[key]! < 0)) throw new Error(`书签 ${key} 无效`)
    }
    if (raw.prevLocations !== undefined && (!Array.isArray(raw.prevLocations) || raw.prevLocations.some(location => !location || typeof location.groupId !== 'string' || typeof location.subGroupId !== 'string'))) throw new Error('书签恢复位置无效')
    return { ...raw, ...bookmark }
  })
  const groups = result.data.groups.map(group => {
    const raw = rawGroups.find(item => item?.id === group.id)
    return { ...raw, ...group, children: group.children.map(sub => ({ ...raw?.children?.find(item => item?.id === sub.id), ...sub })) }
  })
  return { groups, bookmarks, ...(shape.settings === undefined ? {} : { settings: parseFileSettings(shape.settings) }) }
}

function validateIconData(value: string, title: string) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value)
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new Error(`图标数据格式无效，未写入：${title}`)
  const { Buffer } = window.require!('node:buffer') as typeof import('node:buffer')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.toString('base64') !== match[2] || bytes.byteLength > MAX_ICON_BYTES) throw new Error(`图标超过 2 MiB 或编码无效，未写入：${title}`)
  const mime = match[1] === 'image/vnd.microsoft.icon' ? 'image/x-icon' : match[1]
  return `data:${mime};base64,${match[2]}`
}

export async function readFile(file: string) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await readRegularFile(file, MAX_BYTES))
  parse(text)
  return text
}

export async function portableSnapshot(snapshot: Snapshot): Promise<string> {
  const data = structuredClone(snapshot)
  for (const bookmark of data.bookmarks) {
    const icon = bookmark.icon
    if (!icon) continue
    if (icon.type === 'file') {
      let bytes: Buffer
      try { bytes = await readRegularFile(icon.path, MAX_ICON_BYTES) as Buffer }
      catch { throw new Error(`图标文件不可用，未写入：${bookmark.title}`) }
      if (bytes.byteLength > MAX_ICON_BYTES) throw new Error(`图标过大，未写入：${bookmark.title}`)
      const ext = icon.path.split('.').pop()?.toLowerCase()
      const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon' }
      if (!ext || !mime[ext]) throw new Error(`图标格式不支持，未写入：${bookmark.title}`)
      bookmark.icon = { type: 'custom', data: `data:${mime[ext]};base64,${bytes.toString('base64')}`, bgColor: icon.bgColor }
    } else if (icon.type === 'remote' && icon.cache?.startsWith('data:image/')) {
      bookmark.icon = { type: 'custom', data: validateIconData(icon.cache, bookmark.title), bgColor: icon.bgColor }
    } else if (icon.type === 'custom') {
      icon.data = validateIconData(icon.data, bookmark.title)
    }
  }
  const text = JSON.stringify(data, null, 2)
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('共享 JSON 超过 10 MiB，未写入')
  return text
}

export async function replaceSharedFile(file: string, text: string, expectedHash: string, isActive: () => boolean) {
  const { fs, path } = modules()
  const lock = `${file}.lock`
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  let owned: { dev: number; ino: number } | undefined
  try {
    handle = await fs.open(lock, 'wx', 0o600)
    owned = await handle.stat()
    if (!isActive()) return false
    if (hash(await readFile(file)) !== expectedHash) throw new Error('写入前文件再次变化；拒绝覆盖。')
    if (!isActive()) return false
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`)
    try {
      const tempHandle = await fs.open(temp, 'wx', 0o600)
      try { await tempHandle.writeFile(text, 'utf8'); await tempHandle.sync() } finally { await tempHandle.close() }
      if (hash(await readFile(file)) !== expectedHash) throw new Error('写入前文件再次变化；拒绝覆盖。')
      if (!isActive()) return false
      await fs.rename(temp, file)
      return true
    } finally { await fs.unlink(temp).catch(() => undefined) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('另一个写入正在进行；拒绝覆盖。')
    throw error
  } finally {
    await handle?.close().catch(() => undefined)
    if (owned) {
      const current = await fs.lstat(lock).catch(() => undefined)
      if (current?.dev === owned.dev && current.ino === owned.ino) await fs.unlink(lock).catch(() => undefined)
    }
  }
}

export async function createSharedFile(file: string, text: string) {
  const { fs } = modules()
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  let created = false
  let owned: { dev: number; ino: number } | undefined
  try {
    handle = await fs.open(file, 'wx', 0o600)
    created = true
    owned = await handle.stat()
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle?.close().catch(() => undefined)
    handle = undefined
    let cleanupFailed = false
    if (created && owned) {
      const current = await fs.lstat(file).catch(() => undefined)
      if (current?.isFile() && !current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino) {
        try { await fs.unlink(file) } catch { cleanupFailed = true }
      }
    }
    if (cleanupFailed) throw new Error(`新文件写入失败且清理失败，请手工检查：${file}`)
    throw error
  } finally { await handle?.close().catch(() => undefined) }
}
