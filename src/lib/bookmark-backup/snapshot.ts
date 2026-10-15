import { parseJsonImportText } from '@/hooks/useImportExport'
import type { Bookmark, Group } from '@/types/bookmark'
import { parseFileSettings, type FileSettings } from './settings'
import { normalizeInlineIcon } from '@/lib/inlineIcon'

const MAX_BYTES = 100 * 1024 * 1024
const MAX_ICON_BYTES = 2 * 1024 * 1024
export type Snapshot = { groups: Group[]; bookmarks: Bookmark[]; settings?: FileSettings }
type Fs = typeof import('node:fs/promises')
type NativeFs = typeof import('node:fs')
let fs: Fs | undefined
let nativeFs: NativeFs | undefined
function modules() {
  if (!window.require) throw new Error('当前环境不支持文件访问')
  fs ??= window.require('node:fs/promises') as Fs
  nativeFs ??= window.require('node:fs') as NativeFs
  return { fs, nativeFs }
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

export function parse(text: string): Snapshot {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('备份 JSON 超过 100 MiB')
  const shape = JSON.parse(text) as { groups?: unknown; bookmarks?: unknown; settings?: unknown }
  if (!Array.isArray(shape?.groups) || !Array.isArray(shape?.bookmarks)) throw new Error('备份 JSON 必须是含 groups 与 bookmarks 的书签数据文件')
  const result = parseJsonImportText(text)
  if (!result.ok) throw new Error(result.message)
  if (result.stats.skipped) throw new Error('备份 JSON 含无效或重复书签，拒绝读取')
  // 导入器负责结构校验与旧格式迁移；完整备份还需保留导入器未包含的统计、恢复位置与同步元数据。
  const rawBookmarks = shape.bookmarks as Bookmark[]
  const rawGroups = shape.groups as Group[]
  const rawBookmarkById = new Map(rawBookmarks.map(item => [item.id, item]))
  const bookmarkIds = new Set(rawBookmarks.map(bookmark => bookmark.id))
  const groupIds = new Set<string>()
  const subIds = new Set<string>()
  for (const group of rawGroups) {
    if (!group || typeof group.id !== 'string' || groupIds.has(group.id) || !Array.isArray(group.children)) throw new Error('JSON 分组无效或重复')
    groupIds.add(group.id)
    for (const sub of group.children) {
      if (!sub || typeof sub.id !== 'string' || subIds.has(sub.id) || !Array.isArray(sub.bookmarkIds) || sub.bookmarkIds.some(id => typeof id !== 'string' || !bookmarkIds.has(id))) throw new Error('JSON 子分组无效或重复')
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
  const bytes = atob(match[2])
  if (btoa(bytes) !== match[2] || bytes.length > MAX_ICON_BYTES) throw new Error(`图标超过 2 MiB 或编码无效，未写入：${title}`)
  const mime = match[1] === 'image/vnd.microsoft.icon' ? 'image/x-icon' : match[1]
  return `data:${mime};base64,${match[2]}`
}

export async function portableSnapshot(snapshot: Snapshot): Promise<string> {
  const data = structuredClone(snapshot)
  for (const bookmark of data.bookmarks) {
    if (!bookmark.icon) continue
    const icon = normalizeInlineIcon(bookmark.icon)
    bookmark.icon = icon
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
      icon.cache = validateIconData(icon.cache, bookmark.title)
    } else if (icon.type === 'custom') {
      icon.data = validateIconData(icon.data, bookmark.title)
    }
  }
  const text = JSON.stringify(data, null, 2)
  const size = new TextEncoder().encode(text).byteLength
  if (size > MAX_BYTES) throw new Error('备份 JSON 超过 100 MiB，未写入')
  return text
}
