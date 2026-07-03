import type { Bookmark, Group } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'

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
  dsc: string          // 描述（保持真实描述，不用域名兜底）
  fav: string          // 文字图标（标题首字 / 域名首字母）
  color?: string       // fav 背景色（仅用户在 icon.bgColor 主动设置时有值，否则不分配）
  favHue: number       // 文字占位底色色调（拿不到 favicon 时按域名稳定分配，低饱和）
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

// 低饱和度暖系调色板：拿不到 favicon 时按域名做稳定哈希分配色调，
// 同一站点恒定同色；明度/文字色由 CSS 按深浅模式派生，这里只定 hue。
const FAV_HUES = [16, 32, 45, 96, 150, 174, 200, 222, 255, 288, 322, 348]

function favHueOf(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0
  return FAV_HUES[h % FAV_HUES.length]
}

function toItem(b: Bookmark): HomeItem {
  const host = hostOf(b.url)
  return {
    id: b.id,
    ttl: b.title || host,
    url: b.url,
    host,
    dsc: b.desc || '',
    fav: favText(b.title, host),
    color: b.icon?.bgColor || undefined,
    favHue: favHueOf(host || b.title || b.url),
    iconUrl: iconToDisplayUrl(b.icon) || undefined,
    pin: !!b.pinned,
    tags: b.tags || []
  }
}

/** 组装：把 groups + bookmarks 转成三层视图模型（跳过回收站分组与空子分组）。 */
export function buildHomeGroups(groups: Group[], bookmarks: Bookmark[]): HomeGroup[] {
  const byId = new Map(bookmarks.map((b) => [b.id, b]))
  const out: HomeGroup[] = []
  for (const g of groups) {
    if (g.id === TRASH_GROUP_ID) continue
    const subs: HomeSub[] = []
    for (const sub of g.children || []) {
      const items: HomeItem[] = []
      for (const bid of sub.bookmarkIds || []) {
        const b = byId.get(bid)
        if (b && !b.isDeleted) items.push(toItem(b))
      }
      subs.push({ id: sub.id, name: sub.name, items })
    }
    out.push({ id: g.id, name: g.name, subs })
  }
  return out
}

/** 回收站书签计数（侧栏「回收站」入口的 count，可选展示）。 */
export function trashCount(groups: Group[]): number {
  const trash = groups.find((g) => g.id === TRASH_GROUP_ID)
  if (!trash) return 0
  return (trash.children || []).reduce((n, s) => n + (s.bookmarkIds?.length || 0), 0)
}
