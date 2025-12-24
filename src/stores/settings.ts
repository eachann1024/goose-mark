
import { utoolsStorage } from '@/lib/utoolsStorage'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    gridColumns: 3,
    searchAutoExitMinutes: 5,
    groupTabsLayout: 'wrap' as 'wrap' | 'scroll',
    enableSubInput: false,
    autoCloseWindow: true, // 独立窗口模式下，打开标签后自动关闭
    preferUtoolsBrowser: false,
    useCustomAiModel: false,
    customAiModel: '',
    windowHeight: 700
  }),
  actions: {
    setGridColumns(value: number) {
      const next = Math.min(5, Math.max(2, Math.round(value)))
      this.gridColumns = next
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
    setWindowHeight(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.windowHeight = num < 100 ? 100 : Math.round(num)
    }
  },
  persist: { storage: utoolsStorage }
})
