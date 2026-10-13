import type { Bookmark, Group, SubGroup } from '@/types/bookmark'
import { TRASH_GROUP_ID, createDefaultBookmarkSnapshot, patchBookmarksWithBuiltinSeedIcons } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkSet, BookmarkGet } from './store-types'

export function createSnapshotActions(set: BookmarkSet, get: BookmarkGet): Pick<BookmarkActions, 'patchBookmarksWithBuiltinSeedIcons' | 'migrateFromLegacy' | 'loadFromSnapshot' | 'setData' | 'resetToDefaultBookmarks' | '$patch'> {
  return {
    patchBookmarksWithBuiltinSeedIcons: () => {
      const { bookmarks, changed } = patchBookmarksWithBuiltinSeedIcons(get().bookmarks)
      if (changed) set({ bookmarks })
    },

    migrateFromLegacy: () => {
      const state = get()
      const legacyGroups = state.groups as unknown as Array<Record<string, any>>
      const firstSub = legacyGroups[0]?.children?.[0]
      const now = Date.now()

      if (!firstSub || !('bookmarks' in firstSub)) {
        const groups = state.groups.map((g) => ({
          ...g,
          createdAt: g.createdAt || now,
          updatedAt: g.updatedAt || now,
          children: g.children.map((sub) => ({
            ...sub,
            createdAt: sub.createdAt || now,
            updatedAt: sub.updatedAt || now
          }))
        }))
        const bookmarks = state.bookmarks.map((b) => ({
          ...b,
          createdAt: b.createdAt || now,
          updatedAt: b.updatedAt || now,
          // 旧数据无 visits 时兜底为 0；lastUsed 保持 undefined（从未使用过）
          visits: b.visits ?? 0
        }))
        set({ groups, bookmarks })
        get().ensureValidSelection()
        return
      }

      const migratedBookmarks: Bookmark[] = []
      const migratedGroups: Group[] = []

      legacyGroups.forEach((g) => {
        const newChildren: SubGroup[] = (g.children as Array<Record<string, any>>).map((sub) => {
          const bookmarkIds: string[] = (sub.bookmarks as Bookmark[]).map((b) => {
            if (!migratedBookmarks.find((mb) => mb.id === b.id)) {
              migratedBookmarks.push({
                ...b,
                createdAt: b.createdAt || now,
                updatedAt: b.updatedAt || now,
                visits: b.visits ?? 0
              })
            }
            return b.id
          })
          return {
            id: sub.id,
            name: sub.name,
            bookmarkIds,
            createdAt: sub.createdAt || now,
            updatedAt: sub.updatedAt || now
          }
        })
        migratedGroups.push({
          id: g.id,
          name: g.name,
          children: newChildren,
          createdAt: g.createdAt || now,
          updatedAt: g.updatedAt || now
        })
      })

      if (!migratedGroups.find((g) => g.id === TRASH_GROUP_ID)) {
        migratedGroups.push({
          id: TRASH_GROUP_ID,
          name: '回收站',
          createdAt: now,
          updatedAt: now,
          children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }]
        })
      }

      set({ groups: migratedGroups, bookmarks: migratedBookmarks })
      get().autoCleanTrash()
    },

    // ---- 快照 / 整体替换 ----
    loadFromSnapshot: (data, readOnly = false) => {
      const preferredGroupId = get().activeGroupId
      const preferredSubGroupId = get().activeSubGroupId
      const bookmarks = patchBookmarksWithBuiltinSeedIcons(data.bookmarks).bookmarks
      set({ groups: data.groups, bookmarks, isReadOnly: readOnly })
      get().ensureValidSelection(preferredGroupId, preferredSubGroupId)
    },

    setData: (state) => {
      const next = { ...state }
      if (state.bookmarks) {
        next.bookmarks = patchBookmarksWithBuiltinSeedIcons(state.bookmarks).bookmarks
      }
      set(next)
    },

    resetToDefaultBookmarks: () => {
      const snap = createDefaultBookmarkSnapshot()
      get().loadFromSnapshot(snap, false)
      set({
        search: '',
        activeView: 'all',
        activeGroupId: 'g-nav',
        activeSubGroupId: 'sg-nav-common',
        isReadOnly: false
      })
    },

    $patch: (partial) => set(partial)
  }
}
