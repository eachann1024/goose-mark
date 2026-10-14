import type { BookmarkLocation } from '@/types/bookmark'
import { TRASH_GROUP_ID, createSeedGroups } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createTrashActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'autoCleanTrash' | 'removeBookmark' | 'restoreBookmark' | 'restoreBookmarkFromTrash' | 'emptyTrash'> {
  return {
    autoCleanTrash: () => {
      const groups = clone(get().groups)
      const bookmarks = [...get().bookmarks]
      const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
      if (!trashGroup) return

      const now = Date.now()
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

      trashGroup.children.forEach((sub) => {
        const newIds: string[] = []
        sub.bookmarkIds.forEach((bid) => {
          const bookmark = bookmarks.find((b) => b.id === bid)
          if (!bookmark) return
          if (now - bookmark.updatedAt <= THIRTY_DAYS) {
            newIds.push(bid)
          } else {
            const idx = bookmarks.findIndex((b) => b.id === bid)
            if (idx !== -1) bookmarks.splice(idx, 1)
          }
        })
        if (sub.bookmarkIds.length !== newIds.length) {
          sub.bookmarkIds = newIds
          sub.updatedAt = now
          trashGroup.updatedAt = now
        }
      })

      commit(groups, bookmarks)
    },

    removeBookmark: (id) => {
      const now = Date.now()
      const locations = get().getBookmarkLocations(id)
      const inTrash = locations.some((loc) => loc.groupId === TRASH_GROUP_ID)

      if (inTrash) {
        const groups = clone(get().groups)
        let bookmarks = clone(get().bookmarks)
        const bookmark = bookmarks.find((b) => b.id === id)
        const previousLocations = bookmark && Array.isArray(bookmark.locations) && bookmark.locations.length > 0 ? clone(bookmark.locations) : locations
        const previousShareIds = get().getShareIdsFromLocations(previousLocations)

        groups.forEach((g) => {
          let groupChanged = false
          g.children.forEach((sub) => {
            const originalLen = sub.bookmarkIds.length
            sub.bookmarkIds = sub.bookmarkIds.filter((bid) => bid !== id)
            if (sub.bookmarkIds.length !== originalLen) {
              sub.updatedAt = now
              groupChanged = true
            }
          })
          if (groupChanged) g.updatedAt = now
        })
        bookmarks = bookmarks.filter((b) => b.id !== id)
        commit(groups, bookmarks)
        get().scheduleBookmarkSync(id, { isDeleted: true, updatedAt: now, previousShareIds, content: null })
      } else {
        const bookmarks = clone(get().bookmarks)
        const bookmark = bookmarks.find((b) => b.id === id)
        if (bookmark) {
          bookmark.updatedAt = now
          if (bookmark.locations && bookmark.locations.length > 0) {
            bookmark.prevLocations = clone(bookmark.locations)
          }
          commit(get().groups, bookmarks)
          get().updateBookmarkLocations(id, [{ groupId: TRASH_GROUP_ID, subGroupId: 'sg-trash' }])
        }
      }
    },

    restoreBookmark: (id) => get().restoreBookmarkFromTrash(id),

    restoreBookmarkFromTrash: (id) => {
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const bookmark = bookmarks.find((b) => b.id === id)
      if (!bookmark) return false
      const now = Date.now()
      const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
      const trashSubs = trashGroup?.children ?? []
      const previousLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
      const previousShareIds = get().getShareIdsFromLocations(previousLocations)

      let targetLocations: BookmarkLocation[] = []
      if (bookmark.prevLocations && bookmark.prevLocations.length > 0) {
        targetLocations = bookmark.prevLocations.filter((loc) => {
          const group = groups.find((g) => g.id === loc.groupId)
          return group && group.id !== TRASH_GROUP_ID && group.children.some((c) => c.id === loc.subGroupId)
        })
      }
      if (targetLocations.length === 0) {
        const defaultGroup = groups.find((g) => g.id !== TRASH_GROUP_ID)
        if (defaultGroup && defaultGroup.children.length > 0) {
          targetLocations = [{ groupId: defaultGroup.id, subGroupId: defaultGroup.children[0].id }]
        } else {
          const createdGroups = createSeedGroups()
          const seedGroup = createdGroups.find((g) => g.id !== TRASH_GROUP_ID)!
          groups.unshift(seedGroup)
          targetLocations = [{ groupId: seedGroup.id, subGroupId: seedGroup.children[0].id }]
        }
      }

      trashSubs.forEach((sub) => {
        sub.bookmarkIds = sub.bookmarkIds.filter((bid) => bid !== id)
        sub.updatedAt = now
      })
      if (trashGroup) trashGroup.updatedAt = now

      bookmark.isDeleted = false
      bookmark.updatedAt = now
      delete bookmark.prevLocations

      // 先提交移出回收站的中间态，再用 updateBookmarkLocations 落定目标位置
      commit(groups, bookmarks)
      get().updateBookmarkLocations(id, targetLocations)
      get().selectGroup(targetLocations[0].groupId, targetLocations[0].subGroupId)
      get().scheduleBookmarkSync(id, { updatedAt: now, previousShareIds })
      targetLocations.forEach((loc) => {
        get().scheduleSubGroupSync(loc.groupId, loc.subGroupId, { updatedAt: now })
        get().scheduleGroupSync(loc.groupId, {
          updatedAt: now,
          orderIndex: get().groups.findIndex((g) => g.id === loc.groupId)
        })
      })
      return true
    },

    emptyTrash: () => {
      const groups = clone(get().groups)
      let bookmarks = clone(get().bookmarks)
      const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
      if (!trashGroup || get().isReadOnly) return
      const now = Date.now()
      const activeIds = new Set(groups.filter(group => group.id !== TRASH_GROUP_ID)
        .flatMap(group => group.children.flatMap(sub => sub.bookmarkIds)))
      const idsToRemove = [...new Set(trashGroup.children.flatMap(sub => sub.bookmarkIds))]
        .filter(id => !activeIds.has(id))
      const previousShareIdsMap = new Map<string, string[]>()
      idsToRemove.forEach((id) => {
        const bookmark = bookmarks.find((b) => b.id === id)
        const previousLocations = bookmark ? resolveBookmarkLocations(bookmark, get().getBookmarkLocations) : get().getBookmarkLocations(id)
        previousShareIdsMap.set(id, get().getShareIdsFromLocations(previousLocations))
      })
      idsToRemove.forEach((id) => {
        bookmarks = bookmarks.filter((b) => b.id !== id)
      })
      trashGroup.children.forEach(sub => { sub.bookmarkIds = []; sub.updatedAt = now })
      bookmarks.forEach(bookmark => {
        if (activeIds.has(bookmark.id) && bookmark.locations?.some(location => location.groupId === TRASH_GROUP_ID)) {
          bookmark.locations = bookmark.locations.filter(location => location.groupId !== TRASH_GROUP_ID)
          bookmark.isDeleted = false
          bookmark.updatedAt = now
        }
      })
      trashGroup.updatedAt = now
      commit(groups, bookmarks)
      idsToRemove.forEach((id) => {
        get().scheduleBookmarkSync(id, {
          isDeleted: true,
          updatedAt: now,
          previousShareIds: previousShareIdsMap.get(id) || [],
          content: null
        })
      })
    }
  }
}
