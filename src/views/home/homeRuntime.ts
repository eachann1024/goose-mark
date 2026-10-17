import type { Bookmark, Group } from '@/types/bookmark'
import { type DetachedWindowPosition } from '@/stores/settings'
import { getRuntimePlatform } from '@/lib/platform'
import { type Theme, type ThemePref } from './homeTypes'

// uTools 事件常量（与 preload 对齐）
export const UTOOLS_PLUGIN_ENTER_EVENT = 'goose-marks:plugin-enter'


export const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'


export const UTOOLS_INPUT_EVENT = 'goose-marks:utools-search'


export const UTOOLS_SYNC_EVENT = 'goose-marks:utools-search-sync'


export const UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT = 'goose-marks:restore-default-search-input'



// 运行平台：uTools（含独立/分离窗）由顶部原生 subInput 承接搜索，页内搜索框隐藏（避免重复）。
export const RUNTIME_PLATFORM = getRuntimePlatform()


export const IS_WINDOWS_UTOOLS = (() => {
  try {
    if (RUNTIME_PLATFORM !== 'utools') return false
    if (typeof window.utools?.isWindows === 'function') return window.utools.isWindows()
    return /Windows/i.test(navigator.userAgent)
  } catch {
    return false
  }
})()



// 模板/Universal 书签相关常量
export const UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE = /^[\s/|:：\-—–]+/


export const RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS = 1000


export const BROWSER_URL_READ_TIMEOUT_MS = 2500



export const withFallbackTimeout = async <T,>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}



// 窗口模式 toggle：plugin-enter 距最近一次窗口聚焦小于该间隔时，视为本次唤起带来的聚焦（不隐藏）。
export const DETACH_TOGGLE_FOCUS_GRACE_MS = 400



// 分离窗口（detach/browser）不隐藏主窗口，对齐 App.tsx 的窗口保留策略
export const isDetachedUToolsWindow = () => {
  try {
    const t = window.utools?.getWindowType?.()
    return t === 'detach' || t === 'browser'
  } catch {
    return false
  }
}



export type SearchSurface = 'utools-subinput' | 'inline'



/** uTools（含独立/分离窗）统一用顶部原生搜索；仅浏览器独立调试保留页内搜索框。 */
export const getSearchSurface = (): SearchSurface =>
  RUNTIME_PLATFORM === 'utools' ? 'utools-subinput' : 'inline'



export const readCurrentWindowPosition = (): DetachedWindowPosition | null => {
  const fromBridge = window.__gooseMarksWindowControl?.getPosition?.()
  if (fromBridge && Number.isFinite(fromBridge.x) && Number.isFinite(fromBridge.y)) {
    return { x: Math.round(fromBridge.x), y: Math.round(fromBridge.y) }
  }

  const x = Math.round(window.screenX)
  const y = Math.round(window.screenY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}



export const moveDetachedWindowTo = (position: DetachedWindowPosition | null | undefined) => {
  if (!position || !isDetachedUToolsWindow()) return
  const x = Math.round(Number(position.x))
  const y = Math.round(Number(position.y))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  if (window.__gooseMarksWindowControl?.setPosition?.({ x, y })) return
  try {
    window.moveTo?.(x, y)
  } catch { /* ignore */ }
}



// 跨窗口同步：取数据集中最大 updatedAt（对齐 App.tsx getLatestUpdatedAt）
export const getLatestUpdatedAt = (data: { groups?: Group[]; bookmarks?: Bookmark[] }) => {
  let max = 0
  ;(data.groups || []).forEach((group) => {
    max = Math.max(max, group.updatedAt || group.createdAt || 0)
    group.children?.forEach((sub) => {
      max = Math.max(max, sub.updatedAt || sub.createdAt || 0)
    })
  })
  ;(data.bookmarks || []).forEach((bookmark) => {
    max = Math.max(max, bookmark.updatedAt || bookmark.createdAt || 0)
  })
  return max
}



export interface UToolsPluginEnterPayload {
  code?: string
  payload?: unknown
  type?: string
}



export function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}
