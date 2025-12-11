import type { IconSource, Bookmark } from '@/types/bookmark'

// 简化实现：关闭自动抓取，统一回退为文本图标
const textIconFromBookmark = (bookmark: Bookmark): IconSource => {
  const base = bookmark.title.trim() || bookmark.url.trim()
  const text = base ? base.slice(0, 4).toUpperCase() : '•'
  return { type: 'text', value: text }
}

export const iconToDisplayUrl = (icon?: IconSource) => {
  if (!icon) return null
  if (icon.type === 'file') return `file://${icon.path}`
  if (icon.type === 'remote') return icon.src
  return null
}

export const fetchAndCacheIcon = async (_url: string, _force = false): Promise<IconSource | null> => {
  return null
}

export const ensureIconForBookmark = async (bookmark: Bookmark, _force = false): Promise<IconSource | undefined> => {
  if (bookmark.icon) return bookmark.icon
  return textIconFromBookmark(bookmark)
}

export const bulkMatchMissing = async (_bookmarks: Bookmark[]) => {
  // 保持签名，返回空映射表示未分配非文本图标
  return new Map<string, IconSource>()
}
