import {
  bucket,
  durationBucket,
  flush,
  initTelemetry,
  track,
  type TelemetryStorage,
} from './telemetry'
import { getDbStorage } from './utoolsDb'

export type BookmarkOpenVia = 'click' | 'enter' | 'shortcut' | 'mcp' | 'universal'
export type BookmarkCreateVia = 'ui' | 'mcp' | 'import'

const KNOWN_ENTRIES = new Set(['bookmarks', 'ai_save', 'quick_save', 'bm_tpl', 'web'])
const PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'

let initialized = false
let currentModule = 'list'
let sessionStartAt = 0
let sessionReported = false
let countsReported = false
let lastTrackedEnterSerial = 0
let lastEnterEntry = ''
let lastEnterAt = 0

function normalizeEntry(raw?: unknown): string {
  const code = typeof raw === 'string' ? raw.trim() : ''
  if (code.startsWith('bm_tpl:')) return 'bm_tpl'
  if (KNOWN_ENTRIES.has(code)) return code
  return typeof window !== 'undefined' && window.utools ? 'bookmarks' : 'web'
}

function readTheme(): string {
  if (typeof document === 'undefined') return ''
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function readOsVersion(): string {
  if (typeof window === 'undefined') return ''
  return window.__gooseSystemInfo?.osVersion || ''
}

function readArch(): string {
  if (typeof window === 'undefined') return ''
  return window.__gooseSystemInfo?.arch || ''
}

export function resolveInitialEntry(): string {
  if (typeof window === 'undefined') return 'web'
  if (!window.utools) return 'web'
  const pending = window.__gooseMarksPendingPluginEnterEvents
  if (Array.isArray(pending) && pending.length > 0) {
    const picked =
      [...pending].reverse().find((item) => typeof item?.params?.code === 'string' && item.params.code.startsWith('bm_tpl:')) ??
      pending[pending.length - 1]
    if (picked?.params?.code) return normalizeEntry(picked.params.code)
  }
  const lastParams = window.__gooseMarksLastPluginEnterParams
  return normalizeEntry(lastParams?.code)
}

export function initAppTelemetry() {
  if (initialized) return
  initialized = true

  if (typeof window !== 'undefined') {
    window.addEventListener(PLUGIN_OUT_EVENT, () => {
      trackAppSession()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        trackAppSession()
      } else if (document.visibilityState === 'visible' && sessionReported) {
        sessionStartAt = Date.now()
        sessionReported = false
      }
    })
    window.addEventListener('pagehide', () => {
      trackAppSession()
    })
  }

  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
  const dbStorage = getDbStorage()
  const storage: TelemetryStorage | undefined = dbStorage ?? undefined

  initTelemetry({
    project: 'mark',
    version,
    storage,
    theme: readTheme,
    osVersion: readOsVersion,
    arch: readArch,
    module: () => currentModule,
  })
}

export function setTelemetryModule(mod: string) {
  if (mod) currentModule = mod
}

export function trackAppOpen(rawEntry?: unknown, coldMs?: number) {
  const entry = normalizeEntry(rawEntry)
  const now = Date.now()
  if (coldMs === undefined && entry === 'bookmarks' && lastEnterEntry === 'bm_tpl' && now - lastEnterAt <= 1000) {
    return
  }
  if (typeof window !== 'undefined') {
    const serial = window.__gooseMarksLastPluginEnterSerial || 0
    if (coldMs !== undefined) {
      lastTrackedEnterSerial = serial
    } else if (serial > 0 && serial <= lastTrackedEnterSerial) {
      return
    } else if (serial > 0) {
      lastTrackedEnterSerial = serial
    }
  }
  sessionStartAt = now
  sessionReported = false
  lastEnterEntry = entry
  lastEnterAt = now
  track('app.open', coldMs !== undefined ? { entry, cold_ms: Math.round(Math.max(0, coldMs)) } : { entry })
}

export function trackAppSession() {
  if (sessionReported || !sessionStartAt) return
  sessionReported = true
  track('app.session', { dur: durationBucket(Date.now() - sessionStartAt) })
  void flush(true)
}

export function trackStartupLibraryCounts(bookmarkCount: number, groupCount: number) {
  if (countsReported) return
  countsReported = true
  track('bookmark.count', { range: bucket(bookmarkCount) })
  track('group.count', { range: bucket(groupCount) })
}

export function trackBookmarkOpen(via: BookmarkOpenVia, template: boolean) {
  track('bookmark.open', { via, template })
}

export function trackBookmarkCreate(via: BookmarkCreateVia) {
  track('bookmark.create', { via })
}

export function trackBookmarkDelete() {
  track('bookmark.delete')
}

export function trackSearch(count: number) {
  track('search', { hit: count > 0, results: bucket(count) })
}

export function trackIconCache(ok: boolean) {
  track('icon.cache', { ok })
}

export function trackImport(format: 'html' | 'json') {
  track('import', { format })
}

export function trackExport(format: 'json') {
  track('export', { format })
}

const KNOWN_MCP_TOOLS = new Set([
  'get_mcp_capabilities',
  'get_bookmark_tree',
  'list_groups',
  'list_bookmarks',
  'search_bookmarks',
  'get_bookmark',
  'open_bookmark',
  'create_group',
  'update_group',
  'remove_group',
  'create_sub_group',
  'update_sub_group',
  'remove_sub_group',
  'create_bookmark',
  'update_bookmark',
  'set_bookmark_locations',
  'remove_bookmark',
  'restore_bookmark',
])

export function trackMcpCall(tool: string, ok: boolean) {
  const safeTool = KNOWN_MCP_TOOLS.has(tool) ? tool : 'other'
  track('mcp.call', { tool: safeTool, ok })
}
