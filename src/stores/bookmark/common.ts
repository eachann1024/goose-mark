import type { Bookmark, BookmarkLocation } from '@/types/bookmark'
import { createBookmarkSeed } from '@/stores/bookmarkSeed'
import type { BookmarkState } from './store-types'

export const createInitialState = (): BookmarkState => {
  const { groups, bookmarks } = createBookmarkSeed()
  return {
    groups,
    bookmarks,
    search: '',
    activeGroupId: 'g-nav',
    activeSubGroupId: 'sg-nav-common',
    activeView: 'all',
    isReadOnly: false
  }
}

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/**
 * 解析书签当前归属位置列表。
 * 旧数据可能缺少 locations 字段（undefined），此时回退到遍历索引计算。
 * 确保后续过滤逻辑不会把「仍有其他归属」的书签误判为无归属进回收站。
 */
export const resolveBookmarkLocations = (
  bookmark: Bookmark,
  getByIndex: (id: string) => BookmarkLocation[]
): BookmarkLocation[] => {
  if (Array.isArray(bookmark.locations) && bookmark.locations.length > 0) {
    return clone(bookmark.locations)
  }
  return getByIndex(bookmark.id)
}
