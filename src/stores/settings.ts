import { utoolsStorage } from '@/lib/utoolsStorage'
import { defineStore } from 'pinia'
import { DEFAULT_AI_MODEL } from '@/constants/ai'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    gridColumns: 3,
    searchAutoExitSeconds: 15,
    groupTabsLayout: 'wrap' as 'wrap' | 'scroll',
    autoCloseWindow: true,
    preferUtoolsBrowser: false,
    preferLocalSnapshotOnStartup: false,
    localMirrorDirectory: '',
    useCustomAiModel: false,
    customAiModel: DEFAULT_AI_MODEL,
    windowHeight: 560,
    // 首次用户引导是否已关闭
    onboardingDismissed: false,
    // 彩蛋：深色模式使用星空背景图（默认开启）
    easterEggEnabled: true,
    // 使用纯色背景替代星空背景（默认关闭，即默认星空）
    useSolidBackground: false,
    // 浅色模式背景风格（白色 / 贴近 uTools 灰，默认灰色）
    lightBackgroundStyle: 'utools' as 'white' | 'utools',
    autoMatchSearchIcons: true,
    skipFailedIconMatch: true,
    iconMatchLogs: [] as Array<{
      time: number
      scope: 'search' | 'missing'
      total: number
      success: number
      failed: number
      failedTitles: string[]
    }>
  }),
  actions: {
    setGridColumns(value: number) {
      this.gridColumns = Math.min(5, Math.max(2, Math.round(value)))
    },
    setGroupTabsLayout(mode: 'wrap' | 'scroll') {
      this.groupTabsLayout = mode === 'scroll' ? 'scroll' : 'wrap'
    },
    setSearchAutoExitSeconds(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.searchAutoExitSeconds = num < 0 ? 0 : Math.round(num)
    },
    setAutoCloseWindow(value: boolean) {
      this.autoCloseWindow = !!value
    },
    setPreferUtoolsBrowser(value: boolean) {
      this.preferUtoolsBrowser = !!value
    },
    setPreferLocalSnapshotOnStartup(value: boolean) {
      this.preferLocalSnapshotOnStartup = !!value
    },
    setLocalMirrorDirectory(value: string) {
      this.localMirrorDirectory = String(value || '').trim()
    },
    setUseCustomAiModel(value: boolean) {
      this.useCustomAiModel = !!value
      if (this.useCustomAiModel && !this.customAiModel.trim()) {
        this.customAiModel = DEFAULT_AI_MODEL
      }
    },
    setCustomAiModel(value: string) {
      this.customAiModel = String(value || '').trim()
    },
    setWindowHeight(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.windowHeight = num < 100 ? 100 : Math.round(num)
    },
    dismissOnboarding() {
      this.onboardingDismissed = true
    },
    setEasterEggEnabled(value: boolean) {
      this.easterEggEnabled = !!value
    },
    setUseSolidBackground(value: boolean) {
      this.useSolidBackground = !!value
    },
    setLightBackgroundStyle(value: 'white' | 'utools') {
      this.lightBackgroundStyle = value === 'utools' ? 'utools' : 'white'
    },
    setAutoMatchSearchIcons(value: boolean) {
      this.autoMatchSearchIcons = !!value
    },
    setSkipFailedIconMatch(value: boolean) {
      this.skipFailedIconMatch = !!value
    },
    addIconMatchLog(payload: {
      time: number
      scope: 'search' | 'missing'
      total: number
      success: number
      failed: number
      failedTitles: string[]
    }) {
      const next = [payload, ...this.iconMatchLogs]
      this.iconMatchLogs = next.slice(0, 50)
    },
    clearIconMatchLogs() {
      this.iconMatchLogs = []
    }
  },
  persist: {
    storage: utoolsStorage,
    omit: ['localMirrorDirectory'],
    // 移除 afterRestore，依靠 state() 的初始值
  }
})
