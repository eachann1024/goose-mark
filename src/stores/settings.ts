import { utoolsStorage } from '@/lib/utoolsStorage'
import { defineStore } from 'pinia'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { trackEvent } from '@/services/analytics'
import type { AIModelOption, AISettingsLike } from '@/lib/aiProvider'
import { getAIProviderMode, getDefaultAISettings, getDefaultBaseURL, normalizeAIModelOptions } from '@/lib/aiProvider'

const getAISettingsPayload = (state: AISettingsLike) => ({
  provider_type: getAIProviderMode(state),
  selected_model_id: state.selectedModelId || DEFAULT_AI_MODEL,
  ai_enabled: state.enabled
})

const createAIState = () => {
  const defaults = getDefaultAISettings()
  return {
    aiEnabled: defaults.enabled,
    aiSelectedModelId: defaults.selectedModelId,
    aiUseCustomProvider: defaults.useCustomProvider,
    aiCustomBaseURL: defaults.customBaseURL,
    aiCustomApiKey: defaults.customApiKey,
    aiCustomModelOptions: defaults.customModelOptions
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    gridColumns: 3,
    autoCloseWindow: true,
    preferLocalSnapshotOnStartup: false,
    localMirrorDirectory: '',
    ...createAIState(),
    homeViewMode: 'list' as 'list' | 'grid' | 'cards',
    searchViewMode: 'list' as 'list' | 'grid',
    // 信息密度（紧凑 / 常规 / 舒适），驱动 <html data-density>
    density: 'regular' as 'compact' | 'regular' | 'comfy',
    // 自定义强调色（预设名；'coral' 为默认珊瑚，留空走 CSS 默认）
    accentColor: 'coral' as string,
    previewPanelWidth: 256,
    previewPanelCollapsed: false,
    previewPanelDescEditing: false,
    // 首次用户引导是否已关闭
    onboardingDismissed: false,
    // 彩蛋：深色模式使用星空背景图（默认开启）
    easterEggEnabled: true,
    // 使用纯色背景替代星空背景（默认关闭，即默认星空）
    useSolidBackground: false,
    // 浅色模式背景风格（白色 / 贴近 uTools 灰，默认灰色）
    lightBackgroundStyle: 'utools' as 'white' | 'utools',
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
  getters: {
    aiSettings: (state): AISettingsLike => ({
      enabled: state.aiEnabled,
      selectedModelId: state.aiSelectedModelId?.trim() || null,
      useCustomProvider: state.aiUseCustomProvider,
      customBaseURL: state.aiCustomBaseURL,
      customApiKey: state.aiCustomApiKey,
      customModelOptions: state.aiCustomModelOptions
    })
  },
  actions: {
    setGridColumns(value: number) {
      this.gridColumns = Math.min(5, Math.max(2, Math.round(value)))
      trackEvent('settings_change', { settingKey: 'gridColumns', value: this.gridColumns })
    },
    setAutoCloseWindow(value: boolean) {
      this.autoCloseWindow = !!value
      trackEvent('settings_change', { settingKey: 'autoCloseWindow', value: this.autoCloseWindow })
    },
    setPreferLocalSnapshotOnStartup(value: boolean) {
      this.preferLocalSnapshotOnStartup = !!value
    },
    setLocalMirrorDirectory(value: string) {
      this.localMirrorDirectory = String(value || '').trim()
    },
    setAiEnabled(value: boolean) {
      this.aiEnabled = !!value
      trackEvent('settings_change', { settingKey: 'aiEnabled', value: this.aiEnabled })
      trackEvent('ai_settings_changed', {
        action: 'toggle_enabled',
        ...getAISettingsPayload(this.aiSettings)
      })
    },
    setAiSelectedModelId(value: string | null) {
      this.aiSelectedModelId = String(value || '').trim() || DEFAULT_AI_MODEL
      trackEvent('settings_change', { settingKey: 'aiSelectedModelId', value: this.aiSelectedModelId })
      trackEvent('ai_settings_changed', {
        action: 'change_model',
        ...getAISettingsPayload(this.aiSettings)
      })
    },
    setAiCustomProviderEnabled(value: boolean) {
      this.aiUseCustomProvider = !!value
      trackEvent('settings_change', { settingKey: 'aiUseCustomProvider', value: this.aiUseCustomProvider })
      trackEvent('ai_settings_changed', {
        action: 'switch_provider',
        ...getAISettingsPayload(this.aiSettings)
      })
    },
    saveAiCustomConfig(config: {
      baseURL: string
      apiKey: string
      modelOptions: AIModelOption[]
    }) {
      const modelOptions = normalizeAIModelOptions(config.modelOptions)
      this.aiCustomBaseURL = config.baseURL.trim() || getDefaultBaseURL()
      this.aiCustomApiKey = config.apiKey.trim()
      this.aiCustomModelOptions = modelOptions
      if (!modelOptions.some(model => model.id === this.aiSelectedModelId)) {
        this.aiSelectedModelId = modelOptions[0]?.id ?? this.aiSelectedModelId ?? DEFAULT_AI_MODEL
      }
      trackEvent('settings_change', { settingKey: 'aiCustomConfigSaved' })
      trackEvent('ai_settings_changed', {
        action: 'save_custom_config',
        ...getAISettingsPayload(this.aiSettings)
      })
    },
    dismissOnboarding() {
      this.onboardingDismissed = true
    },
    setEasterEggEnabled(value: boolean) {
      this.easterEggEnabled = !!value
      trackEvent('theme_skin_change', { themeSkin: this.easterEggEnabled ? 'starry' : 'plain' })
    },
    setUseSolidBackground(value: boolean) {
      this.useSolidBackground = !!value
      trackEvent('theme_skin_change', { themeSkin: this.useSolidBackground ? 'solid' : 'starry' })
    },
    setLightBackgroundStyle(value: 'white' | 'utools') {
      this.lightBackgroundStyle = value === 'utools' ? 'utools' : 'white'
      trackEvent('theme_skin_change', { themeSkin: this.lightBackgroundStyle })
    },
    setAutoMatchSearchIcons(value: boolean) {
      this.autoMatchSearchIcons = !!value
      trackEvent('settings_change', { settingKey: 'autoMatchSearchIcons', value: this.autoMatchSearchIcons })
    },
    setSkipFailedIconMatch(value: boolean) {
      this.skipFailedIconMatch = !!value
      trackEvent('settings_change', { settingKey: 'skipFailedIconMatch', value: this.skipFailedIconMatch })
    },
    setHomeViewMode(mode: 'list' | 'grid' | 'cards') {
      this.homeViewMode = mode
      trackEvent('settings_change', { settingKey: 'homeViewMode', value: mode })
    },
    setDensity(value: 'compact' | 'regular' | 'comfy') {
      this.density = ['compact', 'regular', 'comfy'].includes(value) ? value : 'regular'
      trackEvent('settings_change', { settingKey: 'density', value: this.density })
    },
    setAccentColor(value: string) {
      this.accentColor = String(value || 'coral')
      trackEvent('settings_change', { settingKey: 'accentColor', value: this.accentColor })
    },
    setSearchViewMode(mode: 'list' | 'grid') {
      this.searchViewMode = mode
      trackEvent('settings_change', { settingKey: 'searchViewMode', value: mode })
    },
    setPreviewPanelWidth(width: number) {
      this.previewPanelWidth = Math.min(400, Math.max(200, Math.round(width)))
    },
    setPreviewPanelCollapsed(value: boolean) {
      this.previewPanelCollapsed = !!value
      trackEvent('settings_change', { settingKey: 'previewPanelCollapsed', value: this.previewPanelCollapsed })
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
    omit: ['localMirrorDirectory'],
    afterHydrate: (context) => {
      const state = context.store.$state as Record<string, unknown>
      const nextPatch: Record<string, unknown> = {}

      if (typeof state.aiSelectedModelId !== 'string' || !state.aiSelectedModelId.trim()) {
        nextPatch.aiSelectedModelId = DEFAULT_AI_MODEL
      }

      if (typeof state.aiEnabled !== 'boolean') {
        nextPatch.aiEnabled = true
      }

      if (typeof state.aiUseCustomProvider !== 'boolean') {
        nextPatch.aiUseCustomProvider = false
      }

      if (typeof state.aiCustomBaseURL !== 'string') {
        nextPatch.aiCustomBaseURL = getDefaultBaseURL()
      }

      if (typeof state.aiCustomApiKey !== 'string') {
        nextPatch.aiCustomApiKey = ''
      }

      const rawCustomModelOptions = Array.isArray(state.aiCustomModelOptions)
        ? state.aiCustomModelOptions
        : null

      if (!rawCustomModelOptions) {
        nextPatch.aiCustomModelOptions = []
      } else {
        const normalizedModelOptions = normalizeAIModelOptions(rawCustomModelOptions as AIModelOption[])
        if (JSON.stringify(normalizedModelOptions) !== JSON.stringify(rawCustomModelOptions)) {
          nextPatch.aiCustomModelOptions = normalizedModelOptions
        }
      }

      if (Object.keys(nextPatch).length > 0) {
        context.store.$patch(nextPatch as any)
        ;(context.store as typeof context.store & { $persist?: () => void }).$persist?.()
      }
    }
  }
})
