import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createPiniaCompatStorage } from '@/stores/piniaCompatPersist'

/**
 * 使用统计 store（Zustand）
 * --------------------------------------------------------------------------
 * 数据契约（与旧版 Pinia 'stats' store 一致）：
 *   - 持久化 key = 'stats'
 *   - 持久化字段 = usageEvents
 *
 * 说明：这是本地使用记录（驱动「最近/常用」等业务排序），不是外部埋点上报，
 * 因此保留。Clarity / analytics 等上报已移除。
 */

type UsageType = 'open' | 'add' | 'click'

export interface UsageEvent {
  type: UsageType
  timestamp: string
  bookmarkId?: string // 仅 click 类型需要
}

export interface StatsState {
  usageEvents: UsageEvent[]
}

export interface StatsActions {
  recordUse: (type: 'open' | 'add') => void
  recordClick: (bookmarkId: string) => void
}

export type StatsStore = StatsState & StatsActions

const MAX_EVENTS = 2000
const TRIM_TO = 1500

const trim = (events: UsageEvent[]): UsageEvent[] =>
  events.length > MAX_EVENTS ? events.slice(-TRIM_TO) : events

export const useStatsStore = create<StatsStore>()(
  persist(
    (set, get) => ({
      usageEvents: [],
      recordUse: (type) =>
        set({ usageEvents: trim([...get().usageEvents, { type, timestamp: new Date().toISOString() }]) }),
      recordClick: (bookmarkId) =>
        set({
          usageEvents: trim([...get().usageEvents, { type: 'click', bookmarkId, timestamp: new Date().toISOString() }])
        })
    }),
    {
      name: 'stats', // 持久化 key（与旧版 Pinia $id 一致）
      storage: createPiniaCompatStorage<StatsStore>(),
      partialize: (state) => ({ usageEvents: state.usageEvents }) as StatsStore
    }
  )
)
