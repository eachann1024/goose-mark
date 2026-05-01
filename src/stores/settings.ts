import { utoolsStorage } from '@/lib/utoolsStorage'
import { defineStore } from 'pinia'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { trackEvent } from '@/services/analytics'
import type { AIModelOption, CustomAIProtocol, AISettingsLike } from '@/lib/aiProvider'
import { getAIProviderMode, getDefaultAISettings, getDefaultBaseURL, normalizeAIModelOptions } from '@/lib/aiProvider'

const getAISettingsPayload = (state: AISettingsLike) => ({
  provider_type: getAIProviderMode(state),
  custom_protocol: state.useCustomProvider ? state.customProtocol : 'none',
  selected_model_id: state.selectedModelId || DEFAULT_AI_MODEL,
  ai_enabled: state.enabled
})

const createAIState = () => {
  const defaults = getDefaultAISettings()
  return {
    aiEnabled: defaults.enabled,
    aiSelectedModelId: defaults.selectedModelId,
    aiUseCustomProvider: defaults.useCustomProvider,
    aiCustomProtocol: defaults.customProtocol,
    aiCustomOpenAIBaseURL: getDefaultBaseURL('openai'),
    aiCustomClaudeBaseURL: getDefaultBaseURL('claude'),
    aiCustomOpenAIApiKey: '',
    aiCustomClaudeApiKey: '',
    aiCustomBaseURL: defaults.customBaseURL,
    aiCustomApiKey: defaults.customApiKey,
    aiCustomModelOptions: defaults.customModelOptions
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    gridColumns: 3,
    searchAutoExitSeconds: 15,
    groupTabsLayout: 'wrap' as 'wrap' | 'scroll',
    autoCloseWindow: true,
    preferUtoolsBrowser: false,
    preferLocalSnapshotOnStartup: false,
    localMirrorDirectory: '',
    ...createAIState(),
    windowHeight: 560,
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
    agingCardEnabled: false,
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
      customProtocol: state.aiCustomProtocol,
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
    setGroupTabsLayout(mode: 'wrap' | 'scroll') {
      this.groupTabsLayout = mode === 'scroll' ? 'scroll' : 'wrap'
      trackEvent('settings_change', { settingKey: 'groupTabsLayout', value: this.groupTabsLayout })
    },
    setSearchAutoExitSeconds(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.searchAutoExitSeconds = num < 0 ? 0 : Math.round(num)
      trackEvent('settings_change', { settingKey: 'searchAutoExitSeconds', value: this.searchAutoExitSeconds })
    },
    setAutoCloseWindow(value: boolean) {
      this.autoCloseWindow = !!value
      trackEvent('settings_change', { settingKey: 'autoCloseWindow', value: this.autoCloseWindow })
    },
    setPreferUtoolsBrowser(value: boolean) {
      this.preferUtoolsBrowser = !!value
      trackEvent('settings_change', { settingKey: 'preferUtoolsBrowser', value: this.preferUtoolsBrowser })
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
      protocol: CustomAIProtocol
      baseURL: string
      apiKey: string
      modelOptions: AIModelOption[]
    }) {
      const modelOptions = normalizeAIModelOptions(config.modelOptions)
      const normalizedBaseURL = config.baseURL.trim() || getDefaultBaseURL(config.protocol)
      const normalizedApiKey = config.apiKey.trim()
      this.aiCustomProtocol = config.protocol
      this.aiCustomBaseURL = normalizedBaseURL
      this.aiCustomApiKey = normalizedApiKey
      if (config.protocol === 'openai') {
        this.aiCustomOpenAIBaseURL = normalizedBaseURL
        this.aiCustomOpenAIApiKey = normalizedApiKey
      } else {
        this.aiCustomClaudeBaseURL = normalizedBaseURL
        this.aiCustomClaudeApiKey = normalizedApiKey
      }
      this.aiCustomModelOptions = modelOptions
      if (!modelOptions.some(model => model.id === this.aiSelectedModelId)) {
        this.aiSelectedModelId = modelOptions[0]?.id ?? this.aiSelectedModelId ?? DEFAULT_AI_MODEL
      }
      trackEvent('settings_change', { settingKey: 'aiCustomConfigSaved', value: config.protocol })
      trackEvent('ai_settings_changed', {
        action: 'save_custom_config',
        ...getAISettingsPayload(this.aiSettings)
      })
    },
    setWindowHeight(value: number) {
      const num = Number.isFinite(value) ? value : 0
      this.windowHeight = Math.min(900, Math.max(460, Math.round(num)))
      trackEvent('settings_change', { settingKey: 'windowHeight', value: this.windowHeight })
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
    setAgingCardEnabled(value: boolean) {
      this.agingCardEnabled = !!value
      trackEvent('settings_change', { settingKey: 'agingCardEnabled', value: this.agingCardEnabled })
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
      const hasNewSelectedModelId = typeof state.aiSelectedModelId === 'string' && state.aiSelectedModelId.trim().length > 0
      const legacyModel = typeof state.customAiModel === 'string' ? state.customAiModel.trim() : ''
      const selectedModelId = typeof state.aiSelectedModelId === 'string'
        ? state.aiSelectedModelId.trim()
        : typeof state.selectedModelId === 'string'
          ? state.selectedModelId.trim()
          : ''

      if (!hasNewSelectedModelId) {
        nextPatch.aiSelectedModelId = selectedModelId || legacyModel || DEFAULT_AI_MODEL
      }

      if (typeof state.aiEnabled !== 'boolean') {
        nextPatch.aiEnabled = typeof state.enabled === 'boolean' ? state.enabled : true
      }

      if (typeof state.aiUseCustomProvider !== 'boolean') {
        nextPatch.aiUseCustomProvider = typeof state.useCustomProvider === 'boolean'
          ? state.useCustomProvider
          : false
      }

      const customProtocol = state.aiCustomProtocol ?? state.customProtocol
      if (typeof state.aiCustomProtocol !== 'string' || (customProtocol !== 'openai' && customProtocol !== 'claude')) {
        nextPatch.aiCustomProtocol = 'openai'
        if (customProtocol === 'openai' || customProtocol === 'claude') {
          nextPatch.aiCustomProtocol = customProtocol
        }
      }

      if (typeof state.aiCustomBaseURL !== 'string') {
        nextPatch.aiCustomBaseURL = typeof state.customBaseURL === 'string'
          ? state.customBaseURL
          : getDefaultBaseURL(customProtocol === 'claude' ? 'claude' : 'openai')
      }

      if (typeof state.aiCustomApiKey !== 'string') {
        nextPatch.aiCustomApiKey = typeof state.customApiKey === 'string' ? state.customApiKey : ''
      }

      const legacyBaseURL = typeof state.aiCustomBaseURL === 'string'
        ? state.aiCustomBaseURL
        : typeof state.customBaseURL === 'string'
          ? state.customBaseURL
          : ''
      const legacyApiKey = typeof state.aiCustomApiKey === 'string'
        ? state.aiCustomApiKey
        : typeof state.customApiKey === 'string'
          ? state.customApiKey
          : ''

      if (typeof state.aiCustomOpenAIBaseURL !== 'string') {
        nextPatch.aiCustomOpenAIBaseURL = customProtocol === 'openai' && legacyBaseURL.trim()
          ? legacyBaseURL.trim()
          : getDefaultBaseURL('openai')
      }

      if (typeof state.aiCustomClaudeBaseURL !== 'string') {
        nextPatch.aiCustomClaudeBaseURL = customProtocol === 'claude' && legacyBaseURL.trim()
          ? legacyBaseURL.trim()
          : getDefaultBaseURL('claude')
      }

      if (typeof state.aiCustomOpenAIApiKey !== 'string') {
        nextPatch.aiCustomOpenAIApiKey = customProtocol === 'openai' ? legacyApiKey : ''
      }

      if (typeof state.aiCustomClaudeApiKey !== 'string') {
        nextPatch.aiCustomClaudeApiKey = customProtocol === 'claude' ? legacyApiKey : ''
      }

      const rawCustomModelOptions = Array.isArray(state.aiCustomModelOptions)
        ? state.aiCustomModelOptions
        : Array.isArray(state.customModelOptions)
          ? state.customModelOptions
          : null

      if (!rawCustomModelOptions) {
        nextPatch.aiCustomModelOptions = []
      } else {
        const normalizedModelOptions = normalizeAIModelOptions(rawCustomModelOptions as AIModelOption[])
        if (!Array.isArray(state.aiCustomModelOptions) || JSON.stringify(normalizedModelOptions) !== JSON.stringify(rawCustomModelOptions)) {
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
