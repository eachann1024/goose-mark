import { computed, ref, watch } from 'vue'

export type FeatureNoticeId = 'local-mode-intro' | 'local-mode-device-path'

export interface FeatureNoticeItem {
  id: FeatureNoticeId
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
}

type LocalModeIntroStatus = 'pending' | 'ignored' | 'viewed'
type NoticeDisplayStrategy = 'once' | 'conditional'

const LOCAL_MODE_INTRO_STATUS_KEY = 'goose-marks.feature.local-mode.intro.status.v1'
const LOCAL_MODE_MENU_DOT_KEY = 'goose-marks.feature.local-mode.menu-dot.v1'
const GLOBAL_NOTICE_SEEN_KEY = 'goose-marks.feature.global-notice-seen.v1'
const DEVICE_PATH_PROMPT_COOLDOWN_UNTIL_KEY = 'goose-marks.feature.local-mode.device-path.cooldown-until.v1'
const DEVICE_PATH_PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000

const notices = ref<FeatureNoticeItem[]>([])
const localModePathPromptSnoozed = ref(false)
const localModeMenuDot = ref(readBoolean(LOCAL_MODE_MENU_DOT_KEY, false))
const localModeIntroStatus = ref<LocalModeIntroStatus>(readIntroStatus())
const globalNoticeSeenMap = ref<Record<FeatureNoticeId, boolean>>(readGlobalNoticeSeenMap())
const devicePathPromptCooldownUntil = ref(readNumber(DEVICE_PATH_PROMPT_COOLDOWN_UNTIL_KEY, 0))

const NOTICE_DISPLAY_STRATEGY: Record<FeatureNoticeId, NoticeDisplayStrategy> = {
  'local-mode-intro': 'once',
  'local-mode-device-path': 'conditional'
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
  if (typeof window === 'undefined') return 'pending'
  try {
    const raw = window.localStorage.getItem(LOCAL_MODE_INTRO_STATUS_KEY)
    return raw === 'ignored' || raw === 'viewed' ? raw : 'pending'
  } catch {
    return 'pending'
  }
}

function readBoolean(key: string, fallback = false): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
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
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(GLOBAL_NOTICE_SEEN_KEY)
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

function readNumber(key: string, fallback = 0): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const num = Number(raw)
    return Number.isFinite(num) ? num : fallback
  } catch {
    return fallback
  }
}

const writeIntroStatus = (status: LocalModeIntroStatus) => {
  localModeIntroStatus.value = status
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_MODE_INTRO_STATUS_KEY, status)
  } catch {}
}

const writeLocalModeDot = (visible: boolean) => {
  localModeMenuDot.value = visible
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_MODE_MENU_DOT_KEY, visible ? '1' : '0')
  } catch {}
}

const writeGlobalNoticeSeenMap = (next: Record<FeatureNoticeId, boolean>) => {
  globalNoticeSeenMap.value = next
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GLOBAL_NOTICE_SEEN_KEY, JSON.stringify(next))
  } catch {}
}

const writeDevicePathPromptCooldownUntil = (timestamp: number) => {
  devicePathPromptCooldownUntil.value = timestamp
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEVICE_PATH_PROMPT_COOLDOWN_UNTIL_KEY, String(timestamp))
  } catch {}
}

const isNoticeSeen = (id: FeatureNoticeId) => !!globalNoticeSeenMap.value[id]
const isDevicePathPromptCoolingDown = () => Date.now() < devicePathPromptCooldownUntil.value

const markNoticeSeen = (id: FeatureNoticeId) => {
  if (isNoticeSeen(id)) return
  writeGlobalNoticeSeenMap({
    ...globalNoticeSeenMap.value,
    [id]: true
  })
}

const setDevicePathPromptCooldown = (duration = DEVICE_PATH_PROMPT_COOLDOWN_MS) => {
  writeDevicePathPromptCooldownUntil(Date.now() + duration)
}

const clearDevicePathPromptCooldown = () => {
  writeDevicePathPromptCooldownUntil(0)
}

const enqueueNotice = (notice: FeatureNoticeItem) => {
  const strategy = NOTICE_DISPLAY_STRATEGY[notice.id]
  if (strategy === 'once' && isNoticeSeen(notice.id)) return
  if (notice.id === 'local-mode-device-path' && isDevicePathPromptCoolingDown()) return
  if (notices.value.some(item => item.id === notice.id)) return
  notices.value.push(notice)
}

const removeNotice = (id: FeatureNoticeId) => {
  const idx = notices.value.findIndex(item => item.id === id)
  if (idx === -1) return
  notices.value.splice(idx, 1)
}

const activeNoticeRef = computed(() => notices.value[0] || null)

watch(
  () => activeNoticeRef.value?.id,
  (id) => {
    if (!id) return
    if (NOTICE_DISPLAY_STRATEGY[id] === 'once') {
      // 真正成为当前可见提示时再记录“已展示”
      markNoticeSeen(id)
    }
  },
  { immediate: true }
)

export function useFeatureNoticeCenter() {
  const activeNotice = activeNoticeRef
  const localModeMenuDotVisible = computed(() => localModeMenuDot.value)
  const isLocalModeIntroPending = computed(() => localModeIntroStatus.value === 'pending')

  const ensureLocalModeIntroNotice = () => {
    if (localModeIntroStatus.value !== 'pending') return
    enqueueNotice(LOCAL_MODE_INTRO_NOTICE)
  }

  const ensureLocalModeDevicePathNotice = (required: boolean) => {
    if (!required) {
      removeNotice('local-mode-device-path')
      localModePathPromptSnoozed.value = false
      clearDevicePathPromptCooldown()
      return
    }
    if (localModePathPromptSnoozed.value) return
    enqueueNotice(LOCAL_MODE_DEVICE_PATH_NOTICE)
  }

  const markLocalModeIntroViewed = () => {
    writeIntroStatus('viewed')
    writeLocalModeDot(false)
    removeNotice('local-mode-intro')
  }

  const markLocalModeIntroIgnored = () => {
    writeIntroStatus('ignored')
    writeLocalModeDot(true)
    removeNotice('local-mode-intro')
  }

  const markDevicePathConfigured = () => {
    localModePathPromptSnoozed.value = false
    writeLocalModeDot(false)
    clearDevicePathPromptCooldown()
    removeNotice('local-mode-device-path')
  }

  const markDevicePathIgnored = () => {
    localModePathPromptSnoozed.value = true
    writeLocalModeDot(true)
    setDevicePathPromptCooldown()
    removeNotice('local-mode-device-path')
  }

  const markLocalModeSettingsVisited = () => {
    writeLocalModeDot(false)
    if (localModeIntroStatus.value !== 'viewed') {
      writeIntroStatus('viewed')
    }
    removeNotice('local-mode-intro')
    localModePathPromptSnoozed.value = false
  }

  return {
    activeNotice,
    localModeMenuDotVisible,
    isLocalModeIntroPending,
    ensureLocalModeIntroNotice,
    ensureLocalModeDevicePathNotice,
    markLocalModeIntroViewed,
    markLocalModeIntroIgnored,
    markDevicePathConfigured,
    markDevicePathIgnored,
    markLocalModeSettingsVisited
  }
}
