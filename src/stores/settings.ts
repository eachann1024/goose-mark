import { defineStore } from 'pinia'
import { utoolsStorage } from '@/lib/utoolsStorage'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    autoGenerateAI: false, // 自动使用 AI 生成标题和描述
    gridColumns: 3,
    searchAutoExitMinutes: 5,
    groupTabsLayout: 'wrap' as 'wrap' | 'scroll',
    enableSubInput: false
  }),
  actions: {
    setAutoGenerateAI(value: boolean) {
      this.autoGenerateAI = value
    },
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
    }
  },
  persist: { storage: utoolsStorage }
})
