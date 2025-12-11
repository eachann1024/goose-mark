import { defineStore } from 'pinia'
import { utoolsStorage } from '@/lib/utoolsStorage'

type UsageType = 'open' | 'add'

interface UsageEvent {
  type: UsageType
  timestamp: string
}

export const useStatsStore = defineStore('stats', {
  state: () => ({
    usageEvents: [] as UsageEvent[]
  }),
  actions: {
    recordUse(type: UsageType) {
      const event: UsageEvent = {
        type,
        timestamp: new Date().toISOString()
      }
      this.usageEvents.push(event)
      // 限制容量，避免无限增长
      if (this.usageEvents.length > 1000) {
        this.usageEvents.shift()
      }
    }
  },
  persist: { storage: utoolsStorage }
})
