import type { SubGroup } from '@/types/bookmark'
import { TRASH_GROUP_ID, uid } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createSubgroupActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'addSubGroup' | 'updateSubGroup' | 'reorderSubGroups' | 'removeSubGroup'> {
  return {
    addSubGroup: (name, groupId) => {
      const groups = clone(get().groups)
      const group = groups.find((g) => g.id === groupId)
      if (!group) return null
      const now = Date.now()
      const sub: SubGroup = { id: uid(), name, bookmarkIds: [], createdAt: now, updatedAt: now }
      group.children.push(sub)
      group.updatedAt = now
      commit(groups, get().bookmarks, { activeSubGroupId: sub.id })
      get().scheduleSubGroupSync(groupId, sub.id, { updatedAt: now })
      get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })
      return sub
    },

    updateSubGroup: (groupId, subId, name) => {
      const groups = clone(get().groups)
      const group = groups.find((g) => g.id === groupId)
      const sub = group?.children.find((c) => c.id === subId)
      if (!group || !sub) return
      const now = Date.now()
      sub.name = name
      sub.updatedAt = now
      group.updatedAt = now
      commit(groups, get().bookmarks)
      get().scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })
    },

    reorderSubGroups: (groupId, newChildren) => {
      const groups = clone(get().groups)
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      const now = Date.now()
      const children = clone(newChildren)
      children.forEach((child, index) => {
        child.updatedAt = now + index
      })
      group.children = children
      group.updatedAt = now
      commit(groups, get().bookmarks)
      children.forEach((child) => {
        get().scheduleSubGroupSync(groupId, child.id, { updatedAt: child.updatedAt })
      })
      get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })
    },

    removeSubGroup: (groupId, subId) => {
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const group = groups.find((g) => g.id === groupId)
      if (!group) return false
      const idx = group.children.findIndex((c) => c.id === subId)
      if (idx === -1) return false
      const sub = group.children[idx]
      const now = Date.now()

      const previousSubShareIds = get().getShareIdsFromSubGroup(groupId, subId)
      const touchedBookmarkShareIdsMap = new Map<string, string[]>()
      sub.bookmarkIds.forEach((bid) => {
        const bookmark = bookmarks.find((b) => b.id === bid)
        const previousLocations = bookmark ? resolveBookmarkLocations(bookmark, get().getBookmarkLocations) : get().getBookmarkLocations(bid)
        touchedBookmarkShareIdsMap.set(bid, get().getShareIdsFromLocations(previousLocations))
      })

      const toTrash: string[] = []
      sub.bookmarkIds.forEach((bid) => {
        const bookmark = bookmarks.find((b) => b.id === bid)
        if (!bookmark) return
        // 用 resolveBookmarkLocations 兜住旧数据 locations 为 undefined 的情况
        const currentLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
        bookmark.locations = currentLocations.filter(
          (loc) => !(loc.groupId === groupId && loc.subGroupId === subId)
        )
        if (bookmark.locations.length === 0) {
          bookmark.updatedAt = now
          toTrash.push(bid)
        }
      })

      group.children.splice(idx, 1)
      group.updatedAt = now

      let trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
      if (!trashGroup) {
        trashGroup = {
          id: TRASH_GROUP_ID,
          name: '回收站',
          createdAt: now,
          updatedAt: now,
          children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }]
        }
        groups.push(trashGroup)
      }
      if (trashGroup.children.length === 0) {
        trashGroup.children.push({ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now })
      }
      const trashSub = trashGroup.children[0]

      if (toTrash.length > 0) {
        toTrash.forEach((bid) => {
          if (!trashSub.bookmarkIds.includes(bid)) trashSub.bookmarkIds.push(bid)
          const bookmark = bookmarks.find((b) => b.id === bid)
          if (bookmark) bookmark.locations = [{ groupId: TRASH_GROUP_ID, subGroupId: trashSub.id }]
        })
        trashSub.updatedAt = now
        trashGroup.updatedAt = now
      }

      if (group.children.length === 0) {
        group.children.push({ id: uid(), name: '默认', bookmarkIds: [], createdAt: now, updatedAt: now })
        group.updatedAt = now
      }

      let nextActiveSubGroupId = get().activeSubGroupId
      if (nextActiveSubGroupId === subId) nextActiveSubGroupId = group.children[0]?.id ?? ''

      commit(groups, bookmarks, { activeSubGroupId: nextActiveSubGroupId })

      touchedBookmarkShareIdsMap.forEach((previousShareIds, bookmarkId) => {
        get().scheduleBookmarkSync(bookmarkId, { updatedAt: now, previousShareIds })
      })
      get().scheduleSubGroupSync(groupId, subId, { isDeleted: true, updatedAt: now, previousShareIds: previousSubShareIds })
      get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })

      return true
    }
  }
}
