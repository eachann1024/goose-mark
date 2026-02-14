import { utoolsStorage } from '@/lib/utoolsStorage'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    gridColumns: 3,
    searchAutoExitSeconds: 15,
    groupTabsLayout: 'wrap' as 'wrap' | 'scroll',
    autoCloseWindow: true,
    preferUtoolsBrowser: false,
    useCustomAiModel: false,
    customAiModel: '',
    windowHeight: 700,
    // 首次用户引导是否已关闭
    onboardingDismissed: false,
    // 彩蛋：深色模式使用星空背景图（默认开启）
    easterEggEnabled: true,
    // 使用纯色背景替代星空背景（默认关闭）
    useSolidBackground: false,
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
    setUseCustomAiModel(value: boolean) {
      this.useCustomAiModel = !!value
    },
    setCustomAiModel(value: string) {
      this.customAiModel = String(value || '')
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
    // 移除 afterRestore，依靠 state() 的初始值
  }
})
