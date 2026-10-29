import type { Group } from '@/types/bookmark'
import { TRASH_GROUP_ID, uid } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createGroupActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'addGroup' | 'updateGroup' | 'reorderGroups' | 'findGroupByName' | 'removeGroup'> {
  return {
    // ---- 分组 ----
    addGroup: (name) => {
      const groups = clone(get().groups)
      const now = Date.now()
      const group: Group = {
        id: uid(),
        name,
        createdAt: now,
        updatedAt: now,
        children: [{ id: uid(), name: '分组一', bookmarkIds: [], createdAt: now, updatedAt: now }]
      }
      groups.push(group)
      commit(groups, get().bookmarks, {
        activeGroupId: group.id,
        activeSubGroupId: group.children[0].id
      })
      return group
    },

    updateGroup: (id, name) => {
      const groups = clone(get().groups)
      const group = groups.find((g) => g.id === id)
      if (!group) return
      const now = Date.now()
      group.name = name
      group.updatedAt = now
      commit(groups, get().bookmarks)
    },

    reorderGroups: (newOrder) => {
      const now = Date.now()
      const current = get().groups
      const trash = current.find((g) => g.id === TRASH_GROUP_ID)
      const filtered = clone(newOrder.filter((g) => g.id !== TRASH_GROUP_ID))
      filtered.forEach((group, index) => {
        group.updatedAt = now + index
      })
      const groups = trash ? [...filtered, trash] : filtered
      commit(groups, get().bookmarks)
    },

    findGroupByName: (name) => get().groups.find((g) => g.name === name && g.id !== TRASH_GROUP_ID) || null,

    removeGroup: (id) => {
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const idx = groups.findIndex((g) => g.id === id)
      if (idx === -1) return false
      const group = groups[idx]
      const now = Date.now()

      const toTrash: string[] = []
      group.children.forEach((sub) => {
        sub.bookmarkIds.forEach((bid) => {
          const bookmark = bookmarks.find((b) => b.id === bid)
          if (!bookmark) return
          // 用 resolveBookmarkLocations 兜住旧数据 locations 为 undefined 的情况
          const currentLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
          const oldLocations = currentLocations
          bookmark.locations = currentLocations.filter((loc) => loc.groupId !== id)
          if (bookmark.locations.length === 0) {
            if (oldLocations.length > 0) bookmark.prevLocations = oldLocations
            bookmark.updatedAt = now
            toTrash.push(bid)
          }
        })
      })

      groups.splice(idx, 1)

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

      toTrash.forEach((bid) => {
        if (!trashSub.bookmarkIds.includes(bid)) trashSub.bookmarkIds.push(bid)
        const bookmark = bookmarks.find((b) => b.id === bid)
        if (bookmark) bookmark.locations = [{ groupId: TRASH_GROUP_ID, subGroupId: trashSub.id }]
      })
      if (toTrash.length > 0) {
        trashSub.updatedAt = now
        trashGroup.updatedAt = now
      }

      let nextActiveGroupId = get().activeGroupId
      let nextActiveSubGroupId = get().activeSubGroupId
      if (nextActiveGroupId === id) {
        nextActiveGroupId = groups[0]?.id ?? ''
        nextActiveSubGroupId = groups[0]?.children[0]?.id ?? ''
      }

      commit(groups, bookmarks, { activeGroupId: nextActiveGroupId, activeSubGroupId: nextActiveSubGroupId })

      return true
    }
  }
}
