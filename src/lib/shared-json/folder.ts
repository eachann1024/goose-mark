import { createPortableLibrary, type Json, type PortableDocument } from '@/lib/portable-library'
import { modules, parse, portableSnapshot, hash, readFile, type Snapshot } from './files'
import { parseFileSettings } from './settings'

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
export type Source = { path: string; mode: 'folder' | 'legacy' }
export type SourceRead = { snapshot: Snapshot; digest: string; bookmarks: string; settings: string | null }
export const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Json

export async function identifySource(path: string): Promise<Source> {
  const stat = await modules().fs.lstat(path)
  if (stat.isSymbolicLink()) throw new Error('数据源不能是符号链接')
  if (stat.isDirectory()) return { path, mode: 'folder' }
  if (stat.isFile()) {
    // 兼容上一轮曾保存的目录内 bookmarks.json 路径。
    if (modules().path.basename(path) === 'bookmarks.json') {
      const value = await portableLibrary().readLegacyFile(path)
      if ((value.document as { schemaVersion?: number })?.schemaVersion === 1) {
        return { path: modules().path.dirname(path), mode: 'folder' }
      }
    }
    return { path, mode: 'legacy' }
  }
  throw new Error('数据源不是普通文件或文件夹')
}

export async function readSource(source: Source): Promise<SourceRead> {
  if (source.mode === 'legacy') {
    const text = await readFile(source.path)
    const snapshot = JSON.parse(await portableSnapshot(parse(text))) as Snapshot
    return { snapshot, digest: hash(text), bookmarks: hash(text), settings: null }
  }
  return portableLibrary().withLock(source.path, async () => {
    const result = await portableLibrary().read(source.path, { includeSettings: true })
    const snapshot = parse(JSON.stringify(result.document), true)
    if (result.settings) snapshot.settings = parseFileSettings(result.settings.document)
    return { snapshot, bookmarks: result.bookmarksDigest, settings: result.settings?.digest ?? null,
      digest: `${result.bookmarksDigest}:${result.settings?.digest ?? ''}` }
  })
}

function portableIcon(icon: unknown): unknown {
  if (!icon || typeof icon !== 'object' || Array.isArray(icon)) return icon
  const value = { ...(icon as Record<string, unknown>) }
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
  if (source.mode === 'legacy') throw new Error('旧 JSON 数据源只读，请迁移到新数据文件夹')
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
