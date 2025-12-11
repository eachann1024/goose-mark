import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    autoGenerateAI: false // 自动使用 AI 生成标题和描述
  }),
  actions: {
    setAutoGenerateAI(value: boolean) {
      this.autoGenerateAI = value
    }
  },
  persist: true
})
