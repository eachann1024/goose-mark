import PinyinMatch from 'pinyin-match'
import type { Bookmark, Group, IconSource, BookmarkLocation, SubGroup } from '@/types/bookmark'
import { bulkMatchMissing, ensureIconForBookmark } from '@/services/iconCache'
import { utoolsStorage } from '@/lib/utoolsStorage'

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)

// 从分享链接/分享码中解析 shareId
export const parseShareIdFromUrl = (input: string): string | null => {
  if (!input) return null
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/\/s\/([a-zA-Z0-9_-]+)$/)
  if (urlMatch) return urlMatch[1]
  if (/^[a-zA-Z0-9_-]{6,15}$/.test(trimmed)) return trimmed
  return null
}

export const TRASH_GROUP_ID = 'g-trash'

const now = Date.now()
const seedGroups: Group[] = [
  {
    id: 'g-default',
    name: '默认',
    createdAt: now,
    updatedAt: now,
    children: [
      {
        id: 'sg-default',
        name: '子分组',
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      }
    ]
  },
  {
    id: TRASH_GROUP_ID,
    name: '回收站',
    createdAt: now,
    updatedAt: now,
    children: [
      {
        id: 'sg-trash',
        name: '已删除',
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      }
    ]
  }
]

export const useBookmarkStore = defineStore('bookmark', {
  state: () => ({
    groups: seedGroups as Group[],
    bookmarks: [] as Bookmark[],
    search: '',
    activeGroupId: seedGroups[0]?.id ?? '',
    activeSubGroupId: seedGroups[0]?.children?.[0]?.id ?? '',
    isReadOnly: false
  }),
  getters: {
    currentGroup(state) {
      return state.groups.find(g => g.id === state.activeGroupId)
    },
    currentSubGroup(state): { group?: Group; sub?: SubGroup } {
      const group = state.groups.find(g => g.id === state.activeGroupId)
      const sub = group?.children.find(c => c.id === state.activeSubGroupId)
      return { group, sub }
    },
    currentBookmarks(): Bookmark[] {
      const { sub } = this.currentSubGroup
      if (!sub) return []
      return sub.bookmarkIds
        .map(id => this.bookmarks.find(b => b.id === id))
        .filter((b): b is Bookmark => !!b && !b.isDeleted)
    },
    filteredBookmarks(): Bookmark[] {
      const query = (typeof this.search === 'string' ? this.search : '').trim().toLowerCase()
      const pool = this.currentBookmarks
      if (!query) return pool
      return pool.filter(item => {
        const haystack = [item.title, item.desc ?? '', item.url, item.tags.join(' ')].join(' ').toLowerCase()
        if (haystack.includes(query)) return true
        return !!PinyinMatch.match(haystack, query)
      })
    },
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
    // 自动清理回收站（超过30天）
    autoCleanTrash() {
      const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      if (!trashGroup) return
      
      const now = Date.now()
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
      let changed = false
      
      trashGroup.children.forEach(sub => {
        const originalLen = sub.bookmarkIds.length
        const newIds: string[] = []
        
        sub.bookmarkIds.forEach(bid => {
           const bookmark = this.bookmarks.find(b => b.id === bid)
           // 如果书签不存在，或者已超过 30 天，则不保留
           if (bookmark) {
             if ((now - bookmark.updatedAt) <= THIRTY_DAYS) {
               newIds.push(bid)
             } else {
               // 从 bookmarks 中移除
               const bIdx = this.bookmarks.findIndex(b => b.id === bid)
               if (bIdx !== -1) this.bookmarks.splice(bIdx, 1)
             }
           }
        })

        if (sub.bookmarkIds.length !== newIds.length) {
          sub.bookmarkIds = newIds
          sub.updatedAt = now
          changed = true
        }
      })
      
      if (changed) {
        trashGroup.updatedAt = now
      }
    },

    migrateFromLegacy() {
      const legacyGroups = this.groups as any[]
      const firstSub = legacyGroups[0]?.children?.[0]
      if (!firstSub || !('bookmarks' in firstSub)) {
        // 已经是新格式，但可能缺少时间戳，补充一下
        const now = Date.now()
        this.groups.forEach(g => {
          if (!g.createdAt) g.createdAt = now
          if (!g.updatedAt) g.updatedAt = now
          g.children.forEach(sub => {
            if (!sub.createdAt) sub.createdAt = now
            if (!sub.updatedAt) sub.updatedAt = now
          })
        })
        this.bookmarks.forEach(b => {
          if (!b.createdAt) b.createdAt = now
          if (!b.updatedAt) b.updatedAt = now
        })
        return
      }

      const migratedBookmarks: Bookmark[] = []
      const migratedGroups: Group[] = []
      const now = Date.now()

      legacyGroups.forEach(g => {
        const newChildren = g.children.map((sub: any) => {
          const bookmarkIds = sub.bookmarks.map((b: Bookmark) => {
            if (!migratedBookmarks.find(mb => mb.id === b.id)) {
              if (!b.createdAt) b.createdAt = now
              if (!b.updatedAt) b.updatedAt = now
              migratedBookmarks.push(b)
            }
            return b.id
          })
          return { 
            id: sub.id, 
            name: sub.name, 
            bookmarkIds, 
            createdAt: sub.createdAt || now, 
            updatedAt: sub.updatedAt || now 
          }
        })
        migratedGroups.push({ 
          id: g.id, 
          name: g.name, 
          children: newChildren, 
          createdAt: g.createdAt || now, 
          updatedAt: g.updatedAt || now 
        })
      })

      this.groups = migratedGroups
      this.bookmarks = migratedBookmarks
      
      if (!this.groups.find(g => g.id === TRASH_GROUP_ID)) {
        this.groups.push({
          id: TRASH_GROUP_ID,
          name: '回收站',
          createdAt: now,
          updatedAt: now,
          children: [
             { id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }
          ]
        })
      }

      this.autoCleanTrash()
    },

    deleteSubGroup(groupId: string, subGroupId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (group) {
        const index = group.children.findIndex(c => c.id === subGroupId)
        if (index !== -1) {
          const subGroup = group.children[index]
          const now = Date.now()
          
          // 1. 收集需要移动到回收站的书签
          const toTrash: string[] = []
          subGroup.bookmarkIds.forEach(bid => {
            const bookmark = this.bookmarks.find(b => b.id === bid)
            if (bookmark) {
              bookmark.locations = bookmark.locations?.filter(loc => 
                !(loc.groupId === groupId && loc.subGroupId === subGroupId)
              ) || []
              if (bookmark.locations.length === 0) {
                bookmark.updatedAt = now
                toTrash.push(bid)
              }
            }
          })
          
          // 2. 删除子分组
          group.children.splice(index, 1)
          group.updatedAt = now
          
          // 3. 将书签添加到回收站（去重）
          let trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
          if (!trashGroup) {
            trashGroup = {
              id: TRASH_GROUP_ID,
              name: '回收站',
              createdAt: now,
              updatedAt: now,
              children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }]
            }
            this.groups.push(trashGroup)
          }
          if (trashGroup.children.length === 0) {
            trashGroup.children.push({ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now })
          }
          const trashSub = trashGroup.children[0]
          
          if (toTrash.length > 0) {
            toTrash.forEach(bid => {
              if (!trashSub.bookmarkIds.includes(bid)) {
                trashSub.bookmarkIds.push(bid)
              }
              const bookmark = this.bookmarks.find(b => b.id === bid)
              if (bookmark) {
                bookmark.locations = [{ groupId: TRASH_GROUP_ID, subGroupId: trashSub.id }]
              }
            })
            trashSub.updatedAt = now
            trashGroup.updatedAt = now
          }
          
          // 4. 如果删除子分组后，主分组没有子分组了，且是分享/导入的分组，则删除主分组
          const shouldDeleteGroup = group.children.length === 0 && 
            group.id !== TRASH_GROUP_ID && 
            (group.sourceShareId || subGroup.sourceShareId)
          
          if (shouldDeleteGroup) {
            if (this.activeGroupId === groupId) {
              const otherGroup = this.groups.find(g => g.id !== groupId && g.id !== TRASH_GROUP_ID)
              if (otherGroup) {
                this.activeGroupId = otherGroup.id
                this.activeSubGroupId = otherGroup.children[0]?.id || ''
              } else {
                const defaultGroup = this.groups.find(g => g.id === 'g-default')
                if (defaultGroup) {
                  this.activeGroupId = defaultGroup.id
                  this.activeSubGroupId = defaultGroup.children[0]?.id || ''
                }
              }
            }
            const groupIndex = this.groups.findIndex(g => g.id === groupId)
            if (groupIndex !== -1) {
              this.groups.splice(groupIndex, 1)
            }
          } else {
            if (group.children.length === 0) {
              const newSub = { id: uid(), name: '默认', bookmarkIds: [], createdAt: now, updatedAt: now }
              group.children.push(newSub)
              group.updatedAt = now
            }
            // 无论是否新建，都尝试选中第一个（如果之前选中的是被删除的）
            if (this.activeSubGroupId === subGroupId) {
              this.activeSubGroupId = group.children[0]?.id || ''
            }
          }
          return true
        }
      }
      return false
    },

    addGroup(name: string) {
      const now = Date.now()
      const group: Group = {
        id: uid(),
        name,
        createdAt: now,
        updatedAt: now,
        children: [
          {
            id: uid(),
            name: '子分组',
            bookmarkIds: [],
            createdAt: now,
            updatedAt: now
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
      const now = Date.now()
      const sub = { id: uid(), name, bookmarkIds: [], createdAt: now, updatedAt: now }
      group.children.push(sub)
      group.updatedAt = now
      this.activeSubGroupId = sub.id
      return sub
    },
    updateGroup(id: string, name: string) {
      const group = this.groups.find(g => g.id === id)
      if (group) {
        group.name = name
        group.updatedAt = Date.now()
      }
    },
    updateSubGroup(groupId: string, subId: string, name: string) {
      const group = this.groups.find(g => g.id === groupId)
      const sub = group?.children.find(c => c.id === subId)
      if (sub) {
        sub.name = name
        sub.updatedAt = Date.now()
        group!.updatedAt = Date.now()
      }
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
    addBookmark(payload: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>, locations: BookmarkLocation[]) {
      const now = Date.now()
      const bookmark: Bookmark = { 
        ...payload, 
        id: uid(), 
        locations,
        createdAt: now,
        updatedAt: now
      }
      this.bookmarks.push(bookmark)
      locations.forEach(loc => {
        const group = this.groups.find(g => g.id === loc.groupId)
        let sub = group?.children.find(c => c.id === loc.subGroupId)
        if (!sub && group) {
          const created = this.addSubGroup('子分组', group.id)
          if (created) sub = created
        }
        if (sub && !sub.bookmarkIds.includes(bookmark.id)) {
          sub.bookmarkIds.push(bookmark.id)
          sub.updatedAt = now
          group!.updatedAt = now
        }
      })
      return bookmark
    },
    updateBookmarkLocations(bookmarkId: string, newLocations: BookmarkLocation[]) {
      const now = Date.now()
      const newLocSet = new Set(newLocations.map(loc => `${loc.groupId}:${loc.subGroupId}`))
      
      this.groups.forEach(g => {
        let groupChanged = false
        g.children.forEach(sub => {
          const key = `${g.id}:${sub.id}`
          if (!newLocSet.has(key)) {
            const originalLen = sub.bookmarkIds.length
            sub.bookmarkIds = sub.bookmarkIds.filter(id => id !== bookmarkId)
            if (sub.bookmarkIds.length !== originalLen) {
              sub.updatedAt = now
              groupChanged = true
            }
          }
        })
        if (groupChanged) g.updatedAt = now
      })
      
      newLocations.forEach(loc => {
        const group = this.groups.find(g => g.id === loc.groupId)
        const sub = group?.children.find(c => c.id === loc.subGroupId)
        if (!sub) return
        if (!sub.bookmarkIds.includes(bookmarkId)) {
          sub.bookmarkIds.push(bookmarkId)
          sub.updatedAt = now
          group!.updatedAt = now
        }
      })
      
      const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
      if (bookmark) {
        bookmark.locations = newLocations
        bookmark.updatedAt = now
      }
    },
    updateBookmark(id: string, updater: Partial<Bookmark>) {
      const idx = this.bookmarks.findIndex(b => b.id === id)
      if (idx === -1) return
      
      const original = this.bookmarks[idx]
      const now = Date.now()
      const updated = { ...original, ...updater, updatedAt: now }
      this.bookmarks.splice(idx, 1, updated)
      
      if (updater.url && updater.url !== original.url && (!original.icon || original.icon.type === 'text')) {
        this.refreshSingleIcon(updated)
      }
    },
    removeBookmark(id: string) {
      const now = Date.now()
      const inTrash = this.getBookmarkLocations(id).some(loc => loc.groupId === TRASH_GROUP_ID)
      
      if (inTrash) {
        this.groups.forEach(g => {
          let groupChanged = false
          g.children.forEach(sub => {
            const originalLen = sub.bookmarkIds.length
            sub.bookmarkIds = sub.bookmarkIds.filter(bid => bid !== id)
            if (sub.bookmarkIds.length !== originalLen) {
              sub.updatedAt = now
              groupChanged = true
            }
          })
          if (groupChanged) g.updatedAt = now
        })
        this.bookmarks = this.bookmarks.filter(b => b.id !== id)
      } else {
        // 软删除预留：标记 isDeleted 并移入回收站
        const bookmark = this.bookmarks.find(b => b.id === id)
        if (bookmark) {
          bookmark.updatedAt = now
          // bookmark.isDeleted = true // 暂时不开启物理隐藏，先走回收站逻辑
          this.updateBookmarkLocations(id, [{ groupId: TRASH_GROUP_ID, subGroupId: 'sg-trash' }])
        }
      }
    },
    removeBookmarkFromLocation(id: string, groupId: string, subGroupId: string) {
      const locations = this.getBookmarkLocations(id)
      const remainingLocations = locations.filter(
        loc => !(loc.groupId === groupId && loc.subGroupId === subGroupId)
      )
      if (remainingLocations.length > 0) {
        this.updateBookmarkLocations(id, remainingLocations)
      } else {
        this.removeBookmark(id)
      }
    },
    restoreBookmark(id: string) {
      this.updateBookmarkLocations(id, [{ groupId: 'g-default', subGroupId: 'sg-default' }])
    },
    emptyTrash() {
      const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const trashSub = trashGroup?.children[0]
      if (!trashSub) return
      
      const now = Date.now()
      const idsToRemove = [...trashSub.bookmarkIds]
      idsToRemove.forEach(id => {
          trashSub.bookmarkIds = trashSub.bookmarkIds.filter(bid => bid !== id)
          this.bookmarks = this.bookmarks.filter(b => b.id !== id)
      })
      trashSub.updatedAt = now
      trashGroup!.updatedAt = now
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
      
      // 收集成功和失败的书签信息
      const successList: string[] = []
      const failList: { id: string; title: string }[] = []
      
      missing.forEach(bookmark => {
        if (result.has(bookmark.id)) {
          successList.push(bookmark.title || bookmark.url)
        } else {
          failList.push({ id: bookmark.id, title: bookmark.title || bookmark.url })
        }
      })
      
      return {
        total: missing.length,
        matched: result.size,
        remaining: this.bookmarks.filter(b => !b.icon || b.icon.type === 'text').length,
        successList,
        failList
      }
    },
    assignIcon(id: string, icon: IconSource) {
      const idx = this.bookmarks.findIndex(b => b.id === id)
      if (idx !== -1) {
        this.bookmarks.splice(idx, 1, { ...this.bookmarks[idx], icon, updatedAt: Date.now() })
      }
    },
    detachGroupFromShare(groupId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (group) {
        delete group.sourceShareId
        delete group.lastSyncedAt
        group.updatedAt = Date.now()
        group.children.forEach(sub => {
          delete sub.sourceShareId
          delete sub.lastSyncedAt
          sub.updatedAt = Date.now()
        })
      }
    },
    detachSubGroupFromShare(groupId: string, subGroupId: string) {
      const group = this.groups.find(g => g.id === groupId)
      const sub = group?.children.find(c => c.id === subGroupId)
      if (sub) {
        delete sub.sourceShareId
        delete sub.lastSyncedAt
        sub.updatedAt = Date.now()
        group!.updatedAt = Date.now()

        // 检查主分组是否还有其他子分组关联分享
        // 如果没有了，也移除主分组的 sourceShareId
        if (group?.sourceShareId) {
          const hasSharedChildren = group.children.some(c => !!c.sourceShareId)
          if (!hasSharedChildren) {
             delete group.sourceShareId
             delete group.lastSyncedAt
          }
        }
      }
    },
    removeGroup(id: string) {
      const idx = this.groups.findIndex(g => g.id === id)
      if (idx === -1) return false
      const group = this.groups[idx]
      const now = Date.now()
      
      // 1. 收集需要移动到回收站的书签 ID
      const toTrash: string[] = []
      group.children.forEach(sub => {
        sub.bookmarkIds.forEach(bid => {
          const bookmark = this.bookmarks.find(b => b.id === bid)
          if (bookmark) {
            // 移除当前分组的位置
            bookmark.locations = bookmark.locations?.filter(loc => loc.groupId !== id) || []
            // 如果书签没有其他位置了，标记为需要移动到回收站
            if (bookmark.locations.length === 0) {
              bookmark.updatedAt = now
              toTrash.push(bid)
            }
          }
        })
      })
      
      // 2. 删除分组
      this.groups.splice(idx, 1)
      
      // 3. 将收集的书签添加到回收站（去重）
      let trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      // 确保回收站分组存在
      if (!trashGroup) {
        trashGroup = {
          id: TRASH_GROUP_ID,
          name: '回收站',
          createdAt: now,
          updatedAt: now,
          children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }]
        }
        this.groups.push(trashGroup)
      }
      // 确保回收站有子分组
      if (trashGroup.children.length === 0) {
        trashGroup.children.push({ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now })
      }
      const trashSub = trashGroup.children[0]
      
      toTrash.forEach(bid => {
        // 去重：只有不在回收站中才添加
        if (!trashSub.bookmarkIds.includes(bid)) {
          trashSub.bookmarkIds.push(bid)
        }
        // 更新书签的 locations
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark) {
          bookmark.locations = [{ groupId: TRASH_GROUP_ID, subGroupId: trashSub.id }]
        }
      })
      if (toTrash.length > 0) {
        trashSub.updatedAt = now
        trashGroup.updatedAt = now
      }
      
      // 4. 更新 activeGroupId
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
      const sub = group.children[idx]
      const now = Date.now()
      
      // 1. 收集需要移动到回收站的书签
      const toTrash: string[] = []
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark) {
          bookmark.locations = bookmark.locations?.filter(loc => 
            !(loc.groupId === groupId && loc.subGroupId === subId)
          ) || []
          if (bookmark.locations.length === 0) {
            bookmark.updatedAt = now
            toTrash.push(bid)
          }
        }
      })
      
      // 2. 删除子分组
      group.children.splice(idx, 1)
      group.updatedAt = now
      
      // 3. 将书签添加到回收站（去重）
      let trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      if (!trashGroup) {
        trashGroup = {
          id: TRASH_GROUP_ID,
          name: '回收站',
          createdAt: now,
          updatedAt: now,
          children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }]
        }
        this.groups.push(trashGroup)
      }
      if (trashGroup.children.length === 0) {
        trashGroup.children.push({ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now })
      }
      const trashSub = trashGroup.children[0]
      
      if (toTrash.length > 0) {
        toTrash.forEach(bid => {
          if (!trashSub.bookmarkIds.includes(bid)) {
            trashSub.bookmarkIds.push(bid)
          }
          const bookmark = this.bookmarks.find(b => b.id === bid)
          if (bookmark) {
            bookmark.locations = [{ groupId: TRASH_GROUP_ID, subGroupId: trashSub.id }]
          }
        })
        trashSub.updatedAt = now
        trashGroup.updatedAt = now
      }
      
      if (group.children.length === 0) {
        const newSub = { id: uid(), name: '默认', bookmarkIds: [], createdAt: now, updatedAt: now }
        group.children.push(newSub)
        group.updatedAt = now
      }

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
      sub.updatedAt = Date.now()
      group!.updatedAt = Date.now()
    },
    moveBookmarkToSubGroup(bookmarkId: string, fromGroupId: string, fromSubId: string, toGroupId: string, toSubId: string) {
      if (fromGroupId === toGroupId && fromSubId === toSubId) return false
      const fromGroup = this.groups.find(g => g.id === fromGroupId)
      const fromSub = fromGroup?.children.find(c => c.id === fromSubId)
      const toGroup = this.groups.find(g => g.id === toGroupId)
      const toSub = toGroup?.children.find(c => c.id === toSubId)
      if (!fromSub || !toSub) return false
      if (!fromSub.bookmarkIds.includes(bookmarkId)) return false
      const now = Date.now()
      fromSub.bookmarkIds = fromSub.bookmarkIds.filter(id => id !== bookmarkId)
      fromSub.updatedAt = now
      fromGroup!.updatedAt = now
      if (!toSub.bookmarkIds.includes(bookmarkId)) {
        toSub.bookmarkIds.push(bookmarkId)
        toSub.updatedAt = now
        toGroup!.updatedAt = now
      }
      const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
      if (bookmark?.locations) {
        bookmark.locations = bookmark.locations.filter(
          loc => !(loc.groupId === fromGroupId && loc.subGroupId === fromSubId)
        )
        if (!bookmark.locations.some(loc => loc.groupId === toGroupId && loc.subGroupId === toSubId)) {
          bookmark.locations.push({ groupId: toGroupId, subGroupId: toSubId })
        }
        bookmark.updatedAt = now
      }
      return true
    },
    reorderGroups(newOrder: Group[]) {
      const trash = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const filtered = newOrder.filter(g => g.id !== TRASH_GROUP_ID)
      this.groups = trash ? [...filtered, trash] : filtered
      // Reordering groups also counts as updating the overall state
    },
    reorderSubGroups(groupId: string, newChildren: Group['children']) {
      const group = this.groups.find(g => g.id === groupId)
      if (group) {
        group.children = newChildren
        group.updatedAt = Date.now()
      }
    },
    moveSubToGroup(sourceGroupId: string, subId: string, targetGroupId: string) {
      const sourceGroup = this.groups.find(g => g.id === sourceGroupId)
      const targetGroup = this.groups.find(g => g.id === targetGroupId)
      if (!sourceGroup || !targetGroup) return false
      const subIdx = sourceGroup.children.findIndex(c => c.id === subId)
      if (subIdx === -1) return false
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      targetGroup.children.push(sub)
      const now = Date.now()
      sourceGroup.updatedAt = now
      targetGroup.updatedAt = now
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark?.locations) {
          bookmark.locations = bookmark.locations.map(loc => 
            loc.groupId === sourceGroupId && loc.subGroupId === subId
              ? { ...loc, groupId: targetGroupId }
              : loc
          )
          bookmark.updatedAt = now
        }
      })
      if (sourceGroup.children.length === 0) {
        sourceGroup.children.push({ id: uid(), name: '子分组', bookmarkIds: [], createdAt: now, updatedAt: now })
      }
      return true
    },
    promoteSubToGroup(sourceGroupId: string, subId: string) {
      const sourceGroup = this.groups.find(g => g.id === sourceGroupId)
      if (!sourceGroup) return null
      const subIdx = sourceGroup.children.findIndex(c => c.id === subId)
      if (subIdx === -1) return null
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      const now = Date.now()
      const newGroup: Group = {
        id: uid(),
        name: sub.name,
        createdAt: now,
        updatedAt: now,
        children: [{ id: sub.id, name: '默认', bookmarkIds: sub.bookmarkIds, createdAt: sub.createdAt, updatedAt: now }]
      }
      const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) this.groups.splice(trashIdx, 0, newGroup)
      else this.groups.push(newGroup)
      sourceGroup.updatedAt = now
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        if (bookmark?.locations) {
          bookmark.locations = bookmark.locations.map(loc =>
            loc.groupId === sourceGroupId && loc.subGroupId === subId
              ? { groupId: newGroup.id, subGroupId: sub.id }
              : loc
          )
          bookmark.updatedAt = now
        }
      })
      if (sourceGroup.children.length === 0) {
        sourceGroup.children.push({ id: uid(), name: '子分组', bookmarkIds: [], createdAt: now, updatedAt: now })
      }
      this.activeGroupId = newGroup.id
      this.activeSubGroupId = sub.id
      return newGroup
    },
    loadFromSnapshot(data: { groups: Group[]; bookmarks: Bookmark[] }, readOnly = false) {
      this.groups = data.groups
      this.bookmarks = data.bookmarks
      this.isReadOnly = readOnly
      this.activeGroupId = this.groups[0]?.id ?? ''
      this.activeSubGroupId = this.groups[0]?.children[0]?.id ?? ''
    },
    mergeFromShare(data: { groups: Group[]; bookmarks: Bookmark[] }, shareId: string): Group | null {
      if (!data.groups.length) return null
      const now = Date.now()
      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: [] as BookmarkLocation[],
        createdAt: now,
        updatedAt: now
      }))
      const sourceGroup = data.groups[0]
      const newGroupId = uid()
      const newSubGroups = sourceGroup.children.map(sub => {
        const newSubId = uid()
        return {
          id: newSubId,
          name: sub.name,
          bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId) || oldId),
          sourceShareId: shareId,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now
        }
      })
      const newGroup: Group = {
        id: newGroupId,
        name: sourceGroup.name || '来自分享',
        children: newSubGroups,
        sourceShareId: shareId,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now
      }
      newBookmarks.forEach(b => {
        b.locations = newSubGroups
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: newGroupId, subGroupId: sub.id }))
      })
      let finalName = newGroup.name
      let suffix = 1
      while (this.groups.some(g => g.name === finalName && g.id !== TRASH_GROUP_ID)) {
        finalName = `${sourceGroup.name || '来自分享'} (${suffix++})`
      }
      newGroup.name = finalName
      const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) this.groups.splice(trashIdx, 0, newGroup)
      else this.groups.push(newGroup)
      this.bookmarks.push(...newBookmarks)
      this.isReadOnly = false
      return newGroup
    },
    importToExistingGroup(data: { groups: Group[]; bookmarks: Bookmark[] }, targetGroupId: string, shareId: string): boolean {
      if (!data.groups.length) return false
      const targetGroup = this.groups.find(g => g.id === targetGroupId)
      if (!targetGroup) return false
      const now = Date.now()
      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: [],
        createdAt: now,
        updatedAt: now
      }))
      const sourceGroup = data.groups[0]
      const addedSubGroups: any[] = []
      sourceGroup.children.forEach(sub => {
        const existingSub = targetGroup.children.find(c => c.name === sub.name && c.sourceShareId === shareId)
        if (existingSub) {
          const oldBookmarkIds = new Set(existingSub.bookmarkIds)
          this.bookmarks = this.bookmarks.filter(b => {
            if (!oldBookmarkIds.has(b.id)) return true
            return b.locations?.some(loc => !(loc.groupId === targetGroupId && loc.subGroupId === existingSub.id))
          })
          existingSub.bookmarkIds = sub.bookmarkIds.map(oldId => idMap.get(oldId)!)
          existingSub.lastSyncedAt = now
          existingSub.updatedAt = now
          newBookmarks.forEach(b => {
            if (existingSub.bookmarkIds.includes(b.id)) {
              b.locations = b.locations || []
              b.locations.push({ groupId: targetGroupId, subGroupId: existingSub.id })
            }
          })
        } else {
          const newSubId = uid()
          const newSub = {
            id: newSubId,
            name: sub.name,
            bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId)!),
            sourceShareId: shareId,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now
          }
          addedSubGroups.push(newSub)
          newBookmarks.forEach(b => {
            if (newSub.bookmarkIds.includes(b.id)) {
              b.locations = b.locations || []
              b.locations.push({ groupId: targetGroupId, subGroupId: newSubId })
            }
          })
        }
      })
      targetGroup.children.push(...addedSubGroups)
      targetGroup.updatedAt = now
      const existingBookmarkIds = new Set(this.bookmarks.map(b => b.id))
      const trulyNewBookmarks = newBookmarks.filter(b => !existingBookmarkIds.has(b.id))
      this.bookmarks.push(...trulyNewBookmarks)
      this.activeGroupId = targetGroupId
      this.activeSubGroupId = addedSubGroups[0]?.id || targetGroup.children[0]?.id || ''
      return true
    },
    findGroupBySourceShareId(shareId: string): Group | null {
      return this.groups.find(g => g.sourceShareId === shareId) || null
    },
    findGroupByName(name: string): Group | null {
      return this.groups.find(g => g.name === name && g.id !== TRASH_GROUP_ID) || null
    },
    setShareId(type: 'subGroup' | 'group', groupId: string, subGroupId: string | undefined, shareId: string) {
      if (type === 'group') {
        const group = this.groups.find(g => g.id === groupId)
        if (group) { group.shareId = shareId; group.updatedAt = Date.now(); }
      } else if (subGroupId) {
        const group = this.groups.find(g => g.id === groupId)
        const sub = group?.children.find(c => c.id === subGroupId)
        if (sub) { sub.shareId = shareId; sub.updatedAt = Date.now(); group!.updatedAt = Date.now(); }
      }
    },
    clearShareId(type: 'subGroup' | 'group', groupId: string, subGroupId?: string) {
      if (type === 'group') {
        const group = this.groups.find(g => g.id === groupId)
        if (group) { delete group.shareId; group.updatedAt = Date.now(); }
      } else if (subGroupId) {
        const group = this.groups.find(g => g.id === groupId)
        const sub = group?.children.find(c => c.id === subGroupId)
        if (sub) { delete sub.shareId; sub.updatedAt = Date.now(); group!.updatedAt = Date.now(); }
      }
    },
    getShareId(type: 'subGroup' | 'group', groupId: string, subGroupId?: string): string | undefined {
      if (type === 'group') return this.groups.find(g => g.id === groupId)?.shareId
      const group = this.groups.find(g => g.id === groupId)
      return group?.children.find(c => c.id === subGroupId)?.shareId
    },
    importFromShare(data: { groups: Group[]; bookmarks: Bookmark[] }, shareId: string, shareName?: string): Group | null {
      if (!data.groups.length) return null
      const now = Date.now()
      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      const newBookmarks = data.bookmarks.map(b => {
        const newId = idMap.get(b.id)!
        return { ...b, id: newId, createdAt: now, updatedAt: now, locations: [] as BookmarkLocation[] }
      })
      const sourceGroup = data.groups[0]
      const newGroupId = uid()
      const newSubGroups = sourceGroup.children.map(sub => {
        const newSubId = uid()
        return {
          id: newSubId,
          name: sub.name,
          bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId) || oldId),
          sourceShareId: shareId,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now
        }
      })
      const newGroup: Group = {
        id: newGroupId,
        name: shareName || sourceGroup.name || '来自分享',
        children: newSubGroups,
        sourceShareId: shareId,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now
      }
      newBookmarks.forEach(b => {
        b.locations = newSubGroups
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: newGroupId, subGroupId: sub.id }))
      })
      const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
      if (trashIdx !== -1) this.groups.splice(trashIdx, 0, newGroup)
      else this.groups.push(newGroup)
      this.bookmarks.push(...newBookmarks)
      this.activeGroupId = newGroup.id
      this.activeSubGroupId = newGroup.children[0]?.id || ''
      return newGroup
    },
    importFromShareSmart(data: { groups: Group[]; bookmarks: Bookmark[] }, shareId: string, shareName?: string): { 
      success: boolean; 
      conflict?: boolean; 
      alreadyImported?: boolean;
      group?: Group; 
      merged?: boolean;
      sourceGroup?: Group;
    } | null {
      if (!data.groups.length) return null
      const sourceGroup = data.groups[0]
      const targetGroupName = shareName || sourceGroup.name || '来分来享'
      const existingGroup = this.findGroupByName(targetGroupName)
      const now = Date.now()

      // 1. 如果已有关联相同 shareId 的在线分组，提示已导入
      const groupWithSameShareId = this.findGroupBySourceShareId(shareId)
      if (groupWithSameShareId && groupWithSameShareId.sourceShareId === shareId) {
        return { success: false, alreadyImported: true, group: groupWithSameShareId }
      }

      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: [],
        createdAt: now,
        updatedAt: now
      }))

      if (existingGroup) {
        // 检查是否存在同名且来自不同分享（或本地）的冲突
        // 如果是本地分组（没有 sourceShareId），或者 sourceShareId 不同，都视为冲突
        const isConflict = !existingGroup.sourceShareId || existingGroup.sourceShareId !== shareId
        
        if (isConflict) {
          return { success: false, conflict: true, group: existingGroup, sourceGroup }
        }

        const addedSubGroups: any[] = []
        const updatedSubGroups: any[] = []
        
        sourceGroup.children.forEach(sub => {
          const existingSub = existingGroup.children.find(c => c.name === sub.name && (c.sourceShareId === shareId || !c.sourceShareId))
          
          if (existingSub && existingSub.sourceShareId === shareId) {
            // 更新已关联的子分组
            const oldBookmarkIds = new Set(existingSub.bookmarkIds)
            this.bookmarks = this.bookmarks.filter(b => {
              if (!oldBookmarkIds.has(b.id)) return true
              return b.locations?.some(loc => !(loc.groupId === existingGroup.id && loc.subGroupId === existingSub.id))
            })
            existingSub.bookmarkIds = sub.bookmarkIds.map(oldId => idMap.get(oldId)!).filter(id => !!id)
            existingSub.lastSyncedAt = now
            existingSub.updatedAt = now
            updatedSubGroups.push({ id: existingSub.id, name: existingSub.name })
            newBookmarks.forEach(b => {
              if (existingSub.bookmarkIds.includes(b.id)) {
                b.locations = b.locations || []
                b.locations.push({ groupId: existingGroup.id, subGroupId: existingSub.id })
              }
            })
          } else {
            // 新增子分组
            const newSubId = uid()
            const newSub = {
              id: newSubId,
              name: sub.name,
              bookmarkIds: sub.bookmarkIds.map(oldId => idMap.get(oldId)!).filter(id => !!id),
              sourceShareId: shareId,
              lastSyncedAt: now,
              createdAt: now,
              updatedAt: now
            }
            addedSubGroups.push(newSub)
            newBookmarks.forEach(b => {
              if (newSub.bookmarkIds.includes(b.id)) {
                b.locations = b.locations || []
                b.locations.push({ groupId: existingGroup.id, subGroupId: newSubId })
              }
            })
          }
        })
        
        existingGroup.children.push(...addedSubGroups)
        existingGroup.updatedAt = now
        const existingBookmarkIds = new Set(this.bookmarks.map(b => b.id))
        this.bookmarks.push(...newBookmarks.filter(b => !existingBookmarkIds.has(b.id)))
        this.activeGroupId = existingGroup.id
        this.activeSubGroupId = addedSubGroups[0]?.id || updatedSubGroups[0]?.id || existingGroup.children[0]?.id || ''
        return { success: true, group: existingGroup, merged: true }
      }

      const newGroup = this.importFromShare(data, shareId, shareName)
      return newGroup ? { success: true, group: newGroup, merged: false } : null
    },
    forceImportToGroup(groupId: string, data: { groups: Group[]; bookmarks: Bookmark[] }, shareId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group) return false

      // 1. 强行关联 ShareId
      group.sourceShareId = shareId
      group.updatedAt = Date.now()

      // 2. 调用更新逻辑覆盖本地数据
      return this.updateFromShare(groupId, data)
    },
    updateSubGroupFromShare(groupId: string, subGroupId: string, sourceShareId: string, data: { groups: Group[]; bookmarks: Bookmark[] }) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group) return false
      const subIdx = group.children.findIndex(c => c.id === subGroupId)
      if (subIdx === -1) return false
      const subGroup = group.children[subIdx]
      if (subGroup.sourceShareId !== sourceShareId) return false
      const now = Date.now()
      const srcSub = data.groups[0]?.children[0]
      if (!srcSub) return false
      const oldBookmarkIds = new Set(subGroup.bookmarkIds)
      const oldBookmarks = this.bookmarks.filter(b => oldBookmarkIds.has(b.id))
      const oldUrls = new Set(oldBookmarks.map(b => b.url))
      const newUrls = new Set(data.bookmarks.map(b => b.url))
      const addedUrls = [...newUrls].filter(url => !oldUrls.has(url))
      const removedUrls = [...oldUrls].filter(url => !newUrls.has(url))
      this.bookmarks = this.bookmarks.filter(b => {
        if (!oldBookmarkIds.has(b.id)) return true
        return b.locations?.some(loc => !(loc.groupId === groupId && loc.subGroupId === subGroupId))
      })
      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        locations: [{ groupId, subGroupId }],
        createdAt: now,
        updatedAt: now
      }))
      subGroup.name = srcSub.name
      subGroup.bookmarkIds = srcSub.bookmarkIds.map(oldId => idMap.get(oldId)!).filter(id => !!id)
      subGroup.lastSyncedAt = now
      subGroup.updatedAt = now
      group.updatedAt = now
      this.bookmarks.push(...newBookmarks)
      return { success: true, added: addedUrls.length, removed: removedUrls.length, addedItems: [], removedItems: [] }
    },
    updateFromShare(groupId: string, data: { groups: Group[]; bookmarks: Bookmark[] }) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group || !group.sourceShareId) return false
      const now = Date.now()
      const sourceGroup = data.groups[0]
      if (!sourceGroup) return false
      const oldBookmarkIds = new Set<string>()
      group.children.forEach(sub => sub.bookmarkIds.forEach(id => oldBookmarkIds.add(id)))
      const oldBookmarks = this.bookmarks.filter(b => oldBookmarkIds.has(b.id))
      const oldUrls = new Set(oldBookmarks.map(b => b.url))
      const newUrls = new Set(data.bookmarks.map(b => b.url))
      const addedUrls = [...newUrls].filter(url => !oldUrls.has(url))
      const removedUrls = [...oldUrls].filter(url => !newUrls.has(url))
      this.bookmarks = this.bookmarks.filter(b => !oldBookmarkIds.has(b.id))
      const idMap = new Map<string, string>()
      data.bookmarks.forEach(b => idMap.set(b.id, uid()))
      const newBookmarks: Bookmark[] = data.bookmarks.map(b => ({
        ...b,
        id: idMap.get(b.id)!,
        createdAt: now,
        updatedAt: now,
        locations: []
      }))
      group.children = sourceGroup.children.map(srcSub => {
        const existingSub = group.children.find(c => c.name === srcSub.name)
        return {
          id: existingSub ? existingSub.id : uid(),
          name: srcSub.name,
          bookmarkIds: srcSub.bookmarkIds.map(oldId => idMap.get(oldId)!).filter(id => !!id),
          sourceShareId: group.sourceShareId,
          lastSyncedAt: now,
          createdAt: existingSub ? existingSub.createdAt : now,
          updatedAt: now
        }
      })
      group.name = sourceGroup.name || group.name
      group.lastSyncedAt = now
      group.updatedAt = now
      newBookmarks.forEach(b => {
        b.locations = group.children
          .filter(sub => sub.bookmarkIds.includes(b.id))
          .map(sub => ({ groupId: group.id, subGroupId: sub.id }))
      })
      this.bookmarks.push(...newBookmarks)
      return { success: true, added: addedUrls.length, removed: removedUrls.length, addedItems: [], removedItems: [] }
    }
  },
  persist: {
    storage: utoolsStorage,
  },
})
