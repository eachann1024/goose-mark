import type { BookmarkLocation } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkSet, BookmarkGet } from './store-types'

export function createSelectionActions(set: BookmarkSet, get: BookmarkGet): Pick<BookmarkActions, 'setSearch' | 'setActiveView' | 'setActiveGroup' | 'setActiveSubGroup' | 'setReadOnly' | 'selectGroup' | 'selectSubGroup' | 'recordBookmarkUse' | 'ensureValidSelection' | 'getBookmarkLocations' | 'isBookmarkInTrash'> {
  return {
    setSearch: (value) => set({ search: typeof value === 'string' ? value : '' }),

    // 切换虚拟视图。切到 all/pinned/recent 时仅改 activeView，
    // 不动 activeGroupId/activeSubGroupId —— 分组树仍可正常展示当前选中态。
    setActiveView: (view) => set({ activeView: view }),

    // 选中分组时，列表数据源自动跟随分组（activeView = 'group'），
    // 等价旧版只有分组列表时的默认行为。
    setActiveGroup: (groupId) => {
      const group = get().groups.find((g) => g.id === groupId)
      if (!group) return
      set({ activeGroupId: groupId, activeSubGroupId: group.children[0]?.id ?? '', activeView: 'group' })
    },

    setActiveSubGroup: (subGroupId) => set({ activeSubGroupId: subGroupId, activeView: 'group' }),

    setReadOnly: (value) => set({ isReadOnly: !!value }),

    selectGroup: (groupId, subId) => {
      const group = get().groups.find((g) => g.id === groupId)
      const firstSub = group?.children?.[0]
      set({ activeGroupId: groupId, activeSubGroupId: subId ?? firstSub?.id ?? '', activeView: 'group' })
    },

    selectSubGroup: (subId) => set({ activeSubGroupId: subId, activeView: 'group' }),

    // 记录书签使用：lastUsed = now、visits++。只写本地排序数据。
    recordBookmarkUse: (id) => {
      const bookmarks = [...get().bookmarks]
      const idx = bookmarks.findIndex((b) => b.id === id)
      if (idx === -1) return
      const prev = bookmarks[idx]
      bookmarks.splice(idx, 1, {
        ...prev,
        lastUsed: Date.now(),
        visits: (prev.visits ?? 0) + 1
      })
      set({ bookmarks })
    },

    ensureValidSelection: (preferredGroupId, preferredSubGroupId) => {
      const { groups, activeGroupId, activeSubGroupId } = get()
      const wantGroupId = preferredGroupId ?? activeGroupId
      const wantSubGroupId = preferredSubGroupId ?? activeSubGroupId
      if (!groups.length) {
        set({ activeGroupId: '', activeSubGroupId: '' })
        return
      }
      const preferredGroup = groups.find((g) => g.id === wantGroupId)
      const fallbackGroup = preferredGroup || groups.find((g) => g.id !== TRASH_GROUP_ID) || groups[0]
      if (!fallbackGroup) {
        set({ activeGroupId: '', activeSubGroupId: '' })
        return
      }
      const preferredSub = fallbackGroup.children.find((c) => c.id === wantSubGroupId)
      const fallbackSub = preferredSub || fallbackGroup.children[0]
      set({ activeGroupId: fallbackGroup.id, activeSubGroupId: fallbackSub?.id ?? '' })
    },

    getBookmarkLocations: (id) => {
      const result: BookmarkLocation[] = []
      get().groups.forEach((g) => {
        g.children.forEach((sub) => {
          if (sub.bookmarkIds.includes(id)) result.push({ groupId: g.id, subGroupId: sub.id })
        })
      })
      return result
    },

    isBookmarkInTrash: (bookmark) => {
      const inTrashByLocation =
        Array.isArray(bookmark.locations) &&
        bookmark.locations.some((loc) => loc.groupId === TRASH_GROUP_ID || loc.subGroupId === 'sg-trash')
      const trashGroup = get().groups.find((g) => g.id === TRASH_GROUP_ID)
      const inTrashByGroupIndex =
        !!trashGroup && trashGroup.children.some((sub) => sub.bookmarkIds.includes(bookmark.id))
      return !!inTrashByLocation || inTrashByGroupIndex
    }
  }
}
