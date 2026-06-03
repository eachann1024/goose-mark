import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import type { AIModelOption, AISettingsLike } from '@/lib/aiProvider'
import { getDefaultAISettings, getDefaultBaseURL, normalizeAIModelOptions } from '@/lib/aiProvider'
import { createPiniaCompatStorage } from '@/stores/piniaCompatPersist'

/**
 * 设置 store（Zustand）
 * --------------------------------------------------------------------------
 * 数据契约（与旧版 Pinia 'settings' store 一致）：
 *   - 持久化 key = 'settings'
 *   - 持久化字段 = 全部 state，但排除 localMirrorDirectory（旧版 persist.omit）
 *   - 水合后做字段兜底归一化（旧版 persist.afterHydrate）
 *
 * 说明：原 setter 中的 trackEvent 上报已全部移除（用户要求剥离埋点），仅保留业务赋值逻辑。
 */

export type ViewMode = 'list' | 'grid' | 'cards'
export type Density = 'compact' | 'regular' | 'comfy'
export type LightBackgroundStyle = 'white' | 'utools'

export interface IconMatchLog {
  time: number
  scope: 'search' | 'missing'
  total: number
  success: number
  failed: number
  failedTitles: string[]
}

export interface SettingsState {
  gridColumns: number
  autoCloseWindow: boolean
  preferLocalSnapshotOnStartup: boolean
  localMirrorDirectory: string
  aiEnabled: boolean
  aiSelectedModelId: string
  aiUseCustomProvider: boolean
  aiCustomBaseURL: string
  aiCustomApiKey: string
  aiCustomModelOptions: AIModelOption[]
  homeViewMode: ViewMode
  searchViewMode: 'list' | 'grid'
  density: Density
  accentColor: string
  previewPanelWidth: number
  previewPanelCollapsed: boolean
  previewPanelDescEditing: boolean
  onboardingDismissed: boolean
  easterEggEnabled: boolean
  useSolidBackground: boolean
  lightBackgroundStyle: LightBackgroundStyle
  autoMatchSearchIcons: boolean
  skipFailedIconMatch: boolean
  iconMatchLogs: IconMatchLog[]
}

export interface SettingsActions {
  setGridColumns: (value: number) => void
  setAutoCloseWindow: (value: boolean) => void
  setPreferLocalSnapshotOnStartup: (value: boolean) => void
  setLocalMirrorDirectory: (value: string) => void
  setAiEnabled: (value: boolean) => void
  setAiSelectedModelId: (value: string | null) => void
  setAiCustomProviderEnabled: (value: boolean) => void
  saveAiCustomConfig: (config: { baseURL: string; apiKey: string; modelOptions: AIModelOption[] }) => void
  dismissOnboarding: () => void
  setEasterEggEnabled: (value: boolean) => void
  setUseSolidBackground: (value: boolean) => void
  setLightBackgroundStyle: (value: LightBackgroundStyle) => void
  setAutoMatchSearchIcons: (value: boolean) => void
  setSkipFailedIconMatch: (value: boolean) => void
  setHomeViewMode: (mode: ViewMode) => void
  setDensity: (value: Density) => void
  setAccentColor: (value: string) => void
  setSearchViewMode: (mode: 'list' | 'grid') => void
  setPreviewPanelWidth: (width: number) => void
  setPreviewPanelCollapsed: (value: boolean) => void
  setPreviewPanelDescEditing: (value: boolean) => void
  addIconMatchLog: (payload: IconMatchLog) => void
  clearIconMatchLogs: () => void
}

export type SettingsStore = SettingsState & SettingsActions

const createInitialState = (): SettingsState => {
  const defaults = getDefaultAISettings()
  return {
    gridColumns: 3,
    autoCloseWindow: true,
    preferLocalSnapshotOnStartup: false,
    localMirrorDirectory: '',
    aiEnabled: defaults.enabled,
    aiSelectedModelId: defaults.selectedModelId ?? DEFAULT_AI_MODEL,
    aiUseCustomProvider: defaults.useCustomProvider,
    aiCustomBaseURL: defaults.customBaseURL,
    aiCustomApiKey: defaults.customApiKey,
    aiCustomModelOptions: defaults.customModelOptions,
    homeViewMode: 'list',
    searchViewMode: 'list',
    density: 'regular',
    accentColor: 'coral',
    previewPanelWidth: 256,
    previewPanelCollapsed: false,
    previewPanelDescEditing: false,
    onboardingDismissed: false,
    easterEggEnabled: true,
    useSolidBackground: false,
    lightBackgroundStyle: 'utools',
    autoMatchSearchIcons: true,
    skipFailedIconMatch: true,
    iconMatchLogs: []
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setGridColumns: (value) => set({ gridColumns: Math.min(5, Math.max(2, Math.round(value))) }),
      setAutoCloseWindow: (value) => set({ autoCloseWindow: !!value }),
      setPreferLocalSnapshotOnStartup: (value) => set({ preferLocalSnapshotOnStartup: !!value }),
      setLocalMirrorDirectory: (value) => set({ localMirrorDirectory: String(value || '').trim() }),
      setAiEnabled: (value) => set({ aiEnabled: !!value }),
      setAiSelectedModelId: (value) => set({ aiSelectedModelId: String(value || '').trim() || DEFAULT_AI_MODEL }),
      setAiCustomProviderEnabled: (value) => set({ aiUseCustomProvider: !!value }),
      saveAiCustomConfig: (config) => {
        const modelOptions = normalizeAIModelOptions(config.modelOptions)
        const current = get()
        let nextSelected = current.aiSelectedModelId
        if (!modelOptions.some((model) => model.id === nextSelected)) {
          nextSelected = modelOptions[0]?.id ?? nextSelected ?? DEFAULT_AI_MODEL
        }
        set({
          aiCustomBaseURL: config.baseURL.trim() || getDefaultBaseURL(),
          aiCustomApiKey: config.apiKey.trim(),
          aiCustomModelOptions: modelOptions,
          aiSelectedModelId: nextSelected
        })
      },
      dismissOnboarding: () => set({ onboardingDismissed: true }),
      setEasterEggEnabled: (value) => set({ easterEggEnabled: !!value }),
      setUseSolidBackground: (value) => set({ useSolidBackground: !!value }),
      setLightBackgroundStyle: (value) => set({ lightBackgroundStyle: value === 'utools' ? 'utools' : 'white' }),
      setAutoMatchSearchIcons: (value) => set({ autoMatchSearchIcons: !!value }),
      setSkipFailedIconMatch: (value) => set({ skipFailedIconMatch: !!value }),
      setHomeViewMode: (mode) => set({ homeViewMode: mode }),
      setDensity: (value) => set({ density: ['compact', 'regular', 'comfy'].includes(value) ? value : 'regular' }),
      setAccentColor: (value) => set({ accentColor: String(value || 'coral') }),
      setSearchViewMode: (mode) => set({ searchViewMode: mode }),
      setPreviewPanelWidth: (width) => set({ previewPanelWidth: Math.min(400, Math.max(200, Math.round(width))) }),
      setPreviewPanelCollapsed: (value) => set({ previewPanelCollapsed: !!value }),
      setPreviewPanelDescEditing: (value) => set({ previewPanelDescEditing: !!value }),
      addIconMatchLog: (payload) => set({ iconMatchLogs: [payload, ...get().iconMatchLogs].slice(0, 50) }),
      clearIconMatchLogs: () => set({ iconMatchLogs: [] })
    }),
    {
      name: 'settings', // 持久化 key（与旧版 Pinia $id 一致）
      storage: createPiniaCompatStorage<SettingsStore>(),
      // 旧版 persist.omit: ['localMirrorDirectory'] —— 用 partialize 排除
      partialize: (state) => {
        const { localMirrorDirectory: _omit, ...rest } = state
        return rest as SettingsStore
      },
      // 旧版 persist.afterHydrate —— 字段兜底归一化
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const patch: Partial<SettingsState> = {}

        if (typeof state.aiSelectedModelId !== 'string' || !state.aiSelectedModelId.trim()) {
          patch.aiSelectedModelId = DEFAULT_AI_MODEL
        }
        if (typeof state.aiEnabled !== 'boolean') patch.aiEnabled = true
        if (typeof state.aiUseCustomProvider !== 'boolean') patch.aiUseCustomProvider = false
        if (typeof state.aiCustomBaseURL !== 'string') patch.aiCustomBaseURL = getDefaultBaseURL()
        if (typeof state.aiCustomApiKey !== 'string') patch.aiCustomApiKey = ''

        const rawModelOptions = Array.isArray(state.aiCustomModelOptions) ? state.aiCustomModelOptions : null
        if (!rawModelOptions) {
          patch.aiCustomModelOptions = []
        } else {
          const normalized = normalizeAIModelOptions(rawModelOptions)
          if (JSON.stringify(normalized) !== JSON.stringify(rawModelOptions)) {
            patch.aiCustomModelOptions = normalized
          }
        }

        if (Object.keys(patch).length > 0) {
          useSettingsStore.setState(patch as Partial<SettingsStore>)
        }
      }
    }
  )
)

// ---- 选择器（等价旧版 getters）----

export const selectAiSettings = (s: SettingsStore): AISettingsLike => ({
  enabled: s.aiEnabled,
  selectedModelId: s.aiSelectedModelId?.trim() || null,
  useCustomProvider: s.aiUseCustomProvider,
  customBaseURL: s.aiCustomBaseURL,
  customApiKey: s.aiCustomApiKey,
  customModelOptions: s.aiCustomModelOptions
})
