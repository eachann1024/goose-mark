import { create } from 'zustand'
import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'

/**
 * 功能提示中心（React / Zustand 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 用模块级 ref + computed 跨组件共享提示队列；React 等价用模块级
 * Zustand store。整体由 FEATURE_NOTICE_ENABLED 总开关控制（当前为 false，
 * 对外暴露值恒为默认/null），逻辑与持久化键完全保留以备开启。无埋点。
 */

export type FeatureNoticeId = 'local-mode-intro' | 'local-mode-device-path'

export interface FeatureNoticeItem {
  id: FeatureNoticeId
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
}

type LocalModeIntroStatus = 'pending' | 'ignored' | 'viewed'
type NoticeDisplayStrategy = 'once'

const FEATURE_NOTICE_ENABLED = false
const LOCAL_MODE_INTRO_STATUS_KEY = 'goose-marks.feature.local-mode.intro.status.v1'
const LOCAL_MODE_MENU_DOT_KEY = 'goose-marks.feature.local-mode.menu-dot.v1'
const GLOBAL_NOTICE_SEEN_KEY = 'goose-marks.feature.global-notice-seen.v1'

const NOTICE_DISPLAY_STRATEGY: Record<FeatureNoticeId, NoticeDisplayStrategy> = {
  'local-mode-intro': 'once',
  'local-mode-device-path': 'once'
}

const LOCAL_MODE_INTRO_NOTICE: FeatureNoticeItem = {
  id: 'local-mode-intro',
  title: '新增浏览器拓展 🌈',
  description: '配合浏览器拓展使用，功能更强大（支持chrome、360、QQ 浏览器等95%以上浏览器）',
  primaryLabel: '立即查看',
  secondaryLabel: '暂时忽略'
}

const LOCAL_MODE_DEVICE_PATH_NOTICE: FeatureNoticeItem = {
  id: 'local-mode-device-path',
  title: '请为当前设备选择浏览器拓展路径',
  description: '检测到“浏览器拓展优先”已开启，但当前设备还未设置本地存储目录。',
  primaryLabel: '立即选择',
  secondaryLabel: '稍后处理'
}

function readIntroStatus(): LocalModeIntroStatus {
  try {
    const raw = getPersistentItem(LOCAL_MODE_INTRO_STATUS_KEY)
    return raw === 'ignored' || raw === 'viewed' ? raw : 'pending'
  } catch {
    return 'pending'
  }
}

function readBoolean(key: string, fallback = false): boolean {
  try {
    const raw = getPersistentItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
    return fallback
  } catch {
    return fallback
  }
}

function readGlobalNoticeSeenMap(): Record<FeatureNoticeId, boolean> {
  const fallback: Record<FeatureNoticeId, boolean> = {
    'local-mode-intro': false,
    'local-mode-device-path': false
  }
  try {
    const raw = getPersistentItem(GLOBAL_NOTICE_SEEN_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Record<FeatureNoticeId, boolean>>
    return {
      'local-mode-intro': !!parsed['local-mode-intro'],
      'local-mode-device-path': !!parsed['local-mode-device-path']
    }
  } catch {
    return fallback
  }
}

interface FeatureNoticeState {
  notices: FeatureNoticeItem[]
  localModePathPromptSnoozed: boolean
  localModeMenuDot: boolean
  localModeIntroStatus: LocalModeIntroStatus
  globalNoticeSeenMap: Record<FeatureNoticeId, boolean>

  // 派生（等价旧版 computed，受总开关控制）
  activeNotice: () => FeatureNoticeItem | null
  localModeMenuDotVisible: () => boolean
  isLocalModeIntroPending: () => boolean

  ensureLocalModeIntroNotice: () => void
  ensureLocalModeDevicePathNotice: (required: boolean) => void
  markLocalModeIntroViewed: () => void
  markLocalModeIntroIgnored: () => void
  markDevicePathConfigured: () => void
  markDevicePathIgnored: () => void
  markLocalModeSettingsVisited: () => void
}

export const useFeatureNoticeCenter = create<FeatureNoticeState>((set, get) => {
  const writeIntroStatus = (status: LocalModeIntroStatus) => {
    set({ localModeIntroStatus: status })
    try {
      utoolsStorage.setItem(LOCAL_MODE_INTRO_STATUS_KEY, status)
    } catch {}
  }

  const writeLocalModeDot = (visible: boolean) => {
    set({ localModeMenuDot: visible })
    try {
      utoolsStorage.setItem(LOCAL_MODE_MENU_DOT_KEY, visible ? '1' : '0')
    } catch {}
  }

  const writeGlobalNoticeSeenMap = (next: Record<FeatureNoticeId, boolean>) => {
    set({ globalNoticeSeenMap: next })
    try {
      utoolsStorage.setItem(GLOBAL_NOTICE_SEEN_KEY, JSON.stringify(next))
    } catch {}
  }

  const isNoticeSeen = (id: FeatureNoticeId) => !!get().globalNoticeSeenMap[id]

  const markNoticeSeen = (id: FeatureNoticeId) => {
    if (isNoticeSeen(id)) return
    writeGlobalNoticeSeenMap({ ...get().globalNoticeSeenMap, [id]: true })
  }

  const enqueueNotice = (notice: FeatureNoticeItem) => {
    const strategy = NOTICE_DISPLAY_STRATEGY[notice.id]
    if (strategy === 'once' && isNoticeSeen(notice.id)) return
    if (get().notices.some((item) => item.id === notice.id)) return
    set((s) => ({ notices: [...s.notices, notice] }))
    // 旧版用 watch(activeNotice.id) 在成为可见提示时标记已看；React 版在入队即检查队首
    const head = get().notices[0]
    if (head && NOTICE_DISPLAY_STRATEGY[head.id] === 'once') markNoticeSeen(head.id)
  }

  const removeNotice = (id: FeatureNoticeId) => {
    set((s) => ({ notices: s.notices.filter((item) => item.id !== id) }))
  }

  return {
    notices: [],
    localModePathPromptSnoozed: false,
    localModeMenuDot: readBoolean(LOCAL_MODE_MENU_DOT_KEY, false),
    localModeIntroStatus: readIntroStatus(),
    globalNoticeSeenMap: readGlobalNoticeSeenMap(),

    activeNotice: () => (FEATURE_NOTICE_ENABLED ? get().notices[0] || null : null),
    localModeMenuDotVisible: () => (FEATURE_NOTICE_ENABLED ? get().localModeMenuDot : false),
    isLocalModeIntroPending: () =>
      FEATURE_NOTICE_ENABLED ? get().localModeIntroStatus === 'pending' : false,

    ensureLocalModeIntroNotice: () => {
      if (!FEATURE_NOTICE_ENABLED) return
      if (get().localModeIntroStatus !== 'pending') return
      enqueueNotice(LOCAL_MODE_INTRO_NOTICE)
    },

    ensureLocalModeDevicePathNotice: (required) => {
      if (!FEATURE_NOTICE_ENABLED) return
      if (!required) {
        removeNotice('local-mode-device-path')
        set({ localModePathPromptSnoozed: false })
        return
      }
      if (get().localModePathPromptSnoozed) return
      enqueueNotice(LOCAL_MODE_DEVICE_PATH_NOTICE)
    },

    markLocalModeIntroViewed: () => {
      if (!FEATURE_NOTICE_ENABLED) return
      writeIntroStatus('viewed')
      writeLocalModeDot(false)
      removeNotice('local-mode-intro')
    },

    markLocalModeIntroIgnored: () => {
      if (!FEATURE_NOTICE_ENABLED) return
      writeIntroStatus('ignored')
      writeLocalModeDot(true)
      removeNotice('local-mode-intro')
    },

    markDevicePathConfigured: () => {
      if (!FEATURE_NOTICE_ENABLED) return
      set({ localModePathPromptSnoozed: false })
      writeLocalModeDot(false)
      removeNotice('local-mode-device-path')
    },

    markDevicePathIgnored: () => {
      if (!FEATURE_NOTICE_ENABLED) return
      set({ localModePathPromptSnoozed: true })
      writeLocalModeDot(true)
      removeNotice('local-mode-device-path')
    },

    markLocalModeSettingsVisited: () => {
      if (!FEATURE_NOTICE_ENABLED) return
      writeLocalModeDot(false)
      if (get().localModeIntroStatus !== 'viewed') writeIntroStatus('viewed')
      removeNotice('local-mode-intro')
      set({ localModePathPromptSnoozed: false })
    }
  }
})
