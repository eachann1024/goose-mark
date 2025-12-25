import { utoolsStorage } from '@/lib/utoolsStorage'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    gridColumns: 3,
    searchAutoExitMinutes: 5,
    groupTabsLayout: 'wrap' as 'wrap' | 'scroll',
    enableSubInput: false,
    autoCloseWindow: true,
    preferUtoolsBrowser: false,
    useCustomAiModel: false,
    customAiModel: '',
    enableShare: true,
    windowHeight: 700,
    // 首次用户引导是否已关闭
    onboardingDismissed: false
  }),
  actions: {
    setGridColumns(value: number) {
      this.gridColumns = Math.min(5, Math.max(2, Math.round(value)))
    },
    setGroupTabsLayout(mode: 'wrap' | 'scroll') {
      this.groupTabsLayout = mode === 'scroll' ? 'scroll' : 'wrap'
    },
    setSearchAutoExitMinutes(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.searchAutoExitMinutes = num < 0 ? 0 : Math.round(num)
    },
    setEnableSubInput(value: boolean) {
      this.enableSubInput = !!value
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
    setEnableShare(value: boolean) {
      this.enableShare = !!value
    },
    setWindowHeight(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.windowHeight = num < 100 ? 100 : Math.round(num)
    },
    dismissOnboarding() {
      this.onboardingDismissed = true
    }
  },
  persist: {
    storage: utoolsStorage,
    // 移除 afterRestore，依靠 state() 的初始值
  }
})
