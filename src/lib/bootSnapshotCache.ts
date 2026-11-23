import type { BookmarkSnapshot } from './stateRepository'
import type { SettingsState } from '@/stores/settings'

const SETTINGS_BOOT_CACHE_KEY = 'goose-marks.boot-settings-v1'
const BOOKMARK_BOOT_CACHE_ACCOUNT_KEY = 'goose-marks.boot-account-v1'
const BOOKMARK_BOOT_CACHE_WEB_KEY = 'goose-marks.boot-bookmarks-web-v1'
const BOOT_CACHE_DEBOUNCE_MS = 500
const WEB_FIRST_SCREEN_ICON_LIMIT = 30
const WEB_MAX_ICON_CHARS = 32_768

interface PersistedBookmarkBootPayload {
  version: 1
  account: string
  snapshot: BookmarkSnapshot
}

let bootCacheTimer: ReturnType<typeof setTimeout> | null = null
let pendingBootSnapshot: BookmarkSnapshot | null = null
let bootWriteChain: Promise<void> = Promise.resolve()

const readCurrentAccountFingerprint = (): string => {
  try {
    const user = window.utools?.getUser?.()
    return JSON.stringify(user ? [user.nickname, user.avatar] : null)
  } catch {
    return 'null'
  }
}

export function readSettingsBootCache(): Partial<SettingsState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage?.getItem?.(SETTINGS_BOOT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<SettingsState>) : null
  } catch {
    return null
  }
}

export function writeSettingsBootCache(settings: Partial<SettingsState>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem?.(SETTINGS_BOOT_CACHE_KEY, JSON.stringify(settings))
  } catch {}
}

const isValidSnapshotShape = (value: unknown): value is BookmarkSnapshot => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BookmarkSnapshot>
  return Array.isArray(candidate.groups) && Array.isArray(candidate.bookmarks) && candidate.groups.length > 0
}

/**
 * 首屏同步读取本机显示缓存（纯进程内 localStorage + 单文件顺序读，零同步跨进程 IPC）。
 * 仅用于首帧立即绘制；真实数据库随后异步完成校验与对账，绝不以本缓存反向覆盖数据库基线。
 */
export function readBookmarkBootCache(): BookmarkSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const expectedAccount = window.localStorage?.getItem?.(BOOKMARK_BOOT_CACHE_ACCOUNT_KEY)
    const nativeRaw = window.__gooseBootCache?.readSync?.()
    if (nativeRaw) {
      const parsed = JSON.parse(nativeRaw) as Partial<PersistedBookmarkBootPayload>
      if (
        parsed?.version === 1 &&
        (expectedAccount == null || parsed.account === expectedAccount) &&
        isValidSnapshotShape(parsed.snapshot)
      ) {
        return parsed.snapshot
      }
    }

    const webRaw = window.localStorage?.getItem?.(BOOKMARK_BOOT_CACHE_WEB_KEY)
    if (!webRaw) return null
    const parsedWeb = JSON.parse(webRaw) as Partial<PersistedBookmarkBootPayload>
    if (parsedWeb?.version === 1 && isValidSnapshotShape(parsedWeb.snapshot)) {
      return parsedWeb.snapshot
    }
  } catch {
    // 缓存缺失或损坏时静默回退到常规异步数据库加载
  }
  return null
}

const trimSnapshotForWebStorage = (snapshot: BookmarkSnapshot): BookmarkSnapshot => {
  const activeGroup =
    snapshot.groups.find((g) => g.id === snapshot.activeGroupId) ??
    snapshot.groups.find((g) => g.id !== 'g-trash') ??
    snapshot.groups[0]
  const firstIds = new Set<string>()
  if (activeGroup) {
    for (const sub of activeGroup.children) {
      for (const id of sub.bookmarkIds) {
        firstIds.add(id)
        if (firstIds.size >= WEB_FIRST_SCREEN_ICON_LIMIT) break
      }
      if (firstIds.size >= WEB_FIRST_SCREEN_ICON_LIMIT) break
    }
  }
  return {
    ...snapshot,
    bookmarks: snapshot.bookmarks.map((b) => {
      if (!b.icon) return b
      if (firstIds.has(b.id)) {
        if (b.icon.type === 'remote' && (b.icon.cache?.length ?? 0) <= WEB_MAX_ICON_CHARS) return b
        if (b.icon.type === 'custom' && (b.icon.data?.length ?? 0) <= WEB_MAX_ICON_CHARS) return b
      }
      if (b.icon.type === 'remote' || b.icon.type === 'custom') {
        return { ...b, icon: b.icon.bgColor ? { type: 'text', value: '', bgColor: b.icon.bgColor } : undefined }
      }
      return b
    })
  }
}

async function writeBookmarkBootCacheAsync(snapshot: BookmarkSnapshot): Promise<void> {
  if (typeof window === 'undefined') return
  const account = readCurrentAccountFingerprint()
  try { window.localStorage?.setItem?.(BOOKMARK_BOOT_CACHE_ACCOUNT_KEY, account) } catch {}

  if (window.__gooseBootCache?.writeAsync) {
    const payload: PersistedBookmarkBootPayload = { version: 1, account, snapshot }
    const ok = await window.__gooseBootCache.writeAsync(JSON.stringify(payload))
    if (ok) return
  }

  try {
    const webPayload: PersistedBookmarkBootPayload = {
      version: 1,
      account,
      snapshot: trimSnapshotForWebStorage(snapshot)
    }
    window.localStorage?.setItem?.(BOOKMARK_BOOT_CACHE_WEB_KEY, JSON.stringify(webPayload))
  } catch {}
}

export function scheduleBookmarkBootCacheWrite(snapshot: BookmarkSnapshot): void {
  pendingBootSnapshot = snapshot
  if (bootCacheTimer != null) clearTimeout(bootCacheTimer)
  bootCacheTimer = setTimeout(() => {
    bootCacheTimer = null
    const next = pendingBootSnapshot
    pendingBootSnapshot = null
    if (!next) return
    bootWriteChain = bootWriteChain
      .then(() => writeBookmarkBootCacheAsync(next))
      .catch(() => {})
  }, BOOT_CACHE_DEBOUNCE_MS)
}

/** 退出路径同步刷新首屏缓存，避免 500ms 防抖未触发时重启读到旧快照。 */
export function flushBookmarkBootCacheSync(snapshot: BookmarkSnapshot): void {
  if (bootCacheTimer != null) {
    clearTimeout(bootCacheTimer)
    bootCacheTimer = null
  }
  pendingBootSnapshot = null
  if (typeof window === 'undefined') return
  const account = readCurrentAccountFingerprint()
  try { window.localStorage?.setItem?.(BOOKMARK_BOOT_CACHE_ACCOUNT_KEY, account) } catch {}

  if (window.__gooseBootCache?.writeSync) {
    const payload: PersistedBookmarkBootPayload = { version: 1, account, snapshot }
    if (window.__gooseBootCache.writeSync(JSON.stringify(payload))) return
  }

  try {
    const webPayload: PersistedBookmarkBootPayload = {
      version: 1,
      account,
      snapshot: trimSnapshotForWebStorage(snapshot)
    }
    window.localStorage?.setItem?.(BOOKMARK_BOOT_CACHE_WEB_KEY, JSON.stringify(webPayload))
  } catch {}
}

export function clearBookmarkBootCache(): void {
  if (bootCacheTimer != null) {
    clearTimeout(bootCacheTimer)
    bootCacheTimer = null
  }
  pendingBootSnapshot = null
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.removeItem?.(BOOKMARK_BOOT_CACHE_ACCOUNT_KEY)
    window.localStorage?.removeItem?.(BOOKMARK_BOOT_CACHE_WEB_KEY)
    window.__gooseBootCache?.clear?.()
  } catch {}
}
