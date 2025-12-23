
import PinyinMatch from 'pinyin-match'
import type { Bookmark, Group, IconSource, BookmarkLocation } from '@/types/bookmark'
import { bulkMatchMissing, ensureIconForBookmark } from '@/services/iconCache'
import { utoolsStorage } from '@/lib/utoolsStorage'

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)

// 从分享链接/分享码中解析 shareId
export const parseShareIdFromUrl = (input: string): string | null => {
  if (!input) return null
  const trimmed = input.trim()
  // 完整 URL: http(s)://xxx/s/shareId
  const urlMatch = trimmed.match(/\/s\/([a-zA-Z0-9_-]+)$/)
  if (urlMatch) return urlMatch[1]
  // 纯 shareId (10位字母数字)
  if (/^[a-zA-Z0-9_-]{6,15}$/.test(trimmed)) return trimmed
  return null
}

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
    activeSubGroupId: seedGroups[0]?.children?.[0]?.id ?? '',
    isReadOnly: false
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
    // 删除子分组
    deleteSubGroup(groupId: string, subGroupId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (group) {
        const index = group.children.findIndex(c => c.id === subGroupId)
        if (index !== -1) {
          // Remove bookmarks in this subgroup
          const subGroup = group.children[index]
          this.bookmarks = this.bookmarks.filter(b => !subGroup.bookmarkIds.includes(b.id))
          
          group.children.splice(index, 1)
          
          // Reset active subgroup if needed
          if (this.activeSubGroupId === subGroupId) {
            this.activeSubGroupId = group.children[0]?.id || ''
          }
        }
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
      return {
        total: missing.length,
        matched: result.size,
        remaining: this.bookmarks.filter(b => !b.icon || b.icon.type === 'text').length
      }
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
    },
    // 加载分享快照（Web 端首次打开分享链接时）
    loadFromSnapshot(data: { groups: Group[]; bookmarks: Bookmark[] }, readOnly = false) {
      this.groups = data.groups
      this.bookmarks = data.bookmarks
      this.isReadOnly = readOnly
      
      // Reset active selections to first valid if possible
      this.activeGroupId = this.groups[0]?.id ?? ''
      this.activeSubGroupId = this.groups[0]?.children[0]?.id ?? ''
    },
    // 合并分享数据到现有分组（Web 端打开多个分享链接时）
    mergeFromShare(data: { groups: Group[]; bookmarks: Bookmark[] }, shareId: string): Group | null {
      if (!data.groups.length) return null
      
      const now = Date.now()
      const idMap = new Map<string, string>()
      
      // 为书签生成新 ID
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      
      // 复制书签
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: [] as BookmarkLocation[]
      }))
      
      // 创建新分组
      const sourceGroup = data.groups[0]
      const newGroupId = uid()
      const newSubGroups = sourceGroup.children.map(sub => {
        const newSubId = uid()
        return {
          id: newSubId,
          name: sub.name,
          bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId) || oldId),
          sourceShareId: shareId,
          lastSyncedAt: now
        }
      })
      
      const newGroup: Group = {
        id: newGroupId,
        name: sourceGroup.name || '来自分享',
        children: newSubGroups,
        sourceShareId: shareId,
        lastSyncedAt: now
      }
      
      // 更新书签 locations
      newBookmarks.forEach(b => {
        b.locations = newSubGroups
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: newGroupId, subGroupId: sub.id }))
      })
      
      // 检查分组名冲突，自动添加后缀
      let finalName = newGroup.name
      let suffix = 1
      while (this.groups.some(g => g.name === finalName && g.id !== TRASH_GROUP_ID)) {
        finalName = `${sourceGroup.name || '来自分享'} (${suffix++})`
      }
      newGroup.name = finalName
      
      // 插入到 Trash 之前
      const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) {
        this.groups.splice(trashIdx, 0, newGroup)
      } else {
        this.groups.push(newGroup)
      }
      
      this.bookmarks.push(...newBookmarks)
      this.isReadOnly = false
      
      return newGroup
    },
    // 导入分享到现有分组（uTools 智能导入）
    importToExistingGroup(data: { groups: Group[]; bookmarks: Bookmark[] }, targetGroupId: string, shareId: string): boolean {
      if (!data.groups.length) return false
      
      const targetGroup = this.groups.find(g => g.id === targetGroupId)
      if (!targetGroup) return false
      
      const now = Date.now()
      const idMap = new Map<string, string>()
      
      // 为书签生成新 ID
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      
      // 复制书签
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: []
      }))
      
      // 将源分组的子分组添加到目标分组
      const sourceGroup = data.groups[0]
      const newSubGroups = sourceGroup.children.map(sub => {
        // 检查子分组名冲突
        let subName = sub.name
        let suffix = 1
        while (targetGroup.children.some(c => c.name === subName)) {
          subName = `${sub.name} (${suffix++})`
        }
        const newSubId = uid()
        return {
          id: newSubId,
          name: subName,
          bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId) || oldId),
          sourceShareId: shareId,
          lastSyncedAt: now
        }
      })
      
      // 更新书签 locations
      newBookmarks.forEach(b => {
        b.locations = newSubGroups
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: targetGroupId, subGroupId: sub.id }))
      })
      
      // 添加子分组和书签
      targetGroup.children.push(...newSubGroups)
      this.bookmarks.push(...newBookmarks)
      
      // 切换到导入的第一个子分组
      this.activeGroupId = targetGroupId
      this.activeSubGroupId = newSubGroups[0]?.id || targetGroup.children[0]?.id || ''
      
      return true
    },
    // 根据 sourceShareId 查找已导入的分组
    findGroupBySourceShareId(shareId: string): Group | null {
      return this.groups.find(g => g.sourceShareId === shareId) || null
    },
    // 设置分享 ID
    setShareId(type: 'subGroup' | 'group', groupId: string, subGroupId: string | undefined, shareId: string) {
      if (type === 'group') {
        const group = this.groups.find(g => g.id === groupId)
        if (group) group.shareId = shareId
      } else if (subGroupId) {
        const group = this.groups.find(g => g.id === groupId)
        const sub = group?.children.find(c => c.id === subGroupId)
        if (sub) sub.shareId = shareId
      }
    },
    // 清除分享 ID
    clearShareId(type: 'subGroup' | 'group', groupId: string, subGroupId?: string) {
      if (type === 'group') {
        const group = this.groups.find(g => g.id === groupId)
        if (group) delete group.shareId
      } else if (subGroupId) {
        const group = this.groups.find(g => g.id === groupId)
        const sub = group?.children.find(c => c.id === subGroupId)
        if (sub) delete sub.shareId
      }
    },
    // 获取分组/子分组的分享 ID
    getShareId(type: 'subGroup' | 'group', groupId: string, subGroupId?: string): string | undefined {
      if (type === 'group') {
        return this.groups.find(g => g.id === groupId)?.shareId
      }
      const group = this.groups.find(g => g.id === groupId)
      return group?.children.find(c => c.id === subGroupId)?.shareId
    },
    // 从分享数据导入为新分组
    importFromShare(data: { groups: Group[]; bookmarks: Bookmark[] }, shareId: string, shareName?: string): Group | null {
      if (!data.groups.length) return null
      
      const now = Date.now()
      
      // 生成新的 ID 避免冲突
      const idMap = new Map<string, string>()  // 旧 ID -> 新 ID
      
      // 为所有书签生成新 ID
      data.bookmarks.forEach(b => {
        idMap.set(b.id, uid())
      })
      
      // 复制书签并更新 ID
      const newBookmarks = data.bookmarks.map(b => {
        const newId = idMap.get(b.id)!
        return {
          ...b,
          id: newId,
          locations: b.locations?.map(loc => ({
            ...loc,
            // locations 稍后会更新
          })) || []
        }
      })
      
      // 创建新分组
      const sourceGroup = data.groups[0]
      const newGroupId = uid()
      const newSubGroups = sourceGroup.children.map(sub => {
        const newSubId = uid()
        return {
          id: newSubId,
          name: sub.name,
          bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId) || oldId),
          sourceShareId: shareId, // 记录来源分享 ID
          lastSyncedAt: now
        }
      })
      
      const newGroup: Group = {
        id: newGroupId,
        name: shareName || sourceGroup.name || '来自分享',
        children: newSubGroups,
        sourceShareId: shareId, // 记录来源分享 ID
        lastSyncedAt: now
      }
      
      // 更新书签的 locations 到新 ID
      newBookmarks.forEach(b => {
        b.locations = newSubGroups
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: newGroupId, subGroupId: sub.id }))
      })
      
      // 插入到 Trash 之前
      const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) {
        this.groups.splice(trashIdx, 0, newGroup)
      } else {
        this.groups.push(newGroup)
      }
      
      // 添加书签
      this.bookmarks.push(...newBookmarks)
      
      // 切换到新分组
      this.activeGroupId = newGroup.id
      this.activeSubGroupId = newGroup.children[0]?.id || ''
      
      return newGroup
    },
    // 更新已导入的分享分组
    updateFromShare(groupId: string, data: { groups: Group[]; bookmarks: Bookmark[] }) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group || !group.sourceShareId) return false
      
      const now = Date.now()
      const sourceGroup = data.groups[0]
      if (!sourceGroup) return false
      
      // 1. 更新子分组结构：保留本地 ID，同步名称和顺序
      // 策略：尽量复用现有子分组 ID，以保持用户习惯（虽然不仅读，但为了 UI 稳定）。
      // 实际上对于只读分组，我们可以直接全量替换子分组和书签内容，但要小心本地状态（如展开状态）。
      // 为了简化，我们清空该组下所有旧书签，重新导入新书签。
      
      // 找出该组下的所有旧书签 ID
      const oldBookmarkIds = new Set<string>()
      group.children.forEach(sub => sub.bookmarkIds.forEach(id => oldBookmarkIds.add(id)))
      
      // 从 store.bookmarks 中移除
      this.bookmarks = this.bookmarks.filter(b => !oldBookmarkIds.has(b.id))
      
      // 准备新数据
      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: [] // 稍后设置
      }))
      
      // 重建子分组
      // 复用现有子分组 ID 很难一一对应，因为源数据只有 name。
      // 所以每次都新建子分组吧，或者尝试按名称匹配复用 ID？
      // 按名称匹配复用 ID 用户体验更好。
      const newChildren = sourceGroup.children.map(srcSub => {
        const existingSub = group.children.find(c => c.name === srcSub.name)
        const subId = existingSub ? existingSub.id : uid()
        return {
          id: subId,
          name: srcSub.name,
          bookmarkIds: srcSub.bookmarkIds.map(oldId => idMap.get(oldId)!),
          sourceShareId: group.sourceShareId,
          lastSyncedAt: now
        }
      })
      
      group.children = newChildren
      group.name = sourceGroup.name || group.name // 更新组名
      group.lastSyncedAt = now
      
      // 设置 locations
      newBookmarks.forEach(b => {
        b.locations = newChildren
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: group.id, subGroupId: sub.id }))
      })
      
      this.bookmarks.push(...newBookmarks)
      return true
    }
  },
  persist: {
    storage: utoolsStorage,
  },
})
