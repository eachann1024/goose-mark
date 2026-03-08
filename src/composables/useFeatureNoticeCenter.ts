import { computed, ref, watch } from 'vue'
import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'

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

const notices = ref<FeatureNoticeItem[]>([])
const localModePathPromptSnoozed = ref(false)
const localModeMenuDot = ref(readBoolean(LOCAL_MODE_MENU_DOT_KEY, false))
const localModeIntroStatus = ref<LocalModeIntroStatus>(readIntroStatus())
const globalNoticeSeenMap = ref<Record<FeatureNoticeId, boolean>>(readGlobalNoticeSeenMap())

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

const writeIntroStatus = (status: LocalModeIntroStatus) => {
  localModeIntroStatus.value = status
  try {
    utoolsStorage.setItem(LOCAL_MODE_INTRO_STATUS_KEY, status)
  } catch {}
}

const writeLocalModeDot = (visible: boolean) => {
  localModeMenuDot.value = visible
  try {
    utoolsStorage.setItem(LOCAL_MODE_MENU_DOT_KEY, visible ? '1' : '0')
  } catch {}
}

const writeGlobalNoticeSeenMap = (next: Record<FeatureNoticeId, boolean>) => {
  globalNoticeSeenMap.value = next
  try {
    utoolsStorage.setItem(GLOBAL_NOTICE_SEEN_KEY, JSON.stringify(next))
  } catch {}
}

const isNoticeSeen = (id: FeatureNoticeId) => !!globalNoticeSeenMap.value[id]

const markNoticeSeen = (id: FeatureNoticeId) => {
  if (isNoticeSeen(id)) return
  writeGlobalNoticeSeenMap({
    ...globalNoticeSeenMap.value,
    [id]: true
  })
}

const enqueueNotice = (notice: FeatureNoticeItem) => {
  const strategy = NOTICE_DISPLAY_STRATEGY[notice.id]
  if (strategy === 'once' && isNoticeSeen(notice.id)) return
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
  const activeNotice = computed<FeatureNoticeItem | null>(() => (
    FEATURE_NOTICE_ENABLED ? activeNoticeRef.value : null
  ))
  const localModeMenuDotVisible = computed(() => (
    FEATURE_NOTICE_ENABLED ? localModeMenuDot.value : false
  ))
  const isLocalModeIntroPending = computed(() => (
    FEATURE_NOTICE_ENABLED ? localModeIntroStatus.value === 'pending' : false
  ))

  const ensureLocalModeIntroNotice = () => {
    if (!FEATURE_NOTICE_ENABLED) return
    if (localModeIntroStatus.value !== 'pending') return
    enqueueNotice(LOCAL_MODE_INTRO_NOTICE)
  }

  const ensureLocalModeDevicePathNotice = (required: boolean) => {
    if (!FEATURE_NOTICE_ENABLED) return
    if (!required) {
      removeNotice('local-mode-device-path')
      localModePathPromptSnoozed.value = false
      return
    }
    if (localModePathPromptSnoozed.value) return
    enqueueNotice(LOCAL_MODE_DEVICE_PATH_NOTICE)
  }

  const markLocalModeIntroViewed = () => {
    if (!FEATURE_NOTICE_ENABLED) return
    writeIntroStatus('viewed')
    writeLocalModeDot(false)
    removeNotice('local-mode-intro')
  }

  const markLocalModeIntroIgnored = () => {
    if (!FEATURE_NOTICE_ENABLED) return
    writeIntroStatus('ignored')
    writeLocalModeDot(true)
    removeNotice('local-mode-intro')
  }

  const markDevicePathConfigured = () => {
    if (!FEATURE_NOTICE_ENABLED) return
    localModePathPromptSnoozed.value = false
    writeLocalModeDot(false)
    removeNotice('local-mode-device-path')
  }

  const markDevicePathIgnored = () => {
    if (!FEATURE_NOTICE_ENABLED) return
    localModePathPromptSnoozed.value = true
    writeLocalModeDot(true)
    removeNotice('local-mode-device-path')
  }

  const markLocalModeSettingsVisited = () => {
    if (!FEATURE_NOTICE_ENABLED) return
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
