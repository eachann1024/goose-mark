import type { Group } from '@/types/bookmark'
import { TRASH_GROUP_ID, uid } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createSubgroupMoveActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'moveSubToGroup' | 'promoteSubToGroup'> {
  return {
    moveSubToGroup: (sourceGroupId, subId, targetGroupId) => {
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const sourceGroup = groups.find((g) => g.id === sourceGroupId)
      const targetGroup = groups.find((g) => g.id === targetGroupId)
      if (!sourceGroup || !targetGroup) return false
      const subIdx = sourceGroup.children.findIndex((c) => c.id === subId)
      if (subIdx === -1) return false
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      const now = Date.now()

      targetGroup.children.push(sub)
      sourceGroup.updatedAt = now
      targetGroup.updatedAt = now
      sub.bookmarkIds.forEach((bid) => {
        const bookmark = bookmarks.find((b) => b.id === bid)
        if (bookmark) {
          // 用 resolveBookmarkLocations 取真实位置（兼容旧数据 locations=[]）
          const currentLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
          bookmark.locations = currentLocations.map((loc) =>
            loc.groupId === sourceGroupId && loc.subGroupId === subId ? { ...loc, groupId: targetGroupId } : loc
          )
          bookmark.updatedAt = now
        }
      })
      if (sourceGroup.children.length === 0) {
        sourceGroup.children.push({ id: uid(), name: '子分组', bookmarkIds: [], createdAt: now, updatedAt: now })
      }

      commit(groups, bookmarks)
      return true
    },

    promoteSubToGroup: (sourceGroupId, subId) => {
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const sourceGroup = groups.find((g) => g.id === sourceGroupId)
      if (!sourceGroup) return null
      const subIdx = sourceGroup.children.findIndex((c) => c.id === subId)
      if (subIdx === -1) return null
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      const now = Date.now()

      const newGroup: Group = {
        id: uid(),
        name: sub.name,
        createdAt: now,
        updatedAt: now,
        children: [{ ...sub, name: '默认', updatedAt: now }]
      }
      const trashIdx = groups.findIndex((g) => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) groups.splice(trashIdx, 0, newGroup)
      else groups.push(newGroup)
      sourceGroup.updatedAt = now

      sub.bookmarkIds.forEach((bid) => {
        const bookmark = bookmarks.find((b) => b.id === bid)
        if (bookmark) {
          // 用 resolveBookmarkLocations 取真实位置（兼容旧数据 locations=[]）
          const currentLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
          bookmark.locations = currentLocations.map((loc) =>
            loc.groupId === sourceGroupId && loc.subGroupId === subId ? { groupId: newGroup.id, subGroupId: sub.id } : loc
          )
          bookmark.updatedAt = now
        }
      })
      if (sourceGroup.children.length === 0) {
        sourceGroup.children.push({ id: uid(), name: '子分组', bookmarkIds: [], createdAt: now, updatedAt: now })
      }

      commit(groups, bookmarks, { activeGroupId: newGroup.id, activeSubGroupId: sub.id })
      return newGroup
    }
  }
}
