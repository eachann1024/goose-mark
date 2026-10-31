import type { Bookmark, Group } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'
import { registeredDomainOf, siteColorOf, siteFgForBg } from '@/lib/siteColor'

/**
 * 首页视图模型 —— 把真实 bookmark store 的数据组装成设计稿
 * 「分组(group) → 子分组(sub) → 书签(item)」三层结构，供 HomePage 渲染。
 * 设计稿 app.js 里的 mock DATA 字段（ttl/url/dsc/fav/c/pin）在这里由真实
 * Bookmark 派生：fav 取标题首字、背景色由域名做稳定哈希生成暖色。
 */

export interface HomeItem {
  id: string
  ttl: string          // 标题
  url: string          // 链接
  host: string         // 域名（网格视图小字 / fav 取色用）
  regDomain: string    // 一级域名（无描述时的小字兜底，如 baidu.com）
  dsc: string          // 描述（保持真实描述，不用域名兜底）
  fav: string          // 文字图标（标题首字 / 域名首字母）
  color?: string       // fav 背景色（icon.bgColor 有值时优先；否则由 favColor 算法色补齐并持久化）
  favColor: string     // 占位底色（算法分配；用户自设 color 时不用）
  favFg: string        // 与 favColor 配套的文字色（用户自设色时回退默认 accent 前景）
  iconUrl?: string     // 真实图标 URL（有则优先显示图片）
  pin: boolean
  tags: string[]
}

export interface HomeSub {
  id: string
  name: string
  items: HomeItem[]
}

export interface HomeGroup {
  id: string
  name: string
  subs: HomeSub[]
}

function hostOf(url: string): string {
  try {
    const u = url.includes('://') ? url : `https://${url}`
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

function favText(title: string, host: string): string {
  const t = (title || host || '?').trim()
  // 中文取首字，英文取首字母大写
  const first = t[0] || '?'
  return /[a-zA-Z]/.test(first) ? first.toUpperCase() : first
}

const itemCache = new WeakMap<Bookmark, HomeItem>()

function toItem(b: Bookmark): HomeItem {
  const cached = itemCache.get(b)
  if (cached) return cached
  const host = hostOf(b.url)
  const regDomain = registeredDomainOf(host)
  const userColor = b.icon?.bgColor || undefined
  const palette = siteColorOf(regDomain || host || b.title || b.url)
  const item: HomeItem = {
    id: b.id,
    ttl: b.title || host,
    url: b.url,
    host,
    regDomain,
    dsc: b.desc || '',
    fav: favText(b.title, host),
    color: userColor,
    favColor: userColor || palette.bg,
    favFg: (userColor && siteFgForBg(userColor)) || palette.fg,
    iconUrl: iconToDisplayUrl(b.icon) || undefined,
    pin: !!b.pinned,
    tags: b.tags || []
  }
  itemCache.set(b, item)
  return item
}

/** 单条书签 → HomeItem（搜索空态的全局搜索回退等场景复用） */
export function bookmarkToHomeItem(b: Bookmark): HomeItem {
  return toItem(b)
}

export interface HomeGroupIndex {
  byItemId: Map<string, HomeItem>
  locationByItemId: Map<string, { groupId: string; subGroupId: string; index: number }>
  duplicateSubIndexes: Map<string, Map<string, number>>
  navigableItems: HomeItem[]
  navigationIndex: Map<string, number>
}
const groupIndexes = new WeakMap<HomeGroup, HomeGroupIndex>()
const navigationIndexes = new WeakMap<HomeItem[], Map<string, number>>()
const bookmarkIndexes = new WeakMap<Bookmark[], Map<string, Bookmark>>()

export function getBookmarkIndex(bookmarks: Bookmark[]): Map<string, Bookmark> {
  let index = bookmarkIndexes.get(bookmarks)
  if (!index) { index = new Map(bookmarks.map((b) => [b.id, b])); bookmarkIndexes.set(bookmarks, index) }
  return index
}

export function getNavigationIndex(items: HomeItem[]): Map<string, number> {
  let index = navigationIndexes.get(items)
  if (!index) { index = new Map(items.map((item, i) => [item.id, i])); navigationIndexes.set(items, index) }
  return index
}

export function getHomeGroupIndex(group: HomeGroup): HomeGroupIndex {
  let index = groupIndexes.get(group)
  if (index) return index
  index = { byItemId: new Map(), locationByItemId: new Map(), duplicateSubIndexes: new Map(), navigableItems: [], navigationIndex: new Map() }
  for (const sub of group.subs) {
    for (let i = 0; i < sub.items.length; i++) {
      const item = sub.items[i]
      const firstLocation = index.locationByItemId.get(item.id)
      if (firstLocation) {
        let positions = index.duplicateSubIndexes.get(item.id)
        if (!positions) {
          positions = new Map([[firstLocation.subGroupId, firstLocation.index]])
          index.duplicateSubIndexes.set(item.id, positions)
        }
        positions.set(sub.id, i)
        continue
      }
      index.navigationIndex.set(item.id, index.navigableItems.length)
      index.navigableItems.push(item)
      index.byItemId.set(item.id, item)
      index.locationByItemId.set(item.id, { groupId: group.id, subGroupId: sub.id, index: i })
    }
  }
  navigationIndexes.set(index.navigableItems, index.navigationIndex)
  groupIndexes.set(group, index)
  return index
}

/** 恢复多分类书签的位置时也使用数据变更阶段构建的索引。 */
export function getHomeSubItemIndex(group: HomeGroup, itemId: string, subId: string): number {
  const index = getHomeGroupIndex(group)
  const first = index.locationByItemId.get(itemId)
  if (first?.subGroupId === subId) return first.index
  return index.duplicateSubIndexes.get(itemId)?.get(subId) ?? -1
}

/** 数据变更时建立索引，切组、选中和打开菜单复用；不在交互热路径转换整库。 */
export function buildHomeGroups(groups: Group[], bookmarks: Bookmark[]): HomeGroup[] {
  const byId = getBookmarkIndex(bookmarks)
  const out: HomeGroup[] = []
  for (const g of groups) {
    if (g.id === TRASH_GROUP_ID || g.isDeleted) continue
    const subs: HomeSub[] = []
    for (const sub of g.children || []) {
      if (sub.isDeleted) continue
      const items: HomeItem[] = []
      for (const bid of sub.bookmarkIds || []) {
        const b = byId.get(bid)
        if (b && !b.isDeleted) items.push(toItem(b))
      }
      subs.push({ id: sub.id, name: sub.name, items })
    }
    const group = { id: g.id, name: g.name, subs }
    getHomeGroupIndex(group)
    out.push(group)
  }
  return out
}

/** 回收站书签计数（侧栏「回收站」入口的 count，可选展示）。 */
export function trashCount(groups: Group[]): number {
  const trash = groups.find((g) => g.id === TRASH_GROUP_ID)
  if (!trash) return 0
  return (trash.children || []).reduce((n, s) => n + (s.bookmarkIds?.length || 0), 0)
}
