import type { BookmarkSnapshot } from './stateRepository'

export class BookmarkDataPendingError extends Error {
  constructor(message = '书签同步尚未完整到达，稍后将自动重试。') {
    super(message)
    this.name = 'BookmarkDataPendingError'
  }
}

// 分组索引和书签 locations 必须描述同一关系；双读相同并不代表跨文档同步已完成。
export function assertBookmarkIntegrity(snapshot: BookmarkSnapshot): void {
  const ids = new Set<string>()
  const groupIds = new Set<string>()
  const subIds = new Set<string>()
  const indexed = new Map<string, Set<string>>()
  for (const bookmark of snapshot.bookmarks) {
    if (!bookmark || typeof bookmark.id !== 'string' || ids.has(bookmark.id)) throw new BookmarkDataPendingError('书签标识无效或重复，已停止写入。')
    ids.add(bookmark.id)
  }
  for (const group of snapshot.groups) {
    if (!group || typeof group.id !== 'string' || groupIds.has(group.id) || !Array.isArray(group.children)) throw new BookmarkDataPendingError()
    groupIds.add(group.id)
    for (const sub of group.children) {
      if (!sub || typeof sub.id !== 'string' || subIds.has(sub.id) || !Array.isArray(sub.bookmarkIds)) throw new BookmarkDataPendingError()
      subIds.add(sub.id)
      const seen = new Set<string>()
      for (const id of sub.bookmarkIds) {
        if (!ids.has(id) || seen.has(id)) throw new BookmarkDataPendingError()
        seen.add(id)
        const locations = indexed.get(id) ?? new Set<string>()
        locations.add(JSON.stringify([group.id, sub.id]))
        indexed.set(id, locations)
      }
    }
  }
  for (const bookmark of snapshot.bookmarks) {
    const actual = indexed.get(bookmark.id)
    if (!actual?.size) throw new BookmarkDataPendingError()
    // 旧版没有 locations 时以分组索引为准，不要求迁移已有文档。
    if (bookmark.locations != null && (!Array.isArray(bookmark.locations) || bookmark.locations.length > 0)) {
      if (!Array.isArray(bookmark.locations)) throw new BookmarkDataPendingError()
      const declared = new Set(bookmark.locations.map(location => JSON.stringify([location?.groupId, location?.subGroupId])))
      if (declared.size !== bookmark.locations.length || declared.size !== actual.size || [...declared].some(key => !actual.has(key))) throw new BookmarkDataPendingError()
    }
  }
}
