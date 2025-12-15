import { defineStore } from 'pinia'
import PinyinMatch from 'pinyin-match'
import type { Bookmark, Group, IconSource, BookmarkLocation } from '@/types/bookmark'
import { bulkMatchMissing, ensureIconForBookmark } from '@/services/iconCache'
import { utoolsStorage } from '@/lib/utoolsStorage'

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)

export const TRASH_GROUP_ID = 'g-trash'

// 旧版数据结构（用于迁移）
interface LegacySubGroup {
  id: string
  name: string
  bookmarks: Bookmark[]
}
interface LegacyGroup {
  id: string
  name: string
  children: LegacySubGroup[]
}

const seedGroups = [
  {
    id: 'g-default',
    name: '默认分组',
    children: [
      {
        id: 'sg-default',
        name: '未分组',
        bookmarkIds: []
      }
    ]
  },
  {
    id: TRASH_GROUP_ID,
    name: '回收站',
    children: [
      {
        id: 'sg-trash',
        name: '已删除',
        bookmarkIds: []
      }
    ]
  }
]

export const useBookmarkStore = defineStore('bookmark', {
  state: () => ({
    groups: seedGroups as Group[],
    bookmarks: [] as Bookmark[],  // 提升到顶层的书签集合
    search: '',
    activeGroupId: seedGroups[0]?.id ?? '',
    activeSubGroupId: seedGroups[0]?.children?.[0]?.id ?? ''
  }),
  getters: {
    currentGroup(state) {
      return state.groups.find(g => g.id === state.activeGroupId)
    },
    currentSubGroup(state): { group?: Group; sub?: Group['children'][number] } {
      const group = state.groups.find(g => g.id === state.activeGroupId)
      const sub = group?.children.find(c => c.id === state.activeSubGroupId)
      return { group, sub }
    },
    currentBookmarks(): Bookmark[] {
      const { sub } = this.currentSubGroup
      if (!sub) return []
      return sub.bookmarkIds
        .map(id => this.bookmarks.find(b => b.id === id))
        .filter((b): b is Bookmark => !!b)
    },
    filteredBookmarks(): Bookmark[] {
      const query = (typeof this.search === 'string' ? this.search : '').trim().toLowerCase()
      const pool = this.currentBookmarks
      if (!query) return pool
      return pool.filter(item => {
        const haystack = [item.title, item.desc ?? '', item.url, item.tags.join(' ')].join(' ').toLowerCase()
        // 普通匹配优先（性能更好）
        if (haystack.includes(query)) return true
        // 拼音匹配仅在普通匹配失败时触发
        return !!PinyinMatch.match(haystack, query)
      })
    },
    // 根据 bookmarkId 获取其所有位置
    getBookmarkLocations(): (id: string) => BookmarkLocation[] {
      return (id: string) => {
        const result: BookmarkLocation[] = []
        this.groups.forEach(g => {
          g.children.forEach(sub => {
            if (sub.bookmarkIds.includes(id)) {
              result.push({ groupId: g.id, subGroupId: sub.id })
            }
          })
        })
        return result
      }
    }
  },
  actions: {
    // 数据迁移：从旧的嵌套结构迁移到新的引用结构
    migrateFromLegacy() {
      const legacyGroups = this.groups as unknown as LegacyGroup[]
      // 检测是否为旧格式（children[0] 有 bookmarks 数组而非 bookmarkIds）
      const firstSub = legacyGroups[0]?.children?.[0]
      if (!firstSub || !('bookmarks' in firstSub)) return // 已经是新格式

      const migratedBookmarks: Bookmark[] = []
      const migratedGroups: Group[] = []

      legacyGroups.forEach(g => {
        const newChildren = g.children.map(sub => {
          const bookmarkIds = sub.bookmarks.map(b => {
            // 避免重复添加相同 ID 的书签
            if (!migratedBookmarks.find(mb => mb.id === b.id)) {
              migratedBookmarks.push(b)
            }
            return b.id
          })
          return { id: sub.id, name: sub.name, bookmarkIds }
        })
        migratedGroups.push({ id: g.id, name: g.name, children: newChildren })
      })

      this.groups = migratedGroups
      this.bookmarks = migratedBookmarks
      
      // Ensure Trash group exists post-migration
      if (!this.groups.find(g => g.id === TRASH_GROUP_ID)) {
        this.groups.push({
          id: TRASH_GROUP_ID,
          name: '回收站',
          children: [
             { id: 'sg-trash', name: '已删除', bookmarkIds: [] }
          ]
        })
      }
    },
    addGroup(name: string) {
      const group: Group = {
        id: uid(),
        name,
        children: [
          {
            id: uid(),
            name: '子分组',
            bookmarkIds: []
          }
        ]
      }
      this.groups.push(group)
      this.activeGroupId = group.id
      this.activeSubGroupId = group.children[0].id
      return group
    },
    addSubGroup(name: string, groupId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group) return null
      const sub = { id: uid(), name, bookmarkIds: [] }
      group.children.push(sub)
      this.activeSubGroupId = sub.id
      return sub
    },
    updateGroup(id: string, name: string) {
      const group = this.groups.find(g => g.id === id)
      if (group) group.name = name
    },
    updateSubGroup(groupId: string, subId: string, name: string) {
      const group = this.groups.find(g => g.id === groupId)
      const sub = group?.children.find(c => c.id === subId)
      if (sub) sub.name = name
    },
    setSearch(value: string) {
      this.search = typeof value === 'string' ? value : ''
    },
    selectGroup(groupId: string, subId?: string) {
      this.activeGroupId = groupId
      const group = this.groups.find(g => g.id === groupId)
      const firstSub = group?.children?.[0]
      this.activeSubGroupId = subId ?? firstSub?.id ?? ''
    },
    selectSubGroup(subId: string) {
      this.activeSubGroupId = subId
    },
    // 新增书签，支持多分组位置
    addBookmark(payload: Omit<Bookmark, 'id'>, locations: BookmarkLocation[]) {
      const bookmark: Bookmark = { ...payload, id: uid(), locations }
      this.bookmarks.push(bookmark)
      // 将书签 ID 添加到所有指定位置
      locations.forEach(loc => {
        const group = this.groups.find(g => g.id === loc.groupId)
        let sub = group?.children.find(c => c.id === loc.subGroupId)
        // 如果子分组不存在，创建默认子分组
        if (!sub && group) {
          const created = this.addSubGroup('未分组', group.id)
          if (created) sub = created
        }
        
        if (sub && !sub.bookmarkIds.includes(bookmark.id)) {
          sub.bookmarkIds.push(bookmark.id)
        }
      })
      
      return bookmark
    },
    // 更新书签分组位置
    updateBookmarkLocations(bookmarkId: string, newLocations: BookmarkLocation[]) {
      // 构建新位置的 key 集合便于快速查找
      const newLocSet = new Set(newLocations.map(loc => `${loc.groupId}:${loc.subGroupId}`))
      
      // 记录书签在各个子分组中的原始位置索引
      const originalIndexMap = new Map<string, number>()
      this.groups.forEach(g => {
        g.children.forEach(sub => {
          const idx = sub.bookmarkIds.indexOf(bookmarkId)
          if (idx !== -1) {
            originalIndexMap.set(`${g.id}:${sub.id}`, idx)
          }
        })
      })
      
      // 从不在新位置列表中的分组移除
      this.groups.forEach(g => {
        g.children.forEach(sub => {
          const key = `${g.id}:${sub.id}`
          if (!newLocSet.has(key)) {
            sub.bookmarkIds = sub.bookmarkIds.filter(id => id !== bookmarkId)
          }
        })
      })
      
      // 添加到新位置（如果原本就在该位置则保持原顺序）
      newLocations.forEach(loc => {
        const group = this.groups.find(g => g.id === loc.groupId)
        const sub = group?.children.find(c => c.id === loc.subGroupId)
        if (!sub) return
        
        const key = `${loc.groupId}:${loc.subGroupId}`
        const existingIdx = sub.bookmarkIds.indexOf(bookmarkId)
        
        if (existingIdx === -1) {
          // 新位置，添加到末尾
          sub.bookmarkIds.push(bookmarkId)
        }
        // 如果已存在则保持原位置不变
      })
      
      // 更新书签的 locations 字段
      const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
      if (bookmark) bookmark.locations = newLocations
    },
    updateBookmark(id: string, updater: Partial<Bookmark>) {
      const idx = this.bookmarks.findIndex(b => b.id === id)
      if (idx === -1) return
      
      const original = this.bookmarks[idx]
      const urlChanged = updater.url && updater.url !== original.url
      const iconMissing = !original.icon || original.icon.type === 'text'
      
      // 使用 splice 确保响应式更新被正确追踪
      const updated = { ...original, ...updater }
      this.bookmarks.splice(idx, 1, updated)
      
      if (urlChanged && iconMissing) this.refreshSingleIcon(updated)
    },
    removeBookmark(id: string) {
      // Check if already in trash
      const inTrash = this.getBookmarkLocations(id).some(loc => loc.groupId === TRASH_GROUP_ID)
      
      if (inTrash) {
        // Permanently delete
        this.groups.forEach(g => {
          g.children.forEach(sub => {
            sub.bookmarkIds = sub.bookmarkIds.filter(bid => bid !== id)
          })
        })
        this.bookmarks = this.bookmarks.filter(b => b.id !== id)
      } else {
        // Move to trash
        this.updateBookmarkLocations(id, [{ groupId: TRASH_GROUP_ID, subGroupId: 'sg-trash' }])
      }
    },
    restoreBookmark(id: string) {
      // Restore to default group
      this.updateBookmarkLocations(id, [{ groupId: 'g-default', subGroupId: 'sg-default' }])
    },
    emptyTrash() {
      const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const trashSub = trashGroup?.children[0]
      if (!trashSub) return
      
      const idsToRemove = [...trashSub.bookmarkIds]
      idsToRemove.forEach(id => {
         // Remove from trash group
         trashSub.bookmarkIds = trashSub.bookmarkIds.filter(bid => bid !== id)
         // Remove from global bookmarks list
         this.bookmarks = this.bookmarks.filter(b => b.id !== id)
      })
    },
    async refreshSingleIcon(bookmark: Bookmark) {
      const icon = await ensureIconForBookmark(bookmark)
      if (!icon) return
      this.assignIcon(bookmark.id, icon)
    },
    async refreshMissingIcons() {
      const missing = this.bookmarks.filter(b => !b.icon || b.icon.type === 'text')
      const result = await bulkMatchMissing(missing)
      result.forEach((icon, id) => this.assignIcon(id, icon))
    },
    assignIcon(id: string, icon: IconSource) {
      const idx = this.bookmarks.findIndex(b => b.id === id)
      if (idx !== -1) {
        // 使用 splice 确保响应式更新
        this.bookmarks.splice(idx, 1, { ...this.bookmarks[idx], icon })
      }
    },
    removeGroup(id: string) {
      const idx = this.groups.findIndex(g => g.id === id)
      if (idx === -1) return false
      
      const group = this.groups[idx]
      
      // Clean up bookmarks in this group
      group.children.forEach(sub => {
        // Iterate copy of ids
        [...sub.bookmarkIds].forEach(bid => {
          const bookmark = this.bookmarks.find(b => b.id === bid)
          if (bookmark) {
            // Remove this location reference
            bookmark.locations = bookmark.locations?.filter(loc => loc.groupId !== id) || []
            
            // If no locations left, move to trash
            if (bookmark.locations.length === 0) {
              this.removeBookmark(bid)
            }
          }
        })
      })
      
      this.groups.splice(idx, 1)
      if (this.activeGroupId === id) {
        this.activeGroupId = this.groups[0]?.id ?? ''
        this.activeSubGroupId = this.groups[0]?.children[0]?.id ?? ''
      }
      return true
    },
    removeSubGroup(groupId: string, subId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group) return false
      
      const idx = group.children.findIndex(c => c.id === subId)
      if (idx === -1) return false
      
      const sub = group.children[idx];
      
      // Clean up bookmarks
      [...sub.bookmarkIds].forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark) {
           // Remove this location reference
           bookmark.locations = bookmark.locations?.filter(loc => !(loc.groupId === groupId && loc.subGroupId === subId)) || []
           
           // If no locations left, move to trash
           if (bookmark.locations.length === 0) {
             this.removeBookmark(bid)
           }
        }
      })
      
      group.children.splice(idx, 1)
      if (this.activeSubGroupId === subId) {
        this.activeSubGroupId = group.children[0]?.id ?? ''
      }
      return true
    },
    reorderInSub(groupId: string, subId: string, fromId: string, toId: string) {
      const group = this.groups.find(g => g.id === groupId)
      const sub = group?.children.find(c => c.id === subId)
      if (!sub) return
      const fromIdx = sub.bookmarkIds.indexOf(fromId)
      const toIdx = sub.bookmarkIds.indexOf(toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
      const list = [...sub.bookmarkIds]
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      sub.bookmarkIds = list
    },
    // 重新排序主分组
    reorderGroups(newOrder: Group[]) {
      // 保持 Trash 在最后
      const trash = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const filtered = newOrder.filter(g => g.id !== TRASH_GROUP_ID)
      this.groups = trash ? [...filtered, trash] : filtered
    },
    // 重新排序子分组
    reorderSubGroups(groupId: string, newChildren: Group['children']) {
      const group = this.groups.find(g => g.id === groupId)
      if (group) group.children = newChildren
    },
    // 移动子分组到另一个主分组
    moveSubToGroup(sourceGroupId: string, subId: string, targetGroupId: string) {
      const sourceGroup = this.groups.find(g => g.id === sourceGroupId)
      const targetGroup = this.groups.find(g => g.id === targetGroupId)
      if (!sourceGroup || !targetGroup) return false
      
      const subIdx = sourceGroup.children.findIndex(c => c.id === subId)
      if (subIdx === -1) return false
      
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      targetGroup.children.push(sub)
      
      // 更新书签的 locations
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark?.locations) {
          bookmark.locations = bookmark.locations.map(loc => 
            loc.groupId === sourceGroupId && loc.subGroupId === subId
              ? { ...loc, groupId: targetGroupId }
              : loc
          )
        }
      })
      
      // 如果源分组没有子分组了，创建一个默认子分组
      if (sourceGroup.children.length === 0) {
        sourceGroup.children.push({ id: uid(), name: '未分组', bookmarkIds: [] })
      }
      
      return true
    },
    // 将子分组升级为主分组
    promoteSubToGroup(sourceGroupId: string, subId: string) {
      const sourceGroup = this.groups.find(g => g.id === sourceGroupId)
      if (!sourceGroup) return null
      
      const subIdx = sourceGroup.children.findIndex(c => c.id === subId)
      if (subIdx === -1) return null
      
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      
      // 创建新的主分组
      const newGroup: Group = {
        id: uid(),
        name: sub.name,
        children: [{ id: sub.id, name: '默认', bookmarkIds: sub.bookmarkIds }]
      }
      
      // 插入到 Trash 之前
      const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) {
        this.groups.splice(trashIdx, 0, newGroup)
      } else {
        this.groups.push(newGroup)
      }
      
      // 更新书签的 locations
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark?.locations) {
          bookmark.locations = bookmark.locations.map(loc =>
            loc.groupId === sourceGroupId && loc.subGroupId === subId
              ? { groupId: newGroup.id, subGroupId: sub.id }
              : loc
          )
        }
      })
      
      // 如果源分组没有子分组了，创建一个默认子分组
      if (sourceGroup.children.length === 0) {
        sourceGroup.children.push({ id: uid(), name: '未分组', bookmarkIds: [] })
      }
      
      this.activeGroupId = newGroup.id
      this.activeSubGroupId = sub.id
      
      return newGroup
    }
  },
  persist: {
    storage: utoolsStorage,
  },
})
