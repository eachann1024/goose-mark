import PinyinMatch from 'pinyin-match'
import type { Bookmark, Group, IconSource, BookmarkLocation, SubGroup } from '@/types/bookmark'
import { bulkMatchMissing, ensureIconForBookmark } from '@/services/iconCache'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { useSync } from '@/composables/useSync'
import { useSettingsStore } from '@/stores/settings'
import { trackEvent } from '@/services/analytics'

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)

// 从 URL 中解析参数（保留用于其他用途）
export const parseUrlParams = (input: string): Record<string, string> => {
  if (!input) return {}
  try {
    const url = new URL(input)
    const params: Record<string, string> = {}
    for (const [key, value] of url.searchParams) {
      params[key] = value
    }
    return params
  } catch {
    return {}
  }
}

export const TRASH_GROUP_ID = 'g-trash'

const createSeedGroups = (): Group[] => {
  const now = Date.now()
  return [
    {
      id: 'g-nav',
      name: '导航',
      createdAt: now,
      updatedAt: now,
      children: [
        {
          id: 'sg-nav-common',
          name: '常用网站',
          bookmarkIds: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'sg-nav-tools',
          name: '实用工具',
          bookmarkIds: [],
          createdAt: now,
          updatedAt: now
        }
      ]
    },
    {
      id: 'g-ai',
      name: 'AI 工具',
      createdAt: now,
      updatedAt: now,
      children: [
        {
          id: 'sg-ai-chat',
          name: '对话 AI',
          bookmarkIds: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'sg-ai-create',
          name: '创作 AI',
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
}

export const useBookmarkStore = defineStore('bookmark', {
  state: () => {
    const now = Date.now()
    const groups = createSeedGroups()
    const bookmarks: Bookmark[] = []

    const addSeedBookmark = (title: string, url: string, groupId: string, subGroupId: string, tags: string[] = []) => {
      const id = uid()
      bookmarks.push({
        id, title, url, desc: '', tags,
        locations: [{ groupId, subGroupId }],
        createdAt: now, updatedAt: now
      })
      return id
    }

    const findSub = (groupId: string, subId: string) => {
      const g = groups.find(gr => gr.id === groupId)
      return g?.children.find(c => c.id === subId)
    }

    // 导航 - 常用网站
    const navCommon = findSub('g-nav', 'sg-nav-common')
    if (navCommon) {
      ;[
        { t: '百度', u: 'https://www.baidu.com' },
        { t: 'Google', u: 'https://www.google.com' },
        { t: '淘宝', u: 'https://www.taobao.com' },
        { t: '京东', u: 'https://www.jd.com' },
        { t: '微信网页版', u: 'https://wx.qq.com' },
        { t: '12306', u: 'https://www.12306.cn' },
        { t: '百度网盘', u: 'https://pan.baidu.com' },
        { t: '高德地图', u: 'https://ditu.amap.com' },
        { t: '百度地图', u: 'https://map.baidu.com' },
        { t: '知乎', u: 'https://www.zhihu.com' },
        { t: 'B站', u: 'https://www.bilibili.com' },
        { t: '豆瓣', u: 'https://www.douban.com' },
        { t: '微博', u: 'https://weibo.com' },
        { t: '今日头条', u: 'https://www.toutiao.com' },
        { t: '腾讯新闻', u: 'https://news.qq.com' },
      ].forEach(b => navCommon.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-nav', 'sg-nav-common', ['导航'])))
    }

    // 导航 - 实用工具
    const navTools = findSub('g-nav', 'sg-nav-tools')
    if (navTools) {
      ;[
        { t: '查快递', u: 'https://www.kuaidi100.com' },
        { t: '天气查询', u: 'https://tianqi.baidu.com' },
        { t: '携程旅行', u: 'https://www.ctrip.com' },
        { t: '去哪儿', u: 'https://www.qunar.com' },
        { t: '马蜂窝', u: 'https://www.mafengwo.cn' },
        { t: '飞猪', u: 'https://www.fliggy.com' },
        { t: '同程', u: 'https://www.ly.com' },
        { t: '途牛', u: 'https://www.tuniu.com' },
        { t: '穷游', u: 'https://www.qyer.com' },
        { t: '默沙东诊疗手册', u: 'https://www.msdmanuals.cn' },
        { t: '时光邮局', u: 'https://www.timepost.cn' },
        { t: '国家企业信用信息公示', u: 'https://www.gsxt.gov.cn' },
        { t: 'BOSS直聘', u: 'https://www.zhipin.com' },
        { t: '拉勾网', u: 'https://www.lagou.com' },
        { t: '前程无忧', u: 'https://www.51job.com' },
      ].forEach(b => navTools.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-nav', 'sg-nav-tools', ['工具'])))
    }

    // AI - 对话 AI
    const aiChat = findSub('g-ai', 'sg-ai-chat')
    if (aiChat) {
      ;[
        { t: 'ChatGPT', u: 'https://chatgpt.com' },
        { t: 'Claude', u: 'https://claude.ai' },
        { t: 'Google Gemini', u: 'https://gemini.google.com' },
        { t: 'Perplexity', u: 'https://www.perplexity.ai' },
        { t: 'DeepSeek', u: 'https://chat.deepseek.com' },
        { t: 'Kimi', u: 'https://www.kimi.com' },
        { t: '通义千问', u: 'https://tongyi.aliyun.com' },
        { t: '文心一言', u: 'https://yiyan.baidu.com' },
        { t: '天工 AI', u: 'https://www.tiangong.cn' },
        { t: 'Hugging Face', u: 'https://huggingface.co' },
      ].forEach(b => aiChat.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-ai', 'sg-ai-chat', ['AI'])))
    }

    // AI - 创作 AI
    const aiCreate = findSub('g-ai', 'sg-ai-create')
    if (aiCreate) {
      ;[
        { t: 'Midjourney', u: 'https://www.midjourney.com' },
        { t: 'Stable Diffusion', u: 'https://stability.ai' },
        { t: 'DALL-E', u: 'https://openai.com/dall-e-3' },
        { t: 'Runway', u: 'https://runwayml.com' },
        { t: 'Sora', u: 'https://openai.com/sora' },
        { t: 'Gamma', u: 'https://gamma.app' },
        { t: 'Poe', u: 'https://poe.com' },
        { t: 'Cursor', u: 'https://cursor.sh' },
        { t: 'GitHub Copilot', u: 'https://github.com/features/copilot' },
        { t: 'Notion AI', u: 'https://www.notion.so/product/ai' },
      ].forEach(b => aiCreate.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-ai', 'sg-ai-create', ['AI', '创作'])))
    }

    return {
      groups,
      bookmarks,
      search: '',
      activeGroupId: 'g-nav',
      activeSubGroupId: 'sg-nav-common',
      isReadOnly: false
    }
  },
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

      const pool: Bookmark[] = []

      if (this.activeGroupId === TRASH_GROUP_ID) {
        // Trash mode: show only trash bookmarks
        const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
        trashGroup?.children.forEach(sub => {
          sub.bookmarkIds.forEach(id => {
            const bm = this.bookmarks.find(b => b.id === id)
            if (bm && !bm.isDeleted) {
              pool.push(bm)
            }
          })
        })
      } else {
        // Normal mode: show all non-trash bookmarks, preserving sub-group order
        this.groups.forEach(group => {
          if (group.id === TRASH_GROUP_ID) return
          group.children.forEach(sub => {
            sub.bookmarkIds.forEach(id => {
              const bm = this.bookmarks.find(b => b.id === id)
              if (bm && !bm.isDeleted) {
                pool.push(bm)
              }
            })
          })
        })
      }

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
        this.ensureValidSelection()
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
              const oldLocations = bookmark.locations ? [...bookmark.locations] : []
              bookmark.locations = bookmark.locations?.filter(loc => 
                !(loc.groupId === groupId && loc.subGroupId === subGroupId)
              ) || []
              
              if (bookmark.locations.length === 0) {
                // 记录移入回收站前的位置
                if (oldLocations.length > 0) {
                  bookmark.prevLocations = oldLocations
                }
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
          
          // 4. 如果删除子分组后，主分组没有子分组了，则删除主分组
          const shouldDeleteGroup = group.children.length === 0 &&
            group.id !== TRASH_GROUP_ID
          
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
          // 强制立即持久化
          ;(this as any).$persist?.()
          return true
        }
      }
      return false
    },

    getShareIdsFromLocations(locations: BookmarkLocation[] = []) {
      const shareIds = new Set<string>()

      locations.forEach(loc => {
        const group = this.groups.find(g => g.id === loc.groupId) as (Group & { shareId?: string; sourceShareId?: string }) | undefined
        if (!group) return

        if (group.shareId) shareIds.add(group.shareId)
        if (group.sourceShareId) shareIds.add(group.sourceShareId)

        const sub = group.children.find(c => c.id === loc.subGroupId) as (SubGroup & { shareId?: string; sourceShareId?: string }) | undefined
        if (!sub) return

        if (sub.shareId) shareIds.add(sub.shareId)
        if (sub.sourceShareId) shareIds.add(sub.sourceShareId)
      })

      return Array.from(shareIds)
    },

    getShareIdsFromSubGroup(groupId: string, subId: string) {
      const group = this.groups.find(g => g.id === groupId) as (Group & { shareId?: string; sourceShareId?: string }) | undefined
      if (!group) return []

      const sub = group.children.find(c => c.id === subId) as (SubGroup & { shareId?: string; sourceShareId?: string }) | undefined
      const shareIds = new Set<string>()

      if (group.shareId) shareIds.add(group.shareId)
      if (group.sourceShareId) shareIds.add(group.sourceShareId)
      if (sub?.shareId) shareIds.add(sub.shareId)
      if (sub?.sourceShareId) shareIds.add(sub.sourceShareId)

      return Array.from(shareIds)
    },

    getShareIdsFromGroup(groupId: string) {
      const group = this.groups.find(g => g.id === groupId) as (Group & { shareId?: string; sourceShareId?: string }) | undefined
      if (!group) return []

      const shareIds = new Set<string>()
      if (group.shareId) shareIds.add(group.shareId)
      if (group.sourceShareId) shareIds.add(group.sourceShareId)

      group.children.forEach(child => {
        const sub = child as SubGroup & { shareId?: string; sourceShareId?: string }
        if (sub.shareId) shareIds.add(sub.shareId)
        if (sub.sourceShareId) shareIds.add(sub.sourceShareId)
      })

      return Array.from(shareIds)
    },

    scheduleBookmarkSync(bookmarkId: string, options?: { isDeleted?: boolean; updatedAt?: number; previousShareIds?: string[]; content?: Bookmark | null }) {
      const now = options?.updatedAt || Date.now()
      const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
      const { schedulePush } = useSync()
      const isDeleted = !!options?.isDeleted
      const content = options?.content ?? bookmark ?? null

      if (!isDeleted && !content) return

      schedulePush({
        itemId: bookmarkId,
        itemType: 'bookmark',
        content,
        isDeleted,
        updatedAt: now
      }, {
        previousShareIds: options?.previousShareIds
      })
    },

    scheduleGroupSync(groupId: string, options?: { isDeleted?: boolean; updatedAt?: number; previousShareIds?: string[]; orderIndex?: number }) {
      const now = options?.updatedAt || Date.now()
      const group = this.groups.find(g => g.id === groupId)
      const { schedulePush } = useSync()

      if (options?.isDeleted) {
        schedulePush({
          itemId: groupId,
          itemType: 'group',
          content: null,
          isDeleted: true,
          updatedAt: now
        }, {
          previousShareIds: options?.previousShareIds
        })
        return
      }

      if (!group) return

      const content = JSON.parse(JSON.stringify(group)) as Group & { orderIndex?: number }
      if (typeof options?.orderIndex === 'number') {
        content.orderIndex = options.orderIndex
      }

      schedulePush({
        itemId: group.id,
        itemType: 'group',
        content,
        isDeleted: false,
        updatedAt: now
      }, {
        previousShareIds: options?.previousShareIds
      })
    },

    scheduleSubGroupSync(groupId: string, subId: string, options?: { isDeleted?: boolean; updatedAt?: number; previousShareIds?: string[] }) {
      const now = options?.updatedAt || Date.now()
      const group = this.groups.find(g => g.id === groupId)
      const sub = group?.children.find(c => c.id === subId)
      const { schedulePush } = useSync()

      if (options?.isDeleted) {
        schedulePush({
          itemId: subId,
          itemType: 'subGroup',
          content: null,
          isDeleted: true,
          updatedAt: now
        }, {
          previousShareIds: options?.previousShareIds
        })
        return
      }

      if (!group || !sub) return

      schedulePush({
        itemId: sub.id,
        itemType: 'subGroup',
        content: {
          ...JSON.parse(JSON.stringify(sub)),
          parentGroupId: group.id
        },
        isDeleted: false,
        updatedAt: now
      }, {
        previousShareIds: options?.previousShareIds
      })
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
      this.scheduleGroupSync(group.id, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === group.id) })
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
      this.scheduleSubGroupSync(groupId, sub.id, { updatedAt: now })
      this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })
      return sub
    },
    updateGroup(id: string, name: string) {
      const group = this.groups.find(g => g.id === id)
      if (group) {
        const now = Date.now()
        group.name = name
        group.updatedAt = now
        this.scheduleGroupSync(id, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === id) })
      }
    },
    updateSubGroup(groupId: string, subId: string, name: string) {
      const group = this.groups.find(g => g.id === groupId)
      const sub = group?.children.find(c => c.id === subId)
      if (sub) {
        const now = Date.now()
        sub.name = name
        sub.updatedAt = now
        group!.updatedAt = now
        this.scheduleSubGroupSync(groupId, subId, { updatedAt: now })
        this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })
      }
    },
    setSearch(value: string) {
      this.search = typeof value === 'string' ? value : ''
    },
    ensureValidSelection(preferredGroupId?: string, preferredSubGroupId?: string) {
      preferredGroupId = preferredGroupId ?? this.activeGroupId
      preferredSubGroupId = preferredSubGroupId ?? this.activeSubGroupId
      if (!this.groups.length) {
        this.activeGroupId = ''
        this.activeSubGroupId = ''
        return
      }

      const preferredGroup = this.groups.find(g => g.id === preferredGroupId)
      const fallbackGroup = preferredGroup || this.groups.find(g => g.id !== TRASH_GROUP_ID) || this.groups[0]

      if (!fallbackGroup) {
        this.activeGroupId = ''
        this.activeSubGroupId = ''
        return
      }

      const preferredSub = fallbackGroup.children.find(c => c.id === preferredSubGroupId)
      const fallbackSub = preferredSub || fallbackGroup.children[0]

      this.activeGroupId = fallbackGroup.id
      this.activeSubGroupId = fallbackSub?.id || ''
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

      this.scheduleBookmarkSync(bookmark.id, { updatedAt: now })
      const affectedSubKeys = new Set<string>()
      locations.forEach(loc => {
        affectedSubKeys.add(`${loc.groupId}:${loc.subGroupId}`)
      })
      affectedSubKeys.forEach(key => {
        const [groupId, subId] = key.split(':')
        if (!groupId || !subId) return
        this.scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      })

      const affectedGroupIds = new Set<string>()
      locations.forEach(loc => affectedGroupIds.add(loc.groupId))
      affectedGroupIds.forEach(groupId => {
        this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })
      })

      trackEvent('bookmark_create_success', {
        bookmarkId: bookmark.id,
        locationCount: locations.length,
        firstGroupId: locations[0]?.groupId,
        firstSubGroupId: locations[0]?.subGroupId,
        hasTemplate: /{[^}]+}/.test(bookmark.url),
        allowUniversal: bookmark.allowUniversal ?? false,
      })

      return bookmark
    },
    updateBookmarkLocations(bookmarkId: string, newLocations: BookmarkLocation[]) {
      const now = Date.now()
      const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
      const previousLocations = bookmark?.locations
        ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
        : this.getBookmarkLocations(bookmarkId)
      const previousShareIds = this.getShareIdsFromLocations(previousLocations)
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
      
      if (bookmark) {
        bookmark.locations = newLocations
        bookmark.updatedAt = now
      }

      const affectedSubKeys = new Set<string>()
      previousLocations.forEach(loc => affectedSubKeys.add(`${loc.groupId}:${loc.subGroupId}`))
      newLocations.forEach(loc => affectedSubKeys.add(`${loc.groupId}:${loc.subGroupId}`))

      affectedSubKeys.forEach(key => {
        const [groupId, subId] = key.split(':')
        if (!groupId || !subId) return
        this.scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      })

      const affectedGroupIds = new Set<string>()
      previousLocations.forEach(loc => affectedGroupIds.add(loc.groupId))
      newLocations.forEach(loc => affectedGroupIds.add(loc.groupId))
      affectedGroupIds.forEach(groupId => {
        this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })
      })

      this.scheduleBookmarkSync(bookmarkId, { updatedAt: now, previousShareIds })
    },
    updateBookmark(id: string, updater: Partial<Bookmark>) {
      const idx = this.bookmarks.findIndex(b => b.id === id)
      if (idx === -1) return

      const bookmark = this.bookmarks[idx]
      const now = Date.now()
      const originalUrl = bookmark.url
      const originalIcon = bookmark.icon

      // 直接修改属性而非替换对象，保持响应式
      Object.assign(bookmark, updater, { updatedAt: now })

      if (updater.url && updater.url !== originalUrl && (!originalIcon || originalIcon.type === 'text')) {
        this.refreshSingleIcon(bookmark)
      }

      this.scheduleBookmarkSync(bookmark.id, { updatedAt: now })
    },
    removeBookmark(id: string) {
      const now = Date.now()
      const locations = this.getBookmarkLocations(id)
      const inTrash = locations.some(loc => loc.groupId === TRASH_GROUP_ID)

      trackEvent('bookmark_delete', {
        bookmarkId: id,
        deleteType: inTrash ? 'permanent' : 'trash',
        locationCount: locations.length,
        firstGroupId: locations[0]?.groupId,
        firstSubGroupId: locations[0]?.subGroupId,
      })

      if (inTrash) {
        const bookmark = this.bookmarks.find(b => b.id === id)
        const previousLocations = bookmark?.locations
          ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
          : this.getBookmarkLocations(id)
        const previousShareIds = this.getShareIdsFromLocations(previousLocations)

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
        this.scheduleBookmarkSync(id, {
          isDeleted: true,
          updatedAt: now,
          previousShareIds,
          content: null
        })
      } else {
        // 软删除预留：标记 isDeleted 并移入回收站
        const bookmark = this.bookmarks.find(b => b.id === id)
        if (bookmark) {
          bookmark.updatedAt = now
          // 记录移入回收站前的位置
          if (bookmark.locations && bookmark.locations.length > 0) {
            bookmark.prevLocations = JSON.parse(JSON.stringify(bookmark.locations))
          }
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
      return this.restoreBookmarkFromTrash(id)
    },
    restoreBookmarkFromTrash(id: string) {
      const bookmark = this.bookmarks.find(b => b.id === id)
      if (!bookmark) return false

      const now = Date.now()
      const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const trashSubs = trashGroup?.children ?? []
      const previousLocations = bookmark.locations
        ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
        : this.getBookmarkLocations(id)
      const previousShareIds = this.getShareIdsFromLocations(previousLocations)

      let targetLocations: BookmarkLocation[] = []

      // 1. 优先尝试从记录的原位置还原
      if (bookmark.prevLocations && bookmark.prevLocations.length > 0) {
        // 过滤掉已经不存在的分组或子分组
        targetLocations = bookmark.prevLocations.filter(loc => {
          const group = this.groups.find(g => g.id === loc.groupId)
          return group && group.id !== TRASH_GROUP_ID && group.children.some(c => c.id === loc.subGroupId)
        })
      }

      // 2. 如果没有记录原位置，或原位置已失效，则还原到默认位置
      if (targetLocations.length === 0) {
        const defaultGroup = this.groups.find(g => g.id !== TRASH_GROUP_ID)
        if (defaultGroup && defaultGroup.children.length > 0) {
          targetLocations = [{ groupId: defaultGroup.id, subGroupId: defaultGroup.children[0].id }]
        } else {
          const createdGroups = createSeedGroups()
          const defaultGroup = createdGroups.find(g => g.id !== TRASH_GROUP_ID)!
          this.groups.unshift(defaultGroup)
          targetLocations = [{ groupId: defaultGroup.id, subGroupId: defaultGroup.children[0].id }]
        }
      }

      trashSubs.forEach(sub => {
        sub.bookmarkIds = sub.bookmarkIds.filter(bid => bid !== id)
        sub.updatedAt = now
      })
      if (trashGroup) trashGroup.updatedAt = now

      bookmark.isDeleted = false
      bookmark.updatedAt = now
      this.updateBookmarkLocations(id, targetLocations)
      delete bookmark.prevLocations
      this.selectGroup(targetLocations[0].groupId, targetLocations[0].subGroupId)
      this.scheduleBookmarkSync(id, { updatedAt: now, previousShareIds })
      targetLocations.forEach(loc => {
        this.scheduleSubGroupSync(loc.groupId, loc.subGroupId, { updatedAt: now })
        this.scheduleGroupSync(loc.groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === loc.groupId) })
      })
      ;(this as any).$persist?.()
      return true
    },
    emptyTrash() {
      const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const trashSub = trashGroup?.children[0]
      if (!trashSub) return
      
      const now = Date.now()
      const idsToRemove = [...trashSub.bookmarkIds]
      const previousShareIdsMap = new Map<string, string[]>()

      idsToRemove.forEach(id => {
        const bookmark = this.bookmarks.find(b => b.id === id)
        const previousLocations = bookmark?.locations
          ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
          : this.getBookmarkLocations(id)
        previousShareIdsMap.set(id, this.getShareIdsFromLocations(previousLocations))
      })

      idsToRemove.forEach(id => {
          trashSub.bookmarkIds = trashSub.bookmarkIds.filter(bid => bid !== id)
          this.bookmarks = this.bookmarks.filter(b => b.id !== id)
      })
      trashSub.updatedAt = now
      trashGroup!.updatedAt = now
      
      idsToRemove.forEach(id => {
        this.scheduleBookmarkSync(id, {
          isDeleted: true,
          updatedAt: now,
          previousShareIds: previousShareIdsMap.get(id) || [],
          content: null
        })
      })
    },
    async refreshSingleIcon(bookmark: Bookmark) {
      const icon = await ensureIconForBookmark(bookmark)
      if (!icon) return
      this.assignIcon(bookmark.id, icon)
    },
    isBookmarkInTrash(bookmark: Bookmark) {
      const inTrashByLocation = Array.isArray(bookmark.locations) && bookmark.locations.some(loc =>
        loc.groupId === TRASH_GROUP_ID || loc.subGroupId === 'sg-trash'
      )

      const trashGroup = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const inTrashByGroupIndex = !!trashGroup && trashGroup.children.some(sub => sub.bookmarkIds.includes(bookmark.id))

      return inTrashByLocation || inTrashByGroupIndex
    },
    getMissingIconCandidates(force = false) {
      const settingsStore = useSettingsStore()
      return this.bookmarks.filter(bookmark => {
        if (this.isBookmarkInTrash(bookmark)) return false
        if (settingsStore.skipFailedIconMatch && bookmark.iconMatchFailedAt && !force) return false
        return !bookmark.icon || bookmark.icon.type === 'text'
      })
    },
    countMissingIconCandidates(force = false) {
      return this.getMissingIconCandidates(force).length
    },
    async refreshMissingIcons(force = false) {
      const missing = this.getMissingIconCandidates(force)
      const result = await bulkMatchMissing(missing)
      result.forEach((icon, id) => this.assignIcon(id, icon))
      
      // 收集成功和失败的书签信息
      const successList: string[] = []
      const failList: { id: string; title: string }[] = []
      
      const now = Date.now()
      missing.forEach(bookmark => {
        if (result.has(bookmark.id)) {
          successList.push(bookmark.title || bookmark.url)
          bookmark.iconMatchedAt = now
          bookmark.iconMatchFailedAt = undefined
          bookmark.iconMatchFailedReason = undefined
        } else {
          failList.push({ id: bookmark.id, title: bookmark.title || bookmark.url })
          bookmark.iconMatchFailedAt = now
          bookmark.iconMatchFailedReason = 'no_icon'
        }
      })
      
      return {
        total: missing.length,
        matched: result.size,
        remaining: this.countMissingIconCandidates(force),
        successList,
        failList
      }
    },
    assignIcon(id: string, icon: IconSource) {
      const idx = this.bookmarks.findIndex(b => b.id === id)
      if (idx !== -1) {
        const prev = this.bookmarks[idx]
        this.bookmarks.splice(idx, 1, {
          ...prev,
          icon,
          iconMatchedAt: Date.now(),
          iconMatchFailedAt: undefined,
          iconMatchFailedReason: undefined,
          updatedAt: Date.now()
        })
      }
    },

    // 静默生成全局搜索书签的 base64 图标缓存
    async generateSearchIconCaches(silent = true) {
      const settingsStore = useSettingsStore()
      const isSearchBookmark = (bookmark: Bookmark) => {
        if (bookmark.allowUniversal) return true
        return /{[^}]+}/.test(bookmark.url)
      }

      const targets = this.bookmarks.filter(isSearchBookmark)
      const pending = targets.filter(b => {
        if (settingsStore.skipFailedIconMatch && b.iconMatchFailedAt) return false
        if (!b.icon || b.icon.type === 'text') return true
        return b.icon.type === 'remote' && b.icon.src && !b.icon.cache
      })

      if (pending.length === 0) {
        if (!silent) console.log('[IconCache] 全局搜索图标已缓存，无需更新')
        return null
      }

      if (!silent) console.log(`[IconCache] 开始为 ${pending.length} 个全局搜索书签生成图标缓存...`)

      let successCount = 0
      let failCount = 0
      const failedTitles: string[] = []

      for (const bookmark of pending) {
        try {
          const icon = await ensureIconForBookmark(bookmark, true)
          if (icon && icon.type === 'remote' && icon.cache) {
            this.assignIcon(bookmark.id, icon)
            bookmark.iconMatchedAt = Date.now()
            bookmark.iconMatchFailedAt = undefined
            bookmark.iconMatchFailedReason = undefined
            successCount++
            if (!silent) console.log(`[IconCache] ✓ ${bookmark.title}`)
          } else {
            failCount++
            bookmark.iconMatchFailedAt = Date.now()
            bookmark.iconMatchFailedReason = 'no_icon'
            failedTitles.push(bookmark.title || bookmark.url)
            if (!silent) console.log(`[IconCache] ✗ ${bookmark.title} (获取失败)`)
          }
        } catch (e) {
          failCount++
          bookmark.iconMatchFailedAt = Date.now()
          bookmark.iconMatchFailedReason = 'error'
          failedTitles.push(bookmark.title || bookmark.url)
          if (!silent) console.log(`[IconCache] ✗ ${bookmark.title} (错误)`)
          if (!(e instanceof Error) || !e.message.includes('fetch')) {
            console.warn(`[IconCache] 严重错误: ${bookmark.title}`, e)
          }
        }

        await new Promise(resolve => setTimeout(resolve, 50))
      }

      if (!silent) console.log(`[IconCache] 缓存生成完成: ${successCount} 成功, ${failCount} 失败`)
      return {
        total: pending.length,
        success: successCount,
        failed: failCount,
        failedTitles
      }
    },

    // 静默生成所有 remote 图标的 base64 缓存
    async generateIconCaches(silent = true) {
      const remoteIcons = this.bookmarks.filter(b =>
        b.icon?.type === 'remote' && b.icon.src && !b.icon.cache
      )

      if (remoteIcons.length === 0) {
        if (!silent) console.log('[IconCache] 所有图标已缓存，无需更新')
        return
      }

      if (!silent) console.log(`[IconCache] 开始为 ${remoteIcons.length} 个书签生成图标缓存...`)

      let successCount = 0
      let failCount = 0

      for (const bookmark of remoteIcons) {
        try {
          // 强制重新获取以生成 base64 缓存
          const icon = await ensureIconForBookmark(bookmark, true)
          if (icon && icon.type === 'remote' && icon.cache) {
            this.assignIcon(bookmark.id, icon)
            successCount++
            if (!silent) console.log(`[IconCache] ✓ ${bookmark.title}`)
          } else {
            failCount++
            if (!silent) console.log(`[IconCache] ✗ ${bookmark.title} (获取失败)`)
          }
        } catch (e) {
          failCount++
          if (!silent) console.log(`[IconCache] ✗ ${bookmark.title} (错误)`)
          // 只记录严重的错误
          if (!(e instanceof Error) || !e.message.includes('fetch')) {
            console.warn(`[IconCache] 严重错误: ${bookmark.title}`, e)
          }
        }

        // 避免阻塞太久，每次处理后让出控制权
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      if (!silent) console.log(`[IconCache] 缓存生成完成: ${successCount} 成功, ${failCount} 失败`)
    },

    // 手动刷新图标缓存（显示详细进度）
    async refreshIconCaches() {
      console.log('[IconCache] 🔄 开始手动刷新图标缓存...')
      await this.generateIconCaches(false)
      console.log('[IconCache] ✅ 图标缓存刷新完成')
    },
    removeGroup(id: string) {
      const idx = this.groups.findIndex(g => g.id === id)
      if (idx === -1) return false
      const group = this.groups[idx]
      const now = Date.now()
      const previousGroupShareIds = this.getShareIdsFromGroup(id)
      const previousSubShareIdsMap = new Map<string, string[]>()
      const touchedBookmarkShareIdsMap = new Map<string, string[]>()

      group.children.forEach(sub => {
        previousSubShareIdsMap.set(sub.id, this.getShareIdsFromSubGroup(id, sub.id))
        sub.bookmarkIds.forEach(bid => {
          if (touchedBookmarkShareIdsMap.has(bid)) return
          const bookmark = this.bookmarks.find(b => b.id === bid)
          const previousLocations = bookmark?.locations
            ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
            : this.getBookmarkLocations(bid)
          touchedBookmarkShareIdsMap.set(bid, this.getShareIdsFromLocations(previousLocations))
        })
      })
      
      // 1. 收集需要移动到回收站的书签 ID
      const toTrash: string[] = []
      group.children.forEach(sub => {
        sub.bookmarkIds.forEach(bid => {
          const bookmark = this.bookmarks.find(b => b.id === bid)
          if (bookmark) {
            const oldLocations = bookmark.locations ? [...bookmark.locations] : []
            // 移除当前分组的位置
            bookmark.locations = bookmark.locations?.filter(loc => loc.groupId !== id) || []
            // 如果书签没有其他位置了，标记为需要移动到回收站
            if (bookmark.locations.length === 0) {
              // 记录移入回收站前的位置
              if (oldLocations.length > 0) {
                bookmark.prevLocations = oldLocations
              }
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

      touchedBookmarkShareIdsMap.forEach((previousShareIds, bookmarkId) => {
        this.scheduleBookmarkSync(bookmarkId, {
          updatedAt: now,
          previousShareIds
        })
      })

      previousSubShareIdsMap.forEach((previousShareIds, subId) => {
        this.scheduleSubGroupSync(id, subId, {
          isDeleted: true,
          updatedAt: now,
          previousShareIds
        })
      })

      this.scheduleGroupSync(id, {
        isDeleted: true,
        updatedAt: now,
        previousShareIds: previousGroupShareIds
      })

      this.groups
        .filter(g => g.id !== TRASH_GROUP_ID)
        .forEach((existingGroup, orderIndex) => {
          this.scheduleGroupSync(existingGroup.id, { updatedAt: now, orderIndex })
        })

      // 强制立即持久化
      ;(this as any).$persist?.()
      return true
    },
    removeSubGroup(groupId: string, subId: string) {
      const group = this.groups.find(g => g.id === groupId)
      if (!group) return false
      const idx = group.children.findIndex(c => c.id === subId)
      if (idx === -1) return false
      const sub = group.children[idx]
      const now = Date.now()
      const previousSubShareIds = this.getShareIdsFromSubGroup(groupId, subId)
      const touchedBookmarkShareIdsMap = new Map<string, string[]>()
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        const previousLocations = bookmark?.locations
          ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
          : this.getBookmarkLocations(bid)
        touchedBookmarkShareIdsMap.set(bid, this.getShareIdsFromLocations(previousLocations))
      })
      
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

      touchedBookmarkShareIdsMap.forEach((previousShareIds, bookmarkId) => {
        this.scheduleBookmarkSync(bookmarkId, {
          updatedAt: now,
          previousShareIds
        })
      })

      this.scheduleSubGroupSync(groupId, subId, {
        isDeleted: true,
        updatedAt: now,
        previousShareIds: previousSubShareIds
      })
      this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })

      // 强制立即持久化
      ;(this as any).$persist?.()
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
      const now = Date.now()
      sub.updatedAt = now
      group!.updatedAt = now
      this.scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })
    },
    moveBookmarkToSubGroup(bookmarkId: string, fromGroupId: string, fromSubId: string, toGroupId: string, toSubId: string) {
      if (fromGroupId === toGroupId && fromSubId === toSubId) return false
      const fromGroup = this.groups.find(g => g.id === fromGroupId)
      const fromSub = fromGroup?.children.find(c => c.id === fromSubId)
      const toGroup = this.groups.find(g => g.id === toGroupId)
      const toSub = toGroup?.children.find(c => c.id === toSubId)
      if (!fromSub || !toSub) return false
      if (!fromSub.bookmarkIds.includes(bookmarkId)) return false
      const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
      const previousLocations = bookmark?.locations
        ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
        : this.getBookmarkLocations(bookmarkId)
      const previousShareIds = this.getShareIdsFromLocations(previousLocations)
      const now = Date.now()
      fromSub.bookmarkIds = fromSub.bookmarkIds.filter(id => id !== bookmarkId)
      fromSub.updatedAt = now
      fromGroup!.updatedAt = now
      if (!toSub.bookmarkIds.includes(bookmarkId)) {
        toSub.bookmarkIds.push(bookmarkId)
        toSub.updatedAt = now
        toGroup!.updatedAt = now
      }
      if (bookmark?.locations) {
        bookmark.locations = bookmark.locations.filter(
          loc => !(loc.groupId === fromGroupId && loc.subGroupId === fromSubId)
        )
        if (!bookmark.locations.some(loc => loc.groupId === toGroupId && loc.subGroupId === toSubId)) {
          bookmark.locations.push({ groupId: toGroupId, subGroupId: toSubId })
        }
        bookmark.updatedAt = now
      }
      if (bookmark) {
        this.scheduleBookmarkSync(bookmarkId, {
          updatedAt: now,
          previousShareIds
        })
      }
      this.scheduleSubGroupSync(fromGroupId, fromSubId, { updatedAt: now })
      this.scheduleSubGroupSync(toGroupId, toSubId, { updatedAt: now })
      this.scheduleGroupSync(fromGroupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === fromGroupId) })
      if (fromGroupId !== toGroupId) {
        this.scheduleGroupSync(toGroupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === toGroupId) })
      }
      return true
    },
    reorderGroups(newOrder: Group[]) {
      const now = Date.now()
      const trash = this.groups.find(g => g.id === TRASH_GROUP_ID)
      const filtered = newOrder.filter(g => g.id !== TRASH_GROUP_ID)
      filtered.forEach((group, index) => {
        group.updatedAt = now + index
      })
      this.groups = trash ? [...filtered, trash] : filtered
      filtered.forEach((group, orderIndex) => {
        this.scheduleGroupSync(group.id, { updatedAt: group.updatedAt, orderIndex })
      })
    },
    reorderSubGroups(groupId: string, newChildren: Group['children']) {
      const group = this.groups.find(g => g.id === groupId)
      if (group) {
        const now = Date.now()
        newChildren.forEach((child, index) => {
          child.updatedAt = now + index
        })
        group.children = newChildren
        group.updatedAt = now
        group.children.forEach(child => {
          this.scheduleSubGroupSync(groupId, child.id, { updatedAt: child.updatedAt })
        })
        this.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === groupId) })
      }
    },
    moveSubToGroup(sourceGroupId: string, subId: string, targetGroupId: string) {
      const sourceGroup = this.groups.find(g => g.id === sourceGroupId)
      const targetGroup = this.groups.find(g => g.id === targetGroupId)
      if (!sourceGroup || !targetGroup) return false
      const subIdx = sourceGroup.children.findIndex(c => c.id === subId)
      if (subIdx === -1) return false
      const previousSubShareIds = this.getShareIdsFromSubGroup(sourceGroupId, subId)
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      const bookmarkPreviousShareIdsMap = new Map<string, string[]>()
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        const previousLocations = bookmark?.locations
          ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
          : this.getBookmarkLocations(bid)
        bookmarkPreviousShareIdsMap.set(bid, this.getShareIdsFromLocations(previousLocations))
      })
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
      bookmarkPreviousShareIdsMap.forEach((previousShareIds, bookmarkId) => {
        this.scheduleBookmarkSync(bookmarkId, { updatedAt: now, previousShareIds })
      })
      this.scheduleSubGroupSync(targetGroupId, subId, { updatedAt: now, previousShareIds: previousSubShareIds })
      this.scheduleGroupSync(sourceGroupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === sourceGroupId) })
      this.scheduleGroupSync(targetGroupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === targetGroupId) })
      return true
    },
    promoteSubToGroup(sourceGroupId: string, subId: string) {
      const sourceGroup = this.groups.find(g => g.id === sourceGroupId)
      if (!sourceGroup) return null
      const subIdx = sourceGroup.children.findIndex(c => c.id === subId)
      if (subIdx === -1) return null
      const previousSubShareIds = this.getShareIdsFromSubGroup(sourceGroupId, subId)
      const [sub] = sourceGroup.children.splice(subIdx, 1)
      const bookmarkPreviousShareIdsMap = new Map<string, string[]>()
      sub.bookmarkIds.forEach(bid => {
        const bookmark = this.bookmarks.find(b => b.id === bid)
        const previousLocations = bookmark?.locations
          ? JSON.parse(JSON.stringify(bookmark.locations)) as BookmarkLocation[]
          : this.getBookmarkLocations(bid)
        bookmarkPreviousShareIdsMap.set(bid, this.getShareIdsFromLocations(previousLocations))
      })
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

      bookmarkPreviousShareIdsMap.forEach((previousShareIds, bookmarkId) => {
        this.scheduleBookmarkSync(bookmarkId, { updatedAt: now, previousShareIds })
      })

      this.scheduleSubGroupSync(newGroup.id, sub.id, { updatedAt: now, previousShareIds: previousSubShareIds })
      this.scheduleGroupSync(sourceGroupId, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === sourceGroupId) })
      this.scheduleGroupSync(newGroup.id, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === newGroup.id) })

      return newGroup
    },
    loadFromSnapshot(data: { groups: Group[]; bookmarks: Bookmark[] }, readOnly = false) {
      const preferredGroupId = this.activeGroupId
      const preferredSubGroupId = this.activeSubGroupId
      this.groups = data.groups
      this.bookmarks = data.bookmarks
      this.isReadOnly = readOnly
      this.ensureValidSelection(preferredGroupId, preferredSubGroupId)
    },

    syncAllSharedEntities(updatedAt = Date.now()) {
      this.groups
        .filter(group => group.id !== TRASH_GROUP_ID)
        .forEach((group, orderIndex) => {
          this.scheduleGroupSync(group.id, { updatedAt, orderIndex })
        })

      this.groups.forEach(group => {
        group.children.forEach(sub => {
          this.scheduleSubGroupSync(group.id, sub.id, { updatedAt })
        })
      })

      this.bookmarks.forEach(bookmark => {
        this.scheduleBookmarkSync(bookmark.id, { updatedAt })
      })
    },

    findGroupByName(name: string): Group | null {
      return this.groups.find(g => g.name === name && g.id !== TRASH_GROUP_ID) || null
    },
    
    // 获取或创建"快速收集"分组，用于快速保存功能
    getOrCreateQuickCollectGroup(): { group: Group; subGroup: SubGroup } {
      const QUICK_COLLECT_NAME = '快速收集'
      let group = this.findGroupByName(QUICK_COLLECT_NAME)
      
      if (!group) {
        // 创建新分组，但不改变当前活跃分组
        const now = Date.now()
        const newGroup: Group = {
          id: uid(),
          name: QUICK_COLLECT_NAME,
          createdAt: now,
          updatedAt: now,
          children: [
            {
              id: uid(),
              name: '收集',
              bookmarkIds: [],
              createdAt: now,
              updatedAt: now
            }
          ]
        }
        // 插入到回收站之前
        const trashIdx = this.groups.findIndex(g => g.id === TRASH_GROUP_ID)
        if (trashIdx !== -1) {
          this.groups.splice(trashIdx, 0, newGroup)
        } else {
          this.groups.push(newGroup)
        }
        group = newGroup
      }
      
      // 确保有子分组
      if (!group.children || group.children.length === 0) {
        const now = Date.now()
        group.children = [{
          id: uid(),
          name: '收集',
          bookmarkIds: [],
          createdAt: now,
          updatedAt: now
        }]
        group.updatedAt = now
      }
      
      return { group, subGroup: group.children[0] }
    },

    // 快速保存书签到"快速收集"分组
    quickSaveBookmark(url: string, title?: string, desc?: string): Bookmark {
      const { group, subGroup } = this.getOrCreateQuickCollectGroup()
      const now = Date.now()
      
      // 检查是否已存在相同 URL
      const existingBookmark = this.bookmarks.find(b => 
        b.url === url && !b.isDeleted
      )
      
      if (existingBookmark) {
        // 如果已存在，检查是否已在快速收集分组中
        const alreadyInQuickCollect = subGroup.bookmarkIds.includes(existingBookmark.id)
        if (!alreadyInQuickCollect) {
          const previousLocations = existingBookmark.locations
            ? JSON.parse(JSON.stringify(existingBookmark.locations)) as BookmarkLocation[]
            : this.getBookmarkLocations(existingBookmark.id)
          const previousShareIds = this.getShareIdsFromLocations(previousLocations)

          // 添加到快速收集分组
          subGroup.bookmarkIds.unshift(existingBookmark.id)
          subGroup.updatedAt = now
          group.updatedAt = now
          
          // 更新书签的 locations
          if (!existingBookmark.locations) {
            existingBookmark.locations = []
          }
          existingBookmark.locations.push({ groupId: group.id, subGroupId: subGroup.id })
          existingBookmark.updatedAt = now

          this.scheduleBookmarkSync(existingBookmark.id, { updatedAt: now, previousShareIds })
          this.scheduleSubGroupSync(group.id, subGroup.id, { updatedAt: now })
          this.scheduleGroupSync(group.id, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === group.id) })
        }
        return existingBookmark
      }
      
      // 创建新书签
      const bookmark: Bookmark = {
        id: uid(),
        title: title || url,
        url,
        desc: desc || '',
        tags: [],
        locations: [{ groupId: group.id, subGroupId: subGroup.id }],
        createdAt: now,
        updatedAt: now
      }
      
      this.bookmarks.push(bookmark)
      subGroup.bookmarkIds.unshift(bookmark.id)
      subGroup.updatedAt = now
      group.updatedAt = now
      
      // 异步获取图标
      ensureIconForBookmark(bookmark).then(icon => {
        if (icon) {
          const b = this.bookmarks.find(x => x.id === bookmark.id)
          if (b) {
            b.icon = icon
            b.updatedAt = Date.now()
          }
        }
      })
      
      this.scheduleBookmarkSync(bookmark.id, { updatedAt: now })
      this.scheduleSubGroupSync(group.id, subGroup.id, { updatedAt: now })
      this.scheduleGroupSync(group.id, { updatedAt: now, orderIndex: this.groups.findIndex(g => g.id === group.id) })
      
      return bookmark
    },
  },
  persist: {
    storage: utoolsStorage,
    pick: ['groups', 'bookmarks', 'activeGroupId', 'activeSubGroupId'],
  },
})
