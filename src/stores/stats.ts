
import { utoolsStorage } from '@/lib/utoolsStorage'

type UsageType = 'open' | 'add' | 'click'

interface UsageEvent {
  type: UsageType
  timestamp: string
  bookmarkId?: string  // 仅 click 类型需要
}

export const useStatsStore = defineStore('stats', {
  state: () => ({
    usageEvents: [] as UsageEvent[]
  }),
  actions: {
    recordUse(type: 'open' | 'add') {
      const event: UsageEvent = {
        type,
        timestamp: new Date().toISOString()
      }
      this.usageEvents.push(event)
      this._trimEvents()
    },
    recordClick(bookmarkId: string) {
      const event: UsageEvent = {
        type: 'click',
        bookmarkId,
        timestamp: new Date().toISOString()
      }
      this.usageEvents.push(event)
      this._trimEvents()
    },
    _trimEvents() {
      // 限制容量，避免无限增长
      if (this.usageEvents.length > 2000) {
        this.usageEvents = this.usageEvents.slice(-1500)
      }
    }
  },
  persist: { storage: utoolsStorage }
})
