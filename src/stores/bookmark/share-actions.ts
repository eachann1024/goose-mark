import { TRASH_GROUP_ID } from '@/stores/bookmarkSeed'
import { useSync } from '@/hooks/useSync'
import type { BookmarkActions, ShareAwareGroup, ShareAwareSubGroup, BookmarkGet } from './store-types'
import { clone } from './common'

const schedulePush = (
  item: Parameters<ReturnType<typeof useSync.getState>['schedulePush']>[0],
  options?: Parameters<ReturnType<typeof useSync.getState>['schedulePush']>[1]
) => {
  try {
    useSync.getState().schedulePush(item, options)
  } catch (error) {
    console.warn('[Bookmark] schedulePush 失败:', error)
  }
}

export function createShareActions(get: BookmarkGet): Pick<BookmarkActions, 'getShareIdsFromLocations' | 'getShareIdsFromSubGroup' | 'getShareIdsFromGroup' | 'scheduleBookmarkSync' | 'scheduleGroupSync' | 'scheduleSubGroupSync' | 'syncAllSharedEntities'> {
  return {
    // ---- 同步辅助 ----
    getShareIdsFromLocations: (locations = []) => {
      const shareIds = new Set<string>()
      locations.forEach((loc) => {
        const group = get().groups.find((g) => g.id === loc.groupId) as ShareAwareGroup | undefined
        if (!group) return
        if (group.shareId) shareIds.add(group.shareId)
        if (group.sourceShareId) shareIds.add(group.sourceShareId)
        const sub = group.children.find((c) => c.id === loc.subGroupId) as ShareAwareSubGroup | undefined
        if (!sub) return
        if (sub.shareId) shareIds.add(sub.shareId)
        if (sub.sourceShareId) shareIds.add(sub.sourceShareId)
      })
      return Array.from(shareIds)
    },

    getShareIdsFromSubGroup: (groupId, subId) => {
      const group = get().groups.find((g) => g.id === groupId) as ShareAwareGroup | undefined
      if (!group) return []
      const sub = group.children.find((c) => c.id === subId) as ShareAwareSubGroup | undefined
      const shareIds = new Set<string>()
      if (group.shareId) shareIds.add(group.shareId)
      if (group.sourceShareId) shareIds.add(group.sourceShareId)
      if (sub?.shareId) shareIds.add(sub.shareId)
      if (sub?.sourceShareId) shareIds.add(sub.sourceShareId)
      return Array.from(shareIds)
    },

    getShareIdsFromGroup: (groupId) => {
      const group = get().groups.find((g) => g.id === groupId) as ShareAwareGroup | undefined
      if (!group) return []
      const shareIds = new Set<string>()
      if (group.shareId) shareIds.add(group.shareId)
      if (group.sourceShareId) shareIds.add(group.sourceShareId)
      group.children.forEach((child) => {
        const sub = child as ShareAwareSubGroup
        if (sub.shareId) shareIds.add(sub.shareId)
        if (sub.sourceShareId) shareIds.add(sub.sourceShareId)
      })
      return Array.from(shareIds)
    },

    scheduleBookmarkSync: (bookmarkId, options) => {
      const now = options?.updatedAt || Date.now()
      const bookmark = get().bookmarks.find((b) => b.id === bookmarkId)
      const isDeleted = !!options?.isDeleted
      const content = options?.content ?? bookmark ?? null
      if (!isDeleted && !content) return
      schedulePush(
        { itemId: bookmarkId, itemType: 'bookmark', content, isDeleted, updatedAt: now },
        { previousShareIds: options?.previousShareIds }
      )
    },

    scheduleGroupSync: (groupId, options) => {
      const now = options?.updatedAt || Date.now()
      const group = get().groups.find((g) => g.id === groupId)
      if (options?.isDeleted) {
        schedulePush(
          { itemId: groupId, itemType: 'group', content: null, isDeleted: true, updatedAt: now },
          { previousShareIds: options?.previousShareIds }
        )
        return
      }
      if (!group) return
      const content = clone(group) as ShareAwareGroup
      if (typeof options?.orderIndex === 'number') content.orderIndex = options.orderIndex
      schedulePush(
        { itemId: group.id, itemType: 'group', content, isDeleted: false, updatedAt: now },
        { previousShareIds: options?.previousShareIds }
      )
    },

    scheduleSubGroupSync: (groupId, subId, options) => {
      const now = options?.updatedAt || Date.now()
      const group = get().groups.find((g) => g.id === groupId)
      const sub = group?.children.find((c) => c.id === subId)
      if (options?.isDeleted) {
        schedulePush(
          { itemId: subId, itemType: 'subGroup', content: null, isDeleted: true, updatedAt: now },
          { previousShareIds: options?.previousShareIds }
        )
        return
      }
      if (!group || !sub) return
      schedulePush(
        {
          itemId: sub.id,
          itemType: 'subGroup',
          content: { ...clone(sub), parentGroupId: group.id },
          isDeleted: false,
          updatedAt: now
        },
        { previousShareIds: options?.previousShareIds }
      )
    },

    syncAllSharedEntities: (updatedAt = Date.now()) => {
      get()
        .groups.filter((group) => group.id !== TRASH_GROUP_ID)
        .forEach((group, orderIndex) => {
          get().scheduleGroupSync(group.id, { updatedAt, orderIndex })
        })
      get().groups.forEach((group) => {
        group.children.forEach((sub) => {
          get().scheduleSubGroupSync(group.id, sub.id, { updatedAt })
        })
      })
      get().bookmarks.forEach((bookmark) => {
        get().scheduleBookmarkSync(bookmark.id, { updatedAt })
      })
    }
  }
}
