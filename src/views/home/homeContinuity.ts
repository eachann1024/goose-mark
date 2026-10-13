import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'

export const HOME_CONTINUITY_KEY = 'goose-marks.home-continuity'


/** 主列表滚动：默认始终记住（不依赖「面板连贯模式」） */
export const HOME_SCROLL_KEY = 'goose-marks.home-scroll-top'


/** 一级分组各自的滚动/选中态（切 Tab 不共用、不丢） */
export const HOME_GROUP_PANEL_KEY = 'goose-marks.home-group-panel'



export interface HomeContinuityState {
  activeGroupId: string
  activeSubId: string | null
  selectedId: string | null
  scrollTop: number
  updatedAt: number
}



export interface GroupPanelState {
  scrollTop: number
  activeSubId: string | null
  selectedId: string | null
}



export type GroupPanelMap = Record<string, GroupPanelState>



export const readHomeContinuityState = (): HomeContinuityState | null => {
  const raw = getPersistentItem(HOME_CONTINUITY_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HomeContinuityState>
    return {
      activeGroupId: typeof parsed.activeGroupId === 'string' ? parsed.activeGroupId : '',
      activeSubId: typeof parsed.activeSubId === 'string' ? parsed.activeSubId : null,
      selectedId: typeof parsed.selectedId === 'string' ? parsed.selectedId : null,
      scrollTop: Number.isFinite(Number(parsed.scrollTop)) ? Math.max(0, Number(parsed.scrollTop)) : 0,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0
    }
  } catch {
    return null
  }
}



export const sanitizeScrollTop = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.max(0, Math.round(n)) : 0
}



export const readGroupPanelMap = (): GroupPanelMap => {
  const raw = getPersistentItem(HOME_GROUP_PANEL_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<GroupPanelState>>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: GroupPanelMap = {}
    for (const [groupId, state] of Object.entries(parsed)) {
      if (!groupId || !state || typeof state !== 'object') continue
      out[groupId] = {
        scrollTop: sanitizeScrollTop(state.scrollTop),
        activeSubId: typeof state.activeSubId === 'string' ? state.activeSubId : null,
        selectedId: typeof state.selectedId === 'string' ? state.selectedId : null,
      }
    }
    return out
  } catch {
    return {}
  }
}



export const writeGroupPanelMap = (map: GroupPanelMap) => {
  utoolsStorage.setItem(HOME_GROUP_PANEL_KEY, JSON.stringify(map))
}



export const readHomeScrollTop = (groupId?: string | null): number => {
  if (groupId) {
    const mapped = readGroupPanelMap()[groupId]?.scrollTop
    if (typeof mapped === 'number') return mapped
  }
  const raw = getPersistentItem(HOME_SCROLL_KEY)
  if (raw == null || raw === '') {
    // 兼容旧连贯数据里的 scrollTop
    const legacy = readHomeContinuityState()?.scrollTop
    return typeof legacy === 'number' && legacy > 0 ? legacy : 0
  }
  return sanitizeScrollTop(raw)
}



export const writeHomeScrollTop = (top: number) => {
  const v = sanitizeScrollTop(top)
  utoolsStorage.setItem(HOME_SCROLL_KEY, String(v))
}
