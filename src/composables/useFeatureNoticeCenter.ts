import { computed, ref } from 'vue'

export type FeatureNoticeId = 'local-mode-intro' | 'local-mode-device-path'

export interface FeatureNoticeItem {
  id: FeatureNoticeId
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
}

type LocalModeIntroStatus = 'pending' | 'ignored' | 'viewed'

const LOCAL_MODE_INTRO_STATUS_KEY = 'goose-marks.feature.local-mode.intro.status.v1'
const LOCAL_MODE_MENU_DOT_KEY = 'goose-marks.feature.local-mode.menu-dot.v1'

const notices = ref<FeatureNoticeItem[]>([])
const localModePathPromptSnoozed = ref(false)
const localModeMenuDot = ref(readBoolean(LOCAL_MODE_MENU_DOT_KEY, false))
const localModeIntroStatus = ref<LocalModeIntroStatus>(readIntroStatus())

const LOCAL_MODE_INTRO_NOTICE: FeatureNoticeItem = {
  id: 'local-mode-intro',
  title: '新增本地备份',
  description: '可配合扩展使用，支持启动时优先用本地备份恢复当前数据。',
  primaryLabel: '立即查看',
  secondaryLabel: '暂时忽略'
}

const LOCAL_MODE_DEVICE_PATH_NOTICE: FeatureNoticeItem = {
  id: 'local-mode-device-path',
  title: '请为当前设备选择备份路径',
  description: '检测到“本地优先”已开启，但当前设备还未设置本地存储目录。',
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

const enqueueNotice = (notice: FeatureNoticeItem) => {
  if (notices.value.some(item => item.id === notice.id)) return
  notices.value.push(notice)
}

const removeNotice = (id: FeatureNoticeId) => {
  const idx = notices.value.findIndex(item => item.id === id)
  if (idx === -1) return
  notices.value.splice(idx, 1)
}

export function useFeatureNoticeCenter() {
  const activeNotice = computed(() => notices.value[0] || null)
  const localModeMenuDotVisible = computed(() => localModeMenuDot.value)

  const ensureLocalModeIntroNotice = () => {
    if (localModeIntroStatus.value !== 'pending') return
    enqueueNotice(LOCAL_MODE_INTRO_NOTICE)
  }

  const ensureLocalModeDevicePathNotice = (required: boolean) => {
    if (!required) {
      removeNotice('local-mode-device-path')
      localModePathPromptSnoozed.value = false
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
    removeNotice('local-mode-device-path')
  }

  const markDevicePathIgnored = () => {
    localModePathPromptSnoozed.value = true
    writeLocalModeDot(true)
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
    ensureLocalModeIntroNotice,
    ensureLocalModeDevicePathNotice,
    markLocalModeIntroViewed,
    markLocalModeIntroIgnored,
    markDevicePathConfigured,
    markDevicePathIgnored,
    markLocalModeSettingsVisited
  }
}
