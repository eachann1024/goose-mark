import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createBookmarkLocationActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'removeBookmarkFromLocation' | 'reorderInSub' | 'moveBookmarkToSubGroup'> {
  return {
    removeBookmarkFromLocation: (id, groupId, subGroupId) => {
      const locations = get().getBookmarkLocations(id)
      const remainingLocations = locations.filter(
        (loc) => !(loc.groupId === groupId && loc.subGroupId === subGroupId)
      )
      if (remainingLocations.length > 0) {
        get().updateBookmarkLocations(id, remainingLocations)
      } else {
        get().removeBookmark(id)
      }
    },

    reorderInSub: (groupId, subId, fromId, toId) => {
      const groups = clone(get().groups)
      const group = groups.find((g) => g.id === groupId)
      const sub = group?.children.find((c) => c.id === subId)
      if (!sub || !group) return
      const fromIdx = sub.bookmarkIds.indexOf(fromId)
      const toIdx = sub.bookmarkIds.indexOf(toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
      const list = [...sub.bookmarkIds]
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      sub.bookmarkIds = list
      const now = Date.now()
      sub.updatedAt = now
      group.updatedAt = now
      commit(groups, get().bookmarks)
      get().scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })
    },

    moveBookmarkToSubGroup: (bookmarkId, fromGroupId, fromSubId, toGroupId, toSubId) => {
      if (fromGroupId === toGroupId && fromSubId === toSubId) return false
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const fromGroup = groups.find((g) => g.id === fromGroupId)
      const fromSub = fromGroup?.children.find((c) => c.id === fromSubId)
      const toGroup = groups.find((g) => g.id === toGroupId)
      const toSub = toGroup?.children.find((c) => c.id === toSubId)
      if (!fromSub || !toSub || !fromGroup || !toGroup) return false
      if (!fromSub.bookmarkIds.includes(bookmarkId)) return false
      const bookmark = bookmarks.find((b) => b.id === bookmarkId)
      const previousLocations = bookmark ? resolveBookmarkLocations(bookmark, get().getBookmarkLocations) : get().getBookmarkLocations(bookmarkId)
      const previousShareIds = get().getShareIdsFromLocations(previousLocations)
      const now = Date.now()
      fromSub.bookmarkIds = fromSub.bookmarkIds.filter((id) => id !== bookmarkId)
      fromSub.updatedAt = now
      fromGroup.updatedAt = now
      if (!toSub.bookmarkIds.includes(bookmarkId)) {
        toSub.bookmarkIds.push(bookmarkId)
        toSub.updatedAt = now
        toGroup.updatedAt = now
      }
      if (bookmark) {
        // 用 resolveBookmarkLocations 取真实位置（兼容旧数据 locations=[]）
        const currentLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
        const filtered = currentLocations.filter(
          (loc) => !(loc.groupId === fromGroupId && loc.subGroupId === fromSubId)
        )
        if (!filtered.some((loc) => loc.groupId === toGroupId && loc.subGroupId === toSubId)) {
          filtered.push({ groupId: toGroupId, subGroupId: toSubId })
        }
        bookmark.locations = filtered
        bookmark.updatedAt = now
      }
      commit(groups, bookmarks)
      if (bookmark) get().scheduleBookmarkSync(bookmarkId, { updatedAt: now, previousShareIds })
      get().scheduleSubGroupSync(fromGroupId, fromSubId, { updatedAt: now })
      get().scheduleSubGroupSync(toGroupId, toSubId, { updatedAt: now })
      get().scheduleGroupSync(fromGroupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === fromGroupId) })
      if (fromGroupId !== toGroupId) {
        get().scheduleGroupSync(toGroupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === toGroupId) })
      }
      return true
    }
  }
}
