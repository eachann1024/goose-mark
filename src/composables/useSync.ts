

import { ref, computed } from 'vue'
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

// Global Singleton State
const isSyncing = ref(false)
const syncError = ref<string | null>(null)

// Key: shareId, Value: number
const lastSyncTimes = ref<Map<string, number>>(new Map())
// Key: shareId, Value: Map<itemKey, SyncItem>
const pendingQueues = ref<Map<string, Map<string, SyncItem>>>(new Map())
// Key: shareId, Value: boolean
const syncingShares = ref<Set<string>>(new Set())

export function useSync() {
  const store = useBookmarkStore()

  // 获取与某个项相关的所有 ShareId
  const getRelevantShareIds = (item: SyncItem): string[] => {
    const shareIds = new Set<string>()
    
    // 1. 如果是书签，检查它所在的所有分组
    if (item.itemType === 'bookmark') {
      const bookmark = item.content as Bookmark
      if (bookmark && bookmark.locations) {
        bookmark.locations.forEach(loc => {
          const group = store.groups.find(g => g.id === loc.groupId)
          if (group) {
            if (group.shareId) shareIds.add(group.shareId)
            if (group.sourceShareId) shareIds.add(group.sourceShareId)
            
            const sub = group.children.find(s => s.id === loc.subGroupId)
            if (sub) {
              if (sub.shareId) shareIds.add(sub.shareId)
              if (sub.sourceShareId) shareIds.add(sub.sourceShareId)
            }
          }
        })
      }
    } 
    // 2. 如果是分组，检查它自己的 shareId
    else if (item.itemType === 'group') {
      const group = store.groups.find(g => g.id === item.itemId)
      if (group) {
        if (group.shareId) shareIds.add(group.shareId)
        if (group.sourceShareId) shareIds.add(group.sourceShareId)
      }
    }
    // 3. 如果是子分组，检查它自己及父分组的 shareId
    else if (item.itemType === 'subGroup') {
      store.groups.forEach(g => {
        const sub = g.children.find(s => s.id === item.itemId)
        if (sub) {
          if (g.shareId) shareIds.add(g.shareId)
          if (g.sourceShareId) shareIds.add(g.sourceShareId)
          if (sub.shareId) shareIds.add(sub.shareId)
          if (sub.sourceShareId) shareIds.add(sub.sourceShareId)
        }
      })
    }

    // 4. 始终包含当前激活的分组和子分组（作为保底）
    const activeGroup = store.groups.find(g => g.id === store.activeGroupId)
    if (activeGroup) {
      if (activeGroup.shareId) shareIds.add(activeGroup.shareId)
      if (activeGroup.sourceShareId) shareIds.add(activeGroup.sourceShareId)
      
      const activeSub = activeGroup.children.find(s => s.id === store.activeSubGroupId)
      if (activeSub) {
        if (activeSub.shareId) shareIds.add(activeSub.shareId)
        if (activeSub.sourceShareId) shareIds.add(activeSub.sourceShareId)
      }
    }

    return Array.from(shareIds).filter(id => !!id) as string[]
  }

  // 添加变更到队列
  const schedulePush = (item: SyncItem) => {
    const targetShareIds = getRelevantShareIds(item)
    if (targetShareIds.length === 0) return

    targetShareIds.forEach(shareId => {
      if (!pendingQueues.value.has(shareId)) {
        pendingQueues.value.set(shareId, new Map())
      }
      const queue = pendingQueues.value.get(shareId)!
      queue.set(`${item.itemType}:${item.itemId}`, item)
      
      console.log(`[Sync] Scheduled push for ${shareId}:`, item.itemId, item.itemType)
      
      // 触发该 shareId 的同步
      if (!syncingShares.value.has(shareId)) {
        setTimeout(() => triggerSync(shareId), 1000)
      }
    })
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
        const res = await fetch(`${API_BASE_URL}/${shareId}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToPush })
        })
        
        if (!res.ok) throw new Error(`Push failed for ${shareId}`)
        
        // Push 成功后清理该 shareId 的队列
        queue.clear()
      }

      // 2. Pull Phase
      const since = lastSyncTimes.value.get(shareId) || 0
      const res = await fetch(`${API_BASE_URL}/${shareId}/pull?since=${since}`)
      if (!res.ok) throw new Error(`Pull failed for ${shareId}`)
      
      const { items, lastUpdatedAt } = await res.json()
      
      if (items.length > 0) {
        console.log('[Sync] Pulled', items.length, 'items from', shareId)
        applyRemoteChanges(store, items)
        lastSyncTimes.value.set(shareId, lastUpdatedAt)
        // 同步后刷新缺失图标
        store.refreshMissingIcons()
      }

    } catch (e: any) {
      console.error(`[Sync] Error for ${shareId}:`, e)
      syncError.value = e.message
    } finally {
      syncingShares.value.delete(shareId)
      isSyncing.value = syncingShares.value.size > 0
    }
  }

  return {
    isSyncing,
    syncError,
    schedulePush,
    triggerSync
  }
}

// Helper: Apply changes to store without triggering schedulePush (Infinite Loop Prevention)
const applyRemoteChanges = (store: any, items: SyncItem[]) => {
    items.forEach(item => {
      // 这里的逻辑需要非常小心，直接修改 store状态，而不调用 store actions
      // 或者 store actions 支持 fromSync 参数
      
      if (item.itemType === 'bookmark') {
        const existingIdx = store.bookmarks.findIndex((b: any) => b.id === item.itemId)
        if (item.isDeleted) {
          if (existingIdx !== -1) {
             console.log('[Sync] Applying remote delete:', item.itemId)
             store.bookmarks.splice(existingIdx, 1)
             // Clean up locations?
             store.groups.forEach((g: Group) => {
               g.children.forEach((sub: SubGroup) => {
                 sub.bookmarkIds = sub.bookmarkIds.filter(id => id !== item.itemId)
               })
             })
          }
        } else {
             const newItem = item.content as Bookmark
             newItem.serverUpdatedAt = item.updatedAt
             if (existingIdx !== -1) {
               console.log('[Sync] Applying remote update:', item.itemId)
               // Merge: keep local properties that are not synced? 
               // For now: Overwrite
               store.bookmarks.splice(existingIdx, 1, newItem)
             } else {
               console.log('[Sync] Applying remote add:', item.itemId)
               store.bookmarks.push(newItem)
               // Restore locations? 
               // newItem.locations should be in content.
               // We need to ensure groups exist? 
               // This implies we need to sync Groups first.
             }
        }
      }
    })
}
