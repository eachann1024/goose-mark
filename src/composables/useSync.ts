import { ref } from 'vue'
import { syncBookmarkLocations } from '@/composables/useImportExport'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import type { Bookmark, Group, SubGroup } from '@/types/bookmark'

const API_BASE_URL = import.meta.env.VITE_SHARE_API_URL || 'http://43.142.149.157:3001/api/sync'

interface SyncItem {
  itemId: string
  itemType: 'bookmark' | 'group' | 'subGroup'
  content: any
  isDeleted: boolean
  updatedAt: number
  clientId?: string
}

interface SchedulePushOptions {
  targetShareIds?: string[]
  previousShareIds?: string[]
}

type ShareAwareGroup = Group & { shareId?: string; sourceShareId?: string; orderIndex?: number }
type ShareAwareSubGroup = SubGroup & { shareId?: string; sourceShareId?: string; parentGroupId?: string }

// Global Singleton State
const isSyncing = ref(false)
const syncError = ref<string | null>(null)

// Key: shareId, Value: number
const lastSyncTimes = ref<Map<string, number>>(new Map())
// Key: shareId, Value: Map<itemKey, SyncItem>
const pendingQueues = ref<Map<string, Map<string, SyncItem>>>(new Map())
// Key: shareId, Value: boolean
const syncingShares = ref<Set<string>>(new Set())

const normalizeShareIds = (ids: Array<string | null | undefined>): string[] => {
  const result = new Set<string>()
  ids.forEach(raw => {
    const value = String(raw || '').trim()
    if (value) result.add(value)
  })
  return Array.from(result)
}

const clonePlain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const getEntityTs = (entity: { updatedAt?: number; createdAt?: number } | null | undefined): number => {
  const updatedAt = typeof entity?.updatedAt === 'number' ? entity.updatedAt : 0
  const createdAt = typeof entity?.createdAt === 'number' ? entity.createdAt : 0
  return Math.max(updatedAt, createdAt)
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const collectShareIds = (group?: ShareAwareGroup, sub?: ShareAwareSubGroup): string[] => {
  return normalizeShareIds([
    group?.shareId,
    group?.sourceShareId,
    sub?.shareId,
    sub?.sourceShareId
  ])
}

const findSubOwner = (store: any, subId: string): { group: ShareAwareGroup; sub: ShareAwareSubGroup; groupIndex: number; subIndex: number } | null => {
  const groupIndex = store.groups.findIndex((group: Group) => group.children.some((sub: SubGroup) => sub.id === subId))
  if (groupIndex === -1) return null

  const group = store.groups[groupIndex] as ShareAwareGroup
  const subIndex = group.children.findIndex((sub: SubGroup) => sub.id === subId)
  if (subIndex === -1) return null

  return {
    group,
    sub: group.children[subIndex] as ShareAwareSubGroup,
    groupIndex,
    subIndex
  }
}

export function useSync() {
  const store = useBookmarkStore()

  const getRelevantShareIds = (item: SyncItem): string[] => {
    const shareIds = new Set<string>()

    if (item.itemType === 'bookmark') {
      const bookmark = item.content as Bookmark | null
      const locations = Array.isArray(bookmark?.locations) ? bookmark!.locations : []
      locations.forEach(loc => {
        const group = store.groups.find(g => g.id === loc.groupId) as ShareAwareGroup | undefined
        if (!group) return
        const sub = group.children.find(s => s.id === loc.subGroupId) as ShareAwareSubGroup | undefined
        collectShareIds(group, sub).forEach(id => shareIds.add(id))
      })
    } else if (item.itemType === 'group') {
      const contentGroup = item.content as ShareAwareGroup | null
      collectShareIds(contentGroup || undefined).forEach(id => shareIds.add(id))

      const group = store.groups.find(g => g.id === item.itemId) as ShareAwareGroup | undefined
      collectShareIds(group).forEach(id => shareIds.add(id))
    } else if (item.itemType === 'subGroup') {
      const contentSub = item.content as ShareAwareSubGroup | null
      const parentGroupId = String(contentSub?.parentGroupId || '').trim()
      if (parentGroupId) {
        const parent = store.groups.find(g => g.id === parentGroupId) as ShareAwareGroup | undefined
        collectShareIds(parent, contentSub || undefined).forEach(id => shareIds.add(id))
      }

      const owner = findSubOwner(store, item.itemId)
      if (owner) {
        collectShareIds(owner.group, owner.sub).forEach(id => shareIds.add(id))
      }
    }

    return normalizeShareIds(Array.from(shareIds))
  }

  const triggerSync = async (shareId: string) => {
    if (syncingShares.value.has(shareId) || !shareId) return
    syncingShares.value.add(shareId)
    isSyncing.value = true
    syncError.value = null

    try {
      // 1. Push Phase
      const queue = pendingQueues.value.get(shareId)
      if (queue && queue.size > 0) {
        const itemsToPush = Array.from(queue.values())

        console.log('[Sync] Pushing', itemsToPush.length, 'items to', shareId)
        const pushRes = await fetch(`${API_BASE_URL}/${shareId}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToPush })
        })

        if (!pushRes.ok) throw new Error(`Push failed for ${shareId}`)

        // Push 成功后清理该 shareId 的队列
        queue.clear()
      }

      // 2. Pull Phase
      const since = lastSyncTimes.value.get(shareId) || 0
      const pullRes = await fetch(`${API_BASE_URL}/${shareId}/pull?since=${since}`)
      if (!pullRes.ok) throw new Error(`Pull failed for ${shareId}`)

      const { items, lastUpdatedAt } = await pullRes.json()

      if (Array.isArray(items) && items.length > 0) {
        console.log('[Sync] Pulled', items.length, 'items from', shareId)
        applyRemoteChanges(store, items as SyncItem[])
        // 同步后刷新缺失图标
        void store.refreshMissingIcons()
      }

      if (isFiniteNumber(lastUpdatedAt) && lastUpdatedAt > since) {
        lastSyncTimes.value.set(shareId, lastUpdatedAt)
      }
    } catch (e: any) {
      console.error(`[Sync] Error for ${shareId}:`, e)
      syncError.value = e.message
    } finally {
      syncingShares.value.delete(shareId)
      isSyncing.value = syncingShares.value.size > 0
    }
  }

  const enqueueForShare = (shareId: string, item: SyncItem) => {
    if (!pendingQueues.value.has(shareId)) {
      pendingQueues.value.set(shareId, new Map())
    }

    const queue = pendingQueues.value.get(shareId)!
    queue.set(`${item.itemType}:${item.itemId}`, item)

    console.log(`[Sync] Scheduled push for ${shareId}:`, item.itemId, item.itemType, item.isDeleted ? '(deleted)' : '')

    if (!syncingShares.value.has(shareId)) {
      setTimeout(() => triggerSync(shareId), 1000)
    }
  }

  // 添加变更到队列
  const schedulePush = (item: SyncItem, options: SchedulePushOptions = {}) => {
    if (!item?.itemId) return

    const updatedAt = isFiniteNumber(item.updatedAt) ? item.updatedAt : Date.now()
    const normalizedItem: SyncItem = {
      ...item,
      updatedAt
    }

    const targetShareIds = options.targetShareIds
      ? normalizeShareIds(options.targetShareIds)
      : getRelevantShareIds(normalizedItem)

    const previousShareIds = normalizeShareIds(options.previousShareIds || [])

    targetShareIds.forEach(shareId => enqueueForShare(shareId, normalizedItem))

    // 处理“从某个分享中移出”的边界：向旧分享发送 tombstone
    if (previousShareIds.length > 0) {
      const removedShareIds = previousShareIds.filter(id => !targetShareIds.includes(id))
      if (removedShareIds.length > 0) {
        const tombstone: SyncItem = {
          itemId: normalizedItem.itemId,
          itemType: normalizedItem.itemType,
          content: null,
          isDeleted: true,
          updatedAt,
          clientId: normalizedItem.clientId
        }

        removedShareIds.forEach(shareId => enqueueForShare(shareId, tombstone))
      }
    }
  }

  return {
    isSyncing,
    syncError,
    schedulePush,
    triggerSync
  }
}

const ensureActiveSelection = (store: any) => {
  if (!Array.isArray(store.groups) || store.groups.length === 0) return

  let activeGroup = store.groups.find((g: Group) => g.id === store.activeGroupId)
  if (!activeGroup) {
    activeGroup = store.groups.find((g: Group) => g.id !== TRASH_GROUP_ID) || store.groups[0]
    store.activeGroupId = activeGroup?.id || ''
  }

  if (!activeGroup) {
    store.activeSubGroupId = ''
    return
  }

  if (!Array.isArray(activeGroup.children) || activeGroup.children.length === 0) {
    const now = Date.now()
    activeGroup.children = [{
      id: `sg-${now.toString(36)}`,
      name: '默认',
      bookmarkIds: [],
      createdAt: now,
      updatedAt: now
    }]
  }

  const activeSub = activeGroup.children.find((sub: SubGroup) => sub.id === store.activeSubGroupId)
  if (!activeSub) {
    store.activeSubGroupId = activeGroup.children[0]?.id || ''
  }
}

const applyGroupOrderIndexes = (store: any) => {
  const normalGroups = store.groups.filter((group: Group) => group.id !== TRASH_GROUP_ID) as ShareAwareGroup[]
  const hasOrderIndex = normalGroups.some(group => isFiniteNumber((group as any).orderIndex))
  if (!hasOrderIndex) return

  const sorted = [...normalGroups].sort((left, right) => {
    const leftOrder = isFiniteNumber((left as any).orderIndex) ? (left as any).orderIndex : Number.MAX_SAFE_INTEGER
    const rightOrder = isFiniteNumber((right as any).orderIndex) ? (right as any).orderIndex : Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return getEntityTs(left) - getEntityTs(right)
  })

  const trash = store.groups.find((group: Group) => group.id === TRASH_GROUP_ID)
  store.groups = trash ? [...sorted, trash] : sorted
}

// Helper: Apply changes to store without triggering store actions
const applyRemoteChanges = (store: any, items: SyncItem[]) => {
  const orderedItems = [...items].sort((left, right) => left.updatedAt - right.updatedAt)

  orderedItems
    .filter(item => item.itemType === 'group')
    .forEach(item => {
      const groupIndex = store.groups.findIndex((group: Group) => group.id === item.itemId)

      if (item.isDeleted) {
        if (groupIndex !== -1) {
          store.groups.splice(groupIndex, 1)
        }
        return
      }

      if (!item.content || typeof item.content !== 'object') return

      const rawGroup = clonePlain(item.content) as ShareAwareGroup
      const normalizedChildren = Array.isArray(rawGroup.children)
        ? rawGroup.children.map(rawSub => {
            const sub = clonePlain(rawSub) as ShareAwareSubGroup
            sub.id = String(sub.id || '').trim() || `sg-${item.itemId}`
            sub.bookmarkIds = Array.from(new Set((Array.isArray(sub.bookmarkIds) ? sub.bookmarkIds : [])
              .map(id => String(id || '').trim())
              .filter(Boolean)))
            sub.createdAt = getEntityTs(sub) || item.updatedAt
            sub.updatedAt = Math.max(getEntityTs(sub), item.updatedAt)
            sub.serverUpdatedAt = item.updatedAt
            return sub
          })
        : []

      const incomingGroup: ShareAwareGroup = {
        ...rawGroup,
        id: item.itemId,
        createdAt: getEntityTs(rawGroup) || item.updatedAt,
        updatedAt: Math.max(getEntityTs(rawGroup), item.updatedAt),
        serverUpdatedAt: item.updatedAt,
        children: normalizedChildren
      }

      if (groupIndex !== -1) {
        store.groups.splice(groupIndex, 1, incomingGroup)
      } else {
        const trashIndex = store.groups.findIndex((group: Group) => group.id === TRASH_GROUP_ID)
        if (incomingGroup.id === TRASH_GROUP_ID || trashIndex === -1) {
          store.groups.push(incomingGroup)
        } else {
          store.groups.splice(trashIndex, 0, incomingGroup)
        }
      }
    })

  orderedItems
    .filter(item => item.itemType === 'subGroup')
    .forEach(item => {
      const owner = findSubOwner(store, item.itemId)

      if (item.isDeleted) {
        if (owner) {
          owner.group.children.splice(owner.subIndex, 1)
          owner.group.updatedAt = Math.max(getEntityTs(owner.group), item.updatedAt)
        }
        return
      }

      if (!item.content || typeof item.content !== 'object') return

      const rawSub = clonePlain(item.content) as ShareAwareSubGroup
      const parentGroupId = String(rawSub.parentGroupId || owner?.group.id || '').trim()
      if (!parentGroupId) return

      let targetGroup = store.groups.find((group: Group) => group.id === parentGroupId) as ShareAwareGroup | undefined
      if (!targetGroup) {
        const now = item.updatedAt
        const createdGroup: ShareAwareGroup = {
          id: parentGroupId,
          name: '同步分组',
          createdAt: now,
          updatedAt: now,
          children: []
        }
        const trashIndex = store.groups.findIndex((group: Group) => group.id === TRASH_GROUP_ID)
        if (trashIndex === -1) {
          store.groups.push(createdGroup)
        } else {
          store.groups.splice(trashIndex, 0, createdGroup)
        }
        targetGroup = createdGroup
      }

      const incomingSub: ShareAwareSubGroup = {
        ...rawSub,
        id: item.itemId,
        bookmarkIds: Array.from(new Set((Array.isArray(rawSub.bookmarkIds) ? rawSub.bookmarkIds : [])
          .map(id => String(id || '').trim())
          .filter(Boolean))),
        createdAt: getEntityTs(rawSub) || item.updatedAt,
        updatedAt: Math.max(getEntityTs(rawSub), item.updatedAt),
        serverUpdatedAt: item.updatedAt,
        parentGroupId
      }

      if (owner && owner.group.id !== targetGroup.id) {
        owner.group.children.splice(owner.subIndex, 1)
        owner.group.updatedAt = Math.max(getEntityTs(owner.group), item.updatedAt)
      }

      const targetSubIndex = targetGroup.children.findIndex((sub: SubGroup) => sub.id === item.itemId)
      if (targetSubIndex !== -1) {
        targetGroup.children.splice(targetSubIndex, 1, incomingSub)
      } else {
        targetGroup.children.push(incomingSub)
      }
      targetGroup.updatedAt = Math.max(getEntityTs(targetGroup), item.updatedAt)
    })

  orderedItems
    .filter(item => item.itemType === 'bookmark')
    .forEach(item => {
      const existingIndex = store.bookmarks.findIndex((bookmark: Bookmark) => bookmark.id === item.itemId)

      if (item.isDeleted) {
        if (existingIndex !== -1) {
          store.bookmarks.splice(existingIndex, 1)
        }
        store.groups.forEach((group: Group) => {
          group.children.forEach((sub: SubGroup) => {
            sub.bookmarkIds = sub.bookmarkIds.filter(id => id !== item.itemId)
          })
        })
        return
      }

      if (!item.content || typeof item.content !== 'object') return

      const incomingBookmark = clonePlain(item.content) as Bookmark
      incomingBookmark.id = item.itemId
      incomingBookmark.createdAt = getEntityTs(incomingBookmark) || item.updatedAt
      incomingBookmark.updatedAt = Math.max(getEntityTs(incomingBookmark), item.updatedAt)
      incomingBookmark.serverUpdatedAt = item.updatedAt
      incomingBookmark.locations = Array.isArray(incomingBookmark.locations) ? incomingBookmark.locations : []

      if (existingIndex !== -1) {
        store.bookmarks.splice(existingIndex, 1, incomingBookmark)
      } else {
        store.bookmarks.push(incomingBookmark)
      }

      // 使用书签 locations 反向修正子分组索引，避免“只更新书签不更新分组”时丢失可见性。
      store.groups.forEach((group: Group) => {
        group.children.forEach((sub: SubGroup) => {
          sub.bookmarkIds = sub.bookmarkIds.filter(id => id !== incomingBookmark.id)
        })
      })

      incomingBookmark.locations.forEach(loc => {
        const group = store.groups.find((item: Group) => item.id === loc.groupId)
        const sub = group?.children.find((item: SubGroup) => item.id === loc.subGroupId)
        if (!sub) return
        if (!sub.bookmarkIds.includes(incomingBookmark.id)) {
          sub.bookmarkIds.push(incomingBookmark.id)
        }
      })
    })

  syncBookmarkLocations(store.groups, store.bookmarks)
  applyGroupOrderIndexes(store)
  ensureActiveSelection(store)
}
