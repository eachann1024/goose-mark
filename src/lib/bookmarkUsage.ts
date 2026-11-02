import { getDoc, isUToolsDbAvailable, putDocWithRetry } from '@/lib/utoolsDb'

// 书签使用统计（visits / lastUsed）只属于当前设备：
// 写入同步的书签文档会让“仅仅打开书签”产生整条书签的旧版本写入，从而覆盖其他设备的编辑。
// 这里用按设备区分的文档 gm:usage:<nativeId>（只有本机写，不会产生跨设备冲突），
// 无法获取设备 ID 或 db 不可用时退回 localStorage。
export interface BookmarkUsage {
  visits?: number
  lastUsed?: number
}
export type BookmarkUsageMap = Record<string, BookmarkUsage>

const USAGE_DOC_PREFIX = 'gm:usage:'
const USAGE_LOCAL_KEY = 'goose-marks.bookmark-usage'
const USAGE_FLUSH_DEBOUNCE_MS = 1000
const PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'

let cache: BookmarkUsageMap | null = null
let dirty = false
let timer: ReturnType<typeof setTimeout> | null = null
let listenersBound = false

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const sanitize = (raw: unknown): BookmarkUsageMap => {
  const result: BookmarkUsageMap = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const { visits, lastUsed } = value as BookmarkUsage
    const entry: BookmarkUsage = {}
    if (isCount(visits)) entry.visits = visits
    if (isCount(lastUsed)) entry.lastUsed = lastUsed
    if (entry.visits !== undefined || entry.lastUsed !== undefined) result[id] = entry
  }
  return result
}

const getUsageDocId = (): string | null => {
  try {
    const nativeId = (window as unknown as { utools?: { getNativeId?: () => string } }).utools?.getNativeId?.()
    return typeof nativeId === 'string' && nativeId ? `${USAGE_DOC_PREFIX}${nativeId}` : null
  } catch {
    return null
  }
}

const readStorage = (): BookmarkUsageMap => {
  const docId = isUToolsDbAvailable() ? getUsageDocId() : null
  if (docId) return sanitize(getDoc<unknown>(docId)?.data)
  try { return sanitize(JSON.parse(window.localStorage.getItem(USAGE_LOCAL_KEY) || 'null')) }
  catch { return {} }
}

const loadCache = (): BookmarkUsageMap => (cache ??= readStorage())

export const getBookmarkUsageMap = (): BookmarkUsageMap => loadCache()

/** 立即把待写入的使用统计落盘；失败时保持 dirty，等待下一次机会。 */
export const flushBookmarkUsage = (): void => {
  if (timer) clearTimeout(timer)
  timer = null
  if (!dirty || !cache) return
  try {
    const docId = isUToolsDbAvailable() ? getUsageDocId() : null
    if (docId) {
      const result = putDocWithRetry(docId, cache)
      if (result.ok === false) return
    } else {
      window.localStorage.setItem(USAGE_LOCAL_KEY, JSON.stringify(cache))
    }
    dirty = false
  } catch (error) {
    console.warn('[bookmarkUsage] 保存使用统计失败:', error)
  }
}

const bindFlushEvents = (): void => {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true
  window.addEventListener(PLUGIN_OUT_EVENT, flushBookmarkUsage)
  window.addEventListener('pagehide', flushBookmarkUsage)
  window.addEventListener('beforeunload', flushBookmarkUsage)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushBookmarkUsage()
  })
}

/** 记录一次使用。调用方给出新的 visits / lastUsed（已包含旧同步文档里的历史计数）。 */
export const recordBookmarkUsage = (id: string, usage: { visits: number; lastUsed: number }): void => {
  loadCache()[id] = { visits: usage.visits, lastUsed: usage.lastUsed }
  dirty = true
  bindFlushEvents()
  if (timer) clearTimeout(timer)
  timer = setTimeout(flushBookmarkUsage, USAGE_FLUSH_DEBOUNCE_MS)
}

/** 本机数据优先；没有本机数据时保留文档里的旧值（迁移起点）。 */
export const overlayBookmarkUsage = <T extends { id: string; visits?: number; lastUsed?: number }>(bookmarks: T[]): T[] => {
  const usage = loadCache()
  return bookmarks.map((bookmark) => {
    const local = Object.prototype.hasOwnProperty.call(usage, bookmark.id) ? usage[bookmark.id] : undefined
    if (!local) return bookmark
    const next = { ...bookmark }
    if (local.visits !== undefined) next.visits = local.visits
    if (local.lastUsed !== undefined) next.lastUsed = local.lastUsed
    return next
  })
}

/** 仅供测试：丢弃内存缓存与待写入状态。 */
export const resetBookmarkUsageForTests = (): void => {
  if (timer) clearTimeout(timer)
  timer = null
  cache = null
  dirty = false
}
