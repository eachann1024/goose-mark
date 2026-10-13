import PinyinMatch from 'pinyin-match'
import type { Bookmark, Group, BookmarkLocation, SubGroup } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmarkSeed'
import type { BookmarkStore } from './store-types'

// ---- 查询选择器（等价旧版 getters，供组件以 useBookmarkStore(selector) 使用）----

export const selectCurrentGroup = (s: BookmarkStore): Group | undefined =>
  s.groups.find((g) => g.id === s.activeGroupId)

export const selectCurrentSubGroup = (s: BookmarkStore): { group?: Group; sub?: SubGroup } => {
  const group = s.groups.find((g) => g.id === s.activeGroupId)
  const sub = group?.children.find((c) => c.id === s.activeSubGroupId)
  return { group, sub }
}

export const selectCurrentBookmarks = (s: BookmarkStore): Bookmark[] => {
  const { sub } = selectCurrentSubGroup(s)
  if (!sub) return []
  return sub.bookmarkIds
    .map((id) => s.bookmarks.find((b) => b.id === id))
    .filter((b): b is Bookmark => !!b && !b.isDeleted)
}

export const selectFilteredBookmarks = (s: BookmarkStore): Bookmark[] => {
  const query = (typeof s.search === 'string' ? s.search : '').trim().toLowerCase()
  const pool: Bookmark[] = []

  if (s.activeGroupId === TRASH_GROUP_ID) {
    const trashGroup = s.groups.find((g) => g.id === TRASH_GROUP_ID)
    trashGroup?.children.forEach((sub) => {
      sub.bookmarkIds.forEach((id) => {
        const bm = s.bookmarks.find((b) => b.id === id)
        if (bm && !bm.isDeleted) pool.push(bm)
      })
    })
  } else {
    s.groups.forEach((group) => {
      if (group.id === TRASH_GROUP_ID) return
      group.children.forEach((sub) => {
        sub.bookmarkIds.forEach((id) => {
          const bm = s.bookmarks.find((b) => b.id === id)
          if (bm && !bm.isDeleted) pool.push(bm)
        })
      })
    })
  }

  if (!query) return pool
  return pool.filter((item) => {
    const haystack = [item.title, item.desc ?? '', item.url, (item.tags ?? []).join(' ')].join(' ').toLowerCase()
    if (haystack.includes(query)) return true
    return !!PinyinMatch.match(haystack, query)
  })
}

/**
 * 非回收站全部书签（去重）。
 * 以分组树为准遍历：只有挂在非回收站子分组里的书签才算「有效」，
 * 与 selectFilteredBookmarks 的池子口径一致。
 */
const collectNonTrashBookmarks = (s: BookmarkStore): Bookmark[] => {
  const seen = new Set<string>()
  const result: Bookmark[] = []
  s.groups.forEach((group) => {
    if (group.id === TRASH_GROUP_ID) return
    group.children.forEach((sub) => {
      sub.bookmarkIds.forEach((id) => {
        if (seen.has(id)) return
        const bm = s.bookmarks.find((b) => b.id === id)
        if (bm && !bm.isDeleted) {
          seen.add(id)
          result.push(bm)
        }
      })
    })
  })
  return result
}

// 全部书签视图：非回收站全部（返回数组，供 useShallow 消费）
export const selectAllBookmarks = (s: BookmarkStore): Bookmark[] => collectNonTrashBookmarks(s)

// 置顶视图：pinned === true（仍限定在非回收站范围内）
export const selectPinnedBookmarks = (s: BookmarkStore): Bookmark[] =>
  collectNonTrashBookmarks(s).filter((b) => b.pinned === true)

// 最近使用视图：按 lastUsed 倒序，无 lastUsed 的排到末尾（保持原相对顺序）
export const selectRecentBookmarks = (s: BookmarkStore): Bookmark[] => {
  const list = collectNonTrashBookmarks(s)
  return [...list].sort((a, b) => {
    const la = a.lastUsed ?? 0
    const lb = b.lastUsed ?? 0
    if (la === lb) return 0
    return lb - la
  })
}

export const selectBookmarkLocations =
  (s: BookmarkStore) =>
  (id: string): BookmarkLocation[] => {
    const result: BookmarkLocation[] = []
    s.groups.forEach((g) => {
      g.children.forEach((sub) => {
        if (sub.bookmarkIds.includes(id)) {
          result.push({ groupId: g.id, subGroupId: sub.id })
        }
      })
    })
    return result
  }
