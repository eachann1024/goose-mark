import { createPortableLibrary, type Json, type PortableDocument } from '@/lib/portable-library'
import { modules, parse, type Snapshot } from './files'
import { parseFileSettings } from './settings'
import { normalizeInlineIcon } from '@/lib/inlineIcon'
import type { IconSource } from '@/types/bookmark'

// 共用核心原样复制自 raycast-mark/src/portable-library.ts；协议修改需同步两仓。
let library: ReturnType<typeof createPortableLibrary> | undefined
export function portableLibrary() {
  if (!library) {
    const { fs, path } = modules()
    const crypto = window.require!('node:crypto') as typeof import('node:crypto')
    const { Buffer } = window.require!('node:buffer') as typeof import('node:buffer')
    library = createPortableLibrary({ fs, path, crypto, Buffer })
  }
  return library
}
export type Source = { path: string; mode: 'folder' }
export type SourceRead = { snapshot: Snapshot; digest: string; bookmarks: string; settings: string | null }
export const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Json

export async function identifySource(path: string): Promise<Source> {
  const stat = await modules().fs.lstat(path)
  if (stat.isSymbolicLink()) throw new Error('数据源不能是符号链接')
  if (stat.isDirectory()) return { path, mode: 'folder' }
  throw new Error('请选择数据文件夹')
}

export async function readSource(source: Source): Promise<SourceRead> {
  return portableLibrary().withLock(source.path, async () => {
    const result = await portableLibrary().read(source.path, { includeSettings: true })
    const snapshot = parse(JSON.stringify(result.document), true)
    if (result.settings) snapshot.settings = parseFileSettings(result.settings.document)
    return { snapshot, bookmarks: result.bookmarksDigest, settings: result.settings?.digest ?? null,
      digest: `${result.bookmarksDigest}:${result.settings?.digest ?? ''}` }
  })
}

function portableIcon(icon: IconSource | undefined): unknown {
  if (!icon) return icon
  const value: Record<string, unknown> = { ...normalizeInlineIcon(icon) }
  delete value.cacheRef
  delete value.dataRef
  if (value.type === 'remote' && !(typeof value.cache === 'string' && value.cache.startsWith('data:image/')) && 'cacheRef' in (icon as object)) {
    throw new Error('远程图标缓存未完整读取，无法写入共享数据源')
  }
  if (value.type === 'custom' && (typeof value.data !== 'string' || !value.data.startsWith('data:image/'))) {
    throw new Error('自定义图标数据未完整读取，无法写入共享数据源')
  }
  return value
}

export async function prepareFolder(snapshot: Snapshot) {
  const bookmarks = snapshot.bookmarks.map(bookmark => ({ ...bookmark, icon: portableIcon(bookmark.icon) }))
  const groups = snapshot.groups
  const document = jsonValue({ schemaVersion: 1, source: 'goose-marks', groups, bookmarks }) as unknown as PortableDocument
  return portableLibrary().prepare(document, { loadIcon: async reference => {
    if (!modules().path.isAbsolute(reference)) throw new Error('本地图标路径无效，无法导出完整备份')
    return portableLibrary().readIconFile(reference, modules().path.dirname(reference))
  } })
}

export async function writeSource(source: Source, snapshot: Snapshot, expected: SourceRead, active: () => boolean) {
  const prepared = await prepareFolder(snapshot)
  return portableLibrary().withLock(source.path, async lock => {
    if (!active()) return null
    // 验证现有图片，避免在丢图或损坏时继续发布。
    const existing = await portableLibrary().read(source.path, { includeSettings: true })
    if (existing.bookmarksDigest !== expected.bookmarks || (existing.settings?.digest ?? null) !== expected.settings) {
      throw new Error('数据源已被外部修改，拒绝覆盖')
    }
    if (!active()) return null
    const receipt = await portableLibrary().writeLocked(lock, prepared, {
      expected: { bookmarks: expected.bookmarks, settings: expected.settings },
      settings: jsonValue(snapshot.settings)
    })
    return { snapshot, bookmarks: receipt.bookmarksDigest, settings: receipt.settingsDigest ?? null,
      digest: `${receipt.bookmarksDigest}:${receipt.settingsDigest ?? ''}` }
  })
}
