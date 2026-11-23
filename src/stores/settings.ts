import { create } from 'zustand'
import type { AIProtocol } from '@/constants/ai'
import { DEFAULT_AI_MODEL, isAIProtocol, isDeepSeekBaseURL, resolveProtocolByBaseURL } from '@/constants/ai'
import type { AIModelOption, AISettingsLike } from '@/lib/aiProvider'
import {
  getDefaultAISettings,
  getDefaultBaseURL,
  getDefaultModelId,
  getProtocolDefaults,
  normalizeAIModelOptions
} from '@/lib/aiProvider'
import { emitStorageSync, isUToolsDbAvailable } from '@/lib/utoolsDb'
import { readSettingsBootCache, writeSettingsBootCache } from '@/lib/bootSnapshotCache'
import { loadSettingsSnapshotAsync, saveSettingsSnapshot } from '@/lib/stateRepository'
import { getPersistentItem } from '@/lib/utoolsStorage'

const THEME_MIRROR_KEY = 'goose-marks.theme-mode'
const WINDOW_HEIGHT_MIRROR_KEY = 'goose-marks.window-height'
const LOCAL_AI_CREDENTIALS_KEY = 'goose-marks.local-ai-credentials-v1'

type LocalAiCredentials = Partial<Record<AIProtocol, string>>

const readLocalAiCredentials = (): LocalAiCredentials => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.__gooseLocalCredentials?.read?.() ?? window.localStorage?.getItem?.(LOCAL_AI_CREDENTIALS_KEY) ?? null
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: LocalAiCredentials = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isAIProtocol(k) && typeof v === 'string' && v.trim()) {
        result[k] = v.trim()
      }
    }
    return result
  } catch {
    return {}
  }
}

let lastWrittenLocalCredentials = ''

const writeLocalAiCredentials = (creds: LocalAiCredentials): void => {
  if (typeof window === 'undefined') return
  const clean: LocalAiCredentials = {}
  for (const [k, v] of Object.entries(creds)) {
    if (isAIProtocol(k) && typeof v === 'string' && v.trim()) {
      clean[k] = v.trim()
    }
  }
  const serialized = JSON.stringify(clean)
  if (serialized === lastWrittenLocalCredentials) return
  try {
    if (window.__gooseLocalCredentials?.write?.(serialized)) {
      lastWrittenLocalCredentials = serialized
      return
    }
    window.localStorage?.setItem?.(LOCAL_AI_CREDENTIALS_KEY, serialized)
    lastWrittenLocalCredentials = serialized
  } catch {}
}

const extractLocalAiCredentials = (state: {
  aiProtocol: AIProtocol
  aiCustomApiKey: string
  aiProtocolConfigs: AIProtocolConfigs
}): LocalAiCredentials => {
  const creds: LocalAiCredentials = {}
  for (const [k, entry] of Object.entries(state.aiProtocolConfigs || {})) {
    if (isAIProtocol(k) && typeof entry?.apiKey === 'string' && entry.apiKey.trim()) {
      creds[k] = entry.apiKey.trim()
    }
  }
  if (isAIProtocol(state.aiProtocol) && typeof state.aiCustomApiKey === 'string' && state.aiCustomApiKey.trim()) {
    creds[state.aiProtocol] = state.aiCustomApiKey.trim()
  }
  return creds
}

const applyLocalAiCredentials = (
  patch: Partial<SettingsState>,
  creds: LocalAiCredentials,
  fallbackProtocol: AIProtocol = 'openai-responses'
): void => {
  const protocol = patch.aiProtocol && isAIProtocol(patch.aiProtocol) ? patch.aiProtocol : fallbackProtocol
  const configs: AIProtocolConfigs = { ...(patch.aiProtocolConfigs || {}) }
  for (const [k, apiKey] of Object.entries(creds)) {
    if (!isAIProtocol(k) || !apiKey) continue
    const existing = configs[k]
    configs[k] = createProtocolConfig(k, {
      baseURL: existing?.baseURL,
      apiKey,
      modelOptions: existing?.modelOptions,
      selectedModelId: existing?.selectedModelId,
    })
  }
  patch.aiProtocolConfigs = configs
  const activeKey = configs[protocol]?.apiKey ?? creds[protocol]
  if (typeof activeKey === 'string') {
    patch.aiCustomApiKey = activeKey
  }
}

const stripSecretsForSyncedSettings = (payload: PersistedSettingsState): PersistedSettingsState => {
  const strippedConfigs: AIProtocolConfigs = {}
  for (const [k, entry] of Object.entries(payload.aiProtocolConfigs || {})) {
    if (!isAIProtocol(k) || !entry) continue
    strippedConfigs[k] = { ...entry, apiKey: '' }
  }
  return {
    ...payload,
    aiCustomApiKey: '',
    aiProtocolConfigs: strippedConfigs,
  }
}

const syncBootSettingsMirror = (themePreference: SettingsState['themePreference'], windowHeight: number): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem?.(THEME_MIRROR_KEY, themePreference)
    window.localStorage?.setItem?.(WINDOW_HEIGHT_MIRROR_KEY, String(Math.round(windowHeight)))
  } catch {}
}

/** 设置 store：setter 只做业务赋值，持久化由 utools.db 仓储处理。 */

export type ViewMode = 'list' | 'grid' | 'cards'
/** 搜索结果布局：列表 / 格子（与首页 homeViewMode 独立） */
export type SearchViewMode = 'list' | 'grid'
export type Density = 'compact' | 'regular' | 'comfy'
/** 界面缩放档位：大 / 正常 / 小 */
export type UIScale = 'large' | 'normal' | 'small'
/** 宫格图标尺寸：小 38px / 中 46px / 大 56px */
export type GridIconSize = 'small' | 'medium' | 'large'
/** 彩蛋背景样式 */
export type EasterEggVariant = 'starry' | 'blackhole'
export interface DetachedWindowPosition {
  x: number
  y: number
}

/** 单一协议下的 Base URL / Key / 模型列表（按协议独立持久化） */
export interface AIProtocolConfig {
  baseURL: string
  apiKey: string
  modelOptions: AIModelOption[]
  selectedModelId: string
}

export type AIProtocolConfigs = Partial<Record<AIProtocol, AIProtocolConfig>>

function createProtocolConfig(protocol: AIProtocol, partial?: Partial<AIProtocolConfig>): AIProtocolConfig {
  const defaults = getProtocolDefaults(protocol)
  return {
    baseURL: typeof partial?.baseURL === 'string' && partial.baseURL.trim()
      ? partial.baseURL.trim()
      : defaults.baseURL,
    apiKey: typeof partial?.apiKey === 'string' ? partial.apiKey : '',
    modelOptions: normalizeAIModelOptions(partial?.modelOptions ?? []),
    selectedModelId:
      typeof partial?.selectedModelId === 'string' && partial.selectedModelId.trim()
        ? partial.selectedModelId.trim()
        : defaults.defaultModel
  }
}

function snapshotActiveProtocolConfig(state: {
  aiCustomBaseURL: string
  aiCustomApiKey: string
  aiCustomModelOptions: AIModelOption[]
  aiSelectedModelId: string
}): AIProtocolConfig {
  return {
    baseURL: state.aiCustomBaseURL,
    apiKey: state.aiCustomApiKey,
    modelOptions: state.aiCustomModelOptions,
    selectedModelId: state.aiSelectedModelId
  }
}

function applyProtocolConfig(protocol: AIProtocol, config: AIProtocolConfig) {
  return {
    aiProtocol: protocol,
    aiCustomBaseURL: config.baseURL,
    aiCustomApiKey: config.apiKey,
    aiCustomModelOptions: config.modelOptions,
    aiSelectedModelId: config.selectedModelId
  }
}

export interface SettingsState {
  themePreference: 'system' | 'light' | 'dark'
  gridColumns: number
  preferLocalSnapshotOnStartup: boolean
  localMirrorDirectory: string
  aiEnabled: boolean
  /** AI 创建书签：允许新建主分组 / 子分组 */
  aiAllowCreateGroup: boolean
  aiAllowCreateSubGroup: boolean
  /** 历史兼容：仅老用户已手动开启过 AI 时保留 uTools 内置 AI 路径 */
  aiAllowLegacyUTools: boolean
  aiSelectedModelId: string
  aiUseCustomProvider: boolean
  /** 接入协议：openai = OpenAI 官方 Responses API；anthropic = Anthropic 原生 */
  aiProtocol: AIProtocol
  /** AI 协议配置结构版本，用于区分 Responses 与 OpenAI-compatible */
  aiProtocolVersion: number
  /** 当前协议对应的 Base URL / Key / 模型（与 aiProtocolConfigs[aiProtocol] 同步） */
  aiCustomBaseURL: string
  aiCustomApiKey: string
  aiCustomModelOptions: AIModelOption[]
  /** 各协议独立配置；切换协议时读写对应槽位，避免互相覆盖 */
  aiProtocolConfigs: AIProtocolConfigs
  homeViewMode: ViewMode
  /** 搜索结果布局偏好（列表/格子），与首页视图独立 */
  searchViewMode: SearchViewMode
  density: Density
  easterEggEnabled: boolean
  /** 彩蛋背景样式：星空或黑洞 */
  easterEggVariant: EasterEggVariant
  skipFailedIconMatch: boolean
  /** uTools 面板连贯模式：再次唤起时保留上次搜索和浏览位置 */
  panelContinuous: boolean
  /** 列表模式：显示书签描述 */
  listShowDescription: boolean
  /** 列表模式：描述完整展示（多行换行，不单行省略） */
  listFullDescription: boolean
  /** hover 浮层中是否支持选中/拖选描述文字（默认开启） */
  descriptionSelectable: boolean
  /** 列表/宫格模式：书签没有描述时隐藏网址占位 */
  listShowTags: boolean
  /** 界面缩放档位：大 / 正常 / 小（默认正常） */
  uiScale: UIScale
  /** 宫格模式：图标大小 */
  gridIconSize: GridIconSize
  /** uTools 主窗口展开高度（px），preload 启动时读取并 setExpendHeight 恢复 */
  windowHeight: number
  /** uTools 分离窗口最后一次停留位置，下次切换独立窗口时恢复 */
  detachedWindowPosition: DetachedWindowPosition | null
  /** 打开书签时使用 uTools 内置浏览器（默认 false，即用系统默认浏览器） */
  useUtoolsBrowser: boolean
}

/** uTools 窗口高度范围（与 preload.cjs 的 clampWindowHeight 保持一致） */
export const WINDOW_HEIGHT_MIN = 600
export const WINDOW_HEIGHT_MAX = 1000
export const WINDOW_HEIGHT_DEFAULT = 800
const clampWindowHeight = (h: number) =>
  Math.min(WINDOW_HEIGHT_MAX, Math.max(WINDOW_HEIGHT_MIN, Math.round(h)))

export interface SettingsActions {
  setThemePreference: (value: SettingsState['themePreference']) => void
  setGridColumns: (value: number) => void
  setPreferLocalSnapshotOnStartup: (value: boolean) => void
  setLocalMirrorDirectory: (value: string) => void
  setAiEnabled: (value: boolean) => void
  setAiAllowCreateGroup: (value: boolean) => void
  setAiAllowCreateSubGroup: (value: boolean) => void
  setAiSelectedModelId: (value: string | null) => void
  setAiCustomProviderEnabled: (value: boolean) => void
  /** 切换接入协议：写入默认 BaseURL，并清空旧协议的模型缓存 */
  setAiProtocol: (protocol: AIProtocol) => void
  /** 实时更新当前协议的连接草稿，避免 uTools 收起时输入框尚未失焦而丢失。 */
  setAiCustomCredentials: (config: { baseURL: string; apiKey: string }) => void
  saveAiCustomConfig: (config: { baseURL: string; apiKey: string; modelOptions: AIModelOption[] }) => void
  setEasterEggEnabled: (value: boolean) => void
  setEasterEggVariant: (value: EasterEggVariant) => void
  setSkipFailedIconMatch: (value: boolean) => void
  setHomeViewMode: (mode: ViewMode) => void
  setSearchViewMode: (mode: SearchViewMode) => void
  setDensity: (value: Density) => void
  setPanelContinuous: (value: boolean) => void
  setListShowDescription: (value: boolean) => void
  setListFullDescription: (value: boolean) => void
  setDescriptionSelectable: (value: boolean) => void
  setListShowTags: (value: boolean) => void
  setUiScale: (value: UIScale) => void
  setGridIconSize: (value: GridIconSize) => void
  /** 设置 uTools 窗口高度：持久化 + 即时 setExpendHeight 应用 */
  setWindowHeight: (value: number) => void
  setDetachedWindowPosition: (value: DetachedWindowPosition | null) => void
  setUseUtoolsBrowser: (value: boolean) => void
}

export type SettingsStore = SettingsState & SettingsActions

type PersistedSettingsState = SettingsState

export const createDefaultSettingsState = (): SettingsState => {
  const defaults = getDefaultAISettings()
  const protocol = defaults.protocol
  const active = createProtocolConfig(protocol, {
    baseURL: defaults.customBaseURL,
    apiKey: defaults.customApiKey,
    modelOptions: defaults.customModelOptions,
    selectedModelId: defaults.selectedModelId ?? DEFAULT_AI_MODEL
  })
  return {
    // 默认深色：启动底色、主题 token、AI 页都按深色起步，避免首开白屏晃眼
    themePreference: 'dark',
    gridColumns: 3,
    preferLocalSnapshotOnStartup: false,
    localMirrorDirectory: '',
    aiEnabled: defaults.enabled,
    aiAllowCreateGroup: false,
    aiAllowCreateSubGroup: true,
    aiAllowLegacyUTools: defaults.allowLegacyUTools,
    aiSelectedModelId: active.selectedModelId,
    aiUseCustomProvider: defaults.useCustomProvider,
    aiProtocol: protocol,
    aiProtocolVersion: 4,
    aiCustomBaseURL: active.baseURL,
    aiCustomApiKey: active.apiKey,
    aiCustomModelOptions: active.modelOptions,
    aiProtocolConfigs: { [protocol]: active },
    homeViewMode: 'grid',
    searchViewMode: 'list',
    density: 'regular',
    easterEggEnabled: true,
    easterEggVariant: 'starry' as EasterEggVariant,
    skipFailedIconMatch: true,
    panelContinuous: false,
    listShowDescription: true,
    listFullDescription: true,
    descriptionSelectable: true,
    listShowTags: true,
    uiScale: 'normal',
    gridIconSize: 'medium',
    windowHeight: WINDOW_HEIGHT_DEFAULT,
    detachedWindowPosition: null,
    useUtoolsBrowser: false
  }
}

export const useSettingsStore = create<SettingsStore>()((set, get) => {
  return {
  ...createDefaultSettingsState(),

      setThemePreference: (value) => {
        set({ themePreference: value })
        syncBootSettingsMirror(value, get().windowHeight)
      },

      setGridColumns: (value) => set({ gridColumns: Math.min(5, Math.max(2, Math.round(value))) }),
      setPreferLocalSnapshotOnStartup: (value) => set({ preferLocalSnapshotOnStartup: !!value }),
      setLocalMirrorDirectory: (value) => set({ localMirrorDirectory: String(value || '').trim() }),
      setAiEnabled: (value) => set({ aiEnabled: !!value }),
      setAiAllowCreateGroup: (value) => set({ aiAllowCreateGroup: !!value }),
      setAiAllowCreateSubGroup: (value) => set({ aiAllowCreateSubGroup: !!value }),
      setAiSelectedModelId: (value) => {
        const current = get()
        const protocol = current.aiProtocol
        const nextSelected = String(value || '').trim() || getDefaultModelId(protocol)
        const slot = createProtocolConfig(protocol, {
          ...snapshotActiveProtocolConfig(current),
          selectedModelId: nextSelected
        })
        set({
          aiSelectedModelId: nextSelected,
          aiProtocolConfigs: { ...current.aiProtocolConfigs, [protocol]: slot }
        })
      },
      setAiCustomProviderEnabled: (value) => set({ aiUseCustomProvider: !!value }),
      setAiProtocol: (protocol) => {
        const next = isAIProtocol(protocol) ? protocol : 'openai-responses'
        const current = get()
        if (current.aiProtocol === next) return

        // 先把当前协议的值写回独立槽位，再加载目标协议已保存的配置
        const configs: AIProtocolConfigs = {
          ...current.aiProtocolConfigs,
          [current.aiProtocol]: createProtocolConfig(
            current.aiProtocol,
            snapshotActiveProtocolConfig(current)
          )
        }
        const saved = configs[next]
        const restored = createProtocolConfig(next, saved)
        set({
          ...applyProtocolConfig(next, restored),
          aiProtocolConfigs: { ...configs, [next]: restored }
        })
      },
      setAiCustomCredentials: (config) => {
        const current = get()
        const protocol = current.aiProtocol
        const slot: AIProtocolConfig = {
          ...snapshotActiveProtocolConfig(current),
          baseURL: String(config.baseURL || ''),
          apiKey: String(config.apiKey || '')
        }
        set({
          aiCustomBaseURL: slot.baseURL,
          aiCustomApiKey: slot.apiKey,
          aiProtocolConfigs: { ...current.aiProtocolConfigs, [protocol]: slot }
        })
      },
      saveAiCustomConfig: (config) => {
        const modelOptions = normalizeAIModelOptions(config.modelOptions)
        const current = get()
        const protocol = current.aiProtocol
        let nextSelected = current.aiSelectedModelId
        if (!modelOptions.some((model) => model.id === nextSelected)) {
          nextSelected = modelOptions[0]?.id ?? nextSelected ?? getDefaultModelId(protocol)
        }
        const slot = createProtocolConfig(protocol, {
          baseURL: config.baseURL.trim() || getDefaultBaseURL(protocol),
          apiKey: config.apiKey.trim(),
          modelOptions,
          selectedModelId: nextSelected
        })
        set({
          ...applyProtocolConfig(protocol, slot),
          aiProtocolConfigs: { ...current.aiProtocolConfigs, [protocol]: slot }
        })
      },
      setEasterEggEnabled: (value) => set({ easterEggEnabled: !!value }),
      setEasterEggVariant: (value) => set({ easterEggVariant: ['starry', 'blackhole'].includes(value) ? value : 'starry' }),
      setSkipFailedIconMatch: (value) => set({ skipFailedIconMatch: !!value }),
      setHomeViewMode: (mode) => set({ homeViewMode: mode }),
      setSearchViewMode: (mode) => set({ searchViewMode: mode === 'grid' ? 'grid' : 'list' }),
      setDensity: (value) => set({ density: ['compact', 'regular', 'comfy'].includes(value) ? value : 'regular' }),
      setPanelContinuous: (value) => set({ panelContinuous: !!value }),
      setListShowDescription: (value) => set({ listShowDescription: !!value }),
      setListFullDescription: (value) => set({ listFullDescription: !!value }),
      setDescriptionSelectable: (value) => set({ descriptionSelectable: !!value }),
      setListShowTags: (value) => set({ listShowTags: !!value }),
      setUiScale: (value) => set({ uiScale: (['large', 'normal', 'small'] as const).includes(value) ? value : 'normal' }),
      setGridIconSize: (value) => set({ gridIconSize: ['small', 'medium', 'large'].includes(value) ? value : 'medium' }),
      setWindowHeight: (value) => {
        const next = clampWindowHeight(value)
        set({ windowHeight: next })
        syncBootSettingsMirror(get().themePreference, next)
        // 即时应用到 uTools 主窗口（preload 仅负责启动恢复，运行时调整由这里驱动）
        try {
          window.utools?.setExpendHeight?.(next)
        } catch {}
      },
      setDetachedWindowPosition: (value) => {
        if (!value) {
          set({ detachedWindowPosition: null })
          return
        }
        const x = Math.round(value.x)
        const y = Math.round(value.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        set({ detachedWindowPosition: { x, y } })
      },
      setUseUtoolsBrowser: (value) => set({ useUtoolsBrowser: !!value })
  }
})

const pickPersistedSettings = (state: SettingsStore): PersistedSettingsState => ({
  themePreference: state.themePreference,
  gridColumns: state.gridColumns,
  preferLocalSnapshotOnStartup: state.preferLocalSnapshotOnStartup,
  localMirrorDirectory: state.localMirrorDirectory,
  aiEnabled: state.aiEnabled,
  aiAllowCreateGroup: state.aiAllowCreateGroup,
  aiAllowCreateSubGroup: state.aiAllowCreateSubGroup,
  aiAllowLegacyUTools: state.aiAllowLegacyUTools,
  aiSelectedModelId: state.aiSelectedModelId,
  aiUseCustomProvider: state.aiUseCustomProvider,
  aiProtocol: state.aiProtocol,
  aiProtocolVersion: state.aiProtocolVersion,
  aiCustomBaseURL: state.aiCustomBaseURL,
  aiCustomApiKey: state.aiCustomApiKey,
  aiCustomModelOptions: state.aiCustomModelOptions,
  aiProtocolConfigs: state.aiProtocolConfigs,
  homeViewMode: state.homeViewMode,
  searchViewMode: state.searchViewMode,
  density: state.density,
  easterEggEnabled: state.easterEggEnabled,
  easterEggVariant: state.easterEggVariant,
  skipFailedIconMatch: state.skipFailedIconMatch,
  panelContinuous: state.panelContinuous,
  listShowDescription: state.listShowDescription,
  listFullDescription: state.listFullDescription,
  descriptionSelectable: state.descriptionSelectable,
  listShowTags: state.listShowTags,
  uiScale: state.uiScale,
  gridIconSize: state.gridIconSize,
  windowHeight: state.windowHeight,
  detachedWindowPosition: state.detachedWindowPosition,
  useUtoolsBrowser: state.useUtoolsBrowser
})

const normalizeProtocolConfigs = (
  raw: unknown,
  fallbackProtocol: AIProtocol,
  fallback: AIProtocolConfig
): AIProtocolConfigs => {
  const result: AIProtocolConfigs = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!isAIProtocol(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue
      const entry = value as Partial<AIProtocolConfig>
      result[key] = createProtocolConfig(key, {
        baseURL: typeof entry.baseURL === 'string' ? entry.baseURL : undefined,
        apiKey: typeof entry.apiKey === 'string' ? entry.apiKey : undefined,
        modelOptions: Array.isArray(entry.modelOptions) ? entry.modelOptions : undefined,
        selectedModelId: typeof entry.selectedModelId === 'string' ? entry.selectedModelId : undefined
      })
    }
  }
  // 旧数据只有扁平字段：至少把当前协议的配置落进槽位
  if (!result[fallbackProtocol]) {
    result[fallbackProtocol] = fallback
  }
  return result
}

export const normalizePersistedSettings = (state: Partial<SettingsState> | null | undefined): Partial<SettingsState> => {
  if (!state) return {}
  const patch: Partial<SettingsState> = { ...state }
  if (!['system', 'light', 'dark'].includes(String(patch.themePreference))) patch.themePreference = 'dark'
  if (typeof patch.aiEnabled !== 'boolean') patch.aiEnabled = false
  if (typeof patch.aiAllowCreateGroup !== 'boolean') patch.aiAllowCreateGroup = false
  if (typeof patch.aiAllowCreateSubGroup !== 'boolean') patch.aiAllowCreateSubGroup = true
  // 丢弃已移除的 AI 对话面板专用字段，避免再次被持久化
  delete (patch as { readLocalSkills?: unknown }).readLocalSkills
  delete (patch as { userGlobalPrompt?: unknown }).userGlobalPrompt
  delete (patch as { aiDefaultReasoningEffort?: unknown }).aiDefaultReasoningEffort
  delete (patch as { aiDefaultTemperature?: unknown }).aiDefaultTemperature
  delete (patch as { aiSessionReasoningEffort?: unknown }).aiSessionReasoningEffort
  delete (patch as { aiSessionTemperature?: unknown }).aiSessionTemperature
  patch.aiAllowLegacyUTools = false
  patch.aiUseCustomProvider = true
  // v2 中 "openai" 表示 Responses；更早的 OpenAI 配置是 Chat Completions。
  const rawProtocol = (patch as { aiProtocol?: unknown }).aiProtocol
  if (isAIProtocol(rawProtocol)) {
    patch.aiProtocol = rawProtocol
  } else if (rawProtocol === 'openai' && patch.aiProtocolVersion === 2) {
    patch.aiProtocol = 'openai-responses'
  } else {
    patch.aiProtocol = resolveProtocolByBaseURL(
      typeof patch.aiCustomBaseURL === 'string' ? patch.aiCustomBaseURL : ''
    )
  }
  if (
    patch.aiProtocol !== 'deepseek'
    && typeof patch.aiCustomBaseURL === 'string'
    && isDeepSeekBaseURL(patch.aiCustomBaseURL)
  ) {
    patch.aiProtocol = 'deepseek'
  }
  const protocol = patch.aiProtocol ?? 'openai-responses'
  const defaultBaseURL = getDefaultBaseURL(protocol)
  if (typeof patch.aiCustomBaseURL !== 'string' || !patch.aiCustomBaseURL.trim()) {
    patch.aiCustomBaseURL = defaultBaseURL
  } else {
    patch.aiCustomBaseURL = patch.aiCustomBaseURL.trim()
  }
  if (typeof patch.aiSelectedModelId !== 'string' || !patch.aiSelectedModelId.trim()) {
    patch.aiSelectedModelId = getDefaultModelId(protocol)
  }
  // 丢弃旧字段，避免再次被持久化
  delete (patch as { aiProviderPreset?: unknown }).aiProviderPreset
  if (typeof patch.aiCustomApiKey !== 'string') patch.aiCustomApiKey = ''
  if (patch.searchViewMode !== 'grid' && patch.searchViewMode !== 'list') patch.searchViewMode = 'list'
  if (typeof patch.panelContinuous !== 'boolean') patch.panelContinuous = false
  if (typeof patch.listShowDescription !== 'boolean') patch.listShowDescription = true
  if (typeof patch.listFullDescription !== 'boolean') patch.listFullDescription = true
  if (typeof patch.descriptionSelectable !== 'boolean') patch.descriptionSelectable = true
  if (typeof patch.listShowTags !== 'boolean') patch.listShowTags = true
  if (!['small', 'medium', 'large'].includes(String(patch.gridIconSize))) patch.gridIconSize = 'medium'
  if (!['large', 'normal', 'small'].includes(String(patch.uiScale))) patch.uiScale = 'normal'
  if (typeof patch.easterEggEnabled !== 'boolean') patch.easterEggEnabled = true
  if (!['starry', 'blackhole'].includes(String(patch.easterEggVariant))) patch.easterEggVariant = 'starry'
  delete (patch as { aiAggressiveSaveEnabled?: unknown }).aiAggressiveSaveEnabled
  delete (patch as { aiFormAutoPolish?: unknown }).aiFormAutoPolish
  delete (patch as { aiQuickSaveEnabled?: unknown }).aiQuickSaveEnabled
  delete (patch as { autoCloseWindow?: unknown }).autoCloseWindow
  if (
    patch.detachedWindowPosition == null ||
    typeof patch.detachedWindowPosition !== 'object' ||
    Array.isArray(patch.detachedWindowPosition) ||
    !Number.isFinite(Number((patch.detachedWindowPosition as DetachedWindowPosition).x)) ||
    !Number.isFinite(Number((patch.detachedWindowPosition as DetachedWindowPosition).y))
  ) {
    patch.detachedWindowPosition = null
  } else {
    patch.detachedWindowPosition = {
      x: Math.round(Number((patch.detachedWindowPosition as DetachedWindowPosition).x)),
      y: Math.round(Number((patch.detachedWindowPosition as DetachedWindowPosition).y))
    }
  }

  const rawModelOptions = Array.isArray(patch.aiCustomModelOptions) ? patch.aiCustomModelOptions : null
  if (!rawModelOptions) {
    patch.aiCustomModelOptions = []
  } else {
    patch.aiCustomModelOptions = normalizeAIModelOptions(rawModelOptions)
  }

  const activeFallback = createProtocolConfig(protocol, {
    baseURL: patch.aiCustomBaseURL,
    apiKey: patch.aiCustomApiKey,
    modelOptions: patch.aiCustomModelOptions,
    selectedModelId: patch.aiSelectedModelId
  })
  const configs = normalizeProtocolConfigs(patch.aiProtocolConfigs, protocol, activeFallback)
  // 以当前协议槽位为准同步扁平字段（切换协议后的权威数据源）
  const active = configs[protocol] ?? activeFallback
  configs[protocol] = active
  patch.aiProtocolConfigs = configs
  patch.aiCustomBaseURL = active.baseURL
  patch.aiCustomApiKey = active.apiKey
  patch.aiCustomModelOptions = active.modelOptions
  patch.aiSelectedModelId = active.selectedModelId
  patch.aiProtocolVersion = 4

  return patch
}

let settingsPersistenceStarted = false
let settingsPersistPromise: Promise<void> = Promise.resolve()
let lastPersistedSettings = ''
let settingsPersistenceFlushEventsStarted = false

const enqueueSettingsPersist = (state: SettingsStore): void => {
  syncBootSettingsMirror(state.themePreference, state.windowHeight)
  writeLocalAiCredentials(extractLocalAiCredentials(state))
  const payload = stripSecretsForSyncedSettings(pickPersistedSettings(state))
  writeSettingsBootCache(payload)
  const serialized = JSON.stringify(payload)
  if (serialized === lastPersistedSettings) return

  settingsPersistPromise = settingsPersistPromise
    .then(async () => {
      saveSettingsSnapshot(payload)
      lastPersistedSettings = serialized
      emitStorageSync('settings', serialized)
    })
    .catch((error) => {
      console.error('[settings] 保存失败:', error)
    })
}

/**
 * uTools 收起/退出时同步写入最新快照。
 * 常规更新仍走串行队列；生命周期边界不能依赖下一轮微任务，否则输入框尚未失焦时可能丢设置。
 */
export const flushSettingsStorePersistence = (): void => {
  const state = useSettingsStore.getState()
  syncBootSettingsMirror(state.themePreference, state.windowHeight)
  writeLocalAiCredentials(extractLocalAiCredentials(state))
  const payload = stripSecretsForSyncedSettings(pickPersistedSettings(state))
  writeSettingsBootCache(payload)
  if (!isUToolsDbAvailable()) return
  const serialized = JSON.stringify(payload)
  if (serialized === lastPersistedSettings) return
  try {
    saveSettingsSnapshot(payload)
    lastPersistedSettings = serialized
    emitStorageSync('settings', serialized)
  } catch (error) {
    console.error('[settings] 立即保存失败:', error)
  }
}

const bindSettingsPersistenceFlushEvents = (): void => {
  if (settingsPersistenceFlushEventsStarted || typeof window === 'undefined') return
  settingsPersistenceFlushEventsStarted = true

  const flush = () => flushSettingsStorePersistence()
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flush()
  }

  window.addEventListener('goose-marks:plugin-out', flush)
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', flushWhenHidden)
}

let settingsBootCacheHydrated = false

export const hydrateSettingsStoreFromBootCache = (): boolean => {
  if (settingsBootCacheHydrated || settingsPersistenceStarted) return false
  settingsBootCacheHydrated = true
  const cached = readSettingsBootCache()
  if (!cached) return false
  const normalized = normalizePersistedSettings(cached)
  const localCreds = readLocalAiCredentials()
  if (Object.keys(localCreds).length > 0) {
    applyLocalAiCredentials(normalized, localCreds, normalized.aiProtocol)
  }
  if (Object.keys(normalized).length > 0) {
    useSettingsStore.setState(normalized as Partial<SettingsStore>)
  }
  const state = useSettingsStore.getState()
  syncBootSettingsMirror(state.themePreference, state.windowHeight)
  return true
}

export const initializeSettingsStorePersistence = async (): Promise<void> => {
  if (settingsPersistenceStarted) return
  settingsPersistenceStarted = true

  const saved = await loadSettingsSnapshotAsync()
  const persisted = normalizePersistedSettings(saved)
  if (!saved?.themePreference) {
    const legacyTheme = getPersistentItem('goose-marks.theme-mode', ['vueuse-color-scheme'])
    if (legacyTheme === 'dark' || legacyTheme === 'light' || legacyTheme === 'system') persisted.themePreference = legacyTheme
  }

  // 凭据仅存本机；若旧版同步库仍残留明文 apiKey，迁移到本机后由后续持久化从同步库清除。
  const localCreds = readLocalAiCredentials()
  const legacyCreds = persisted.aiProtocol && persisted.aiProtocolConfigs
    ? extractLocalAiCredentials({
        aiProtocol: persisted.aiProtocol,
        aiCustomApiKey: persisted.aiCustomApiKey || '',
        aiProtocolConfigs: persisted.aiProtocolConfigs,
      })
    : {}
  const mergedCreds: LocalAiCredentials = { ...legacyCreds, ...localCreds }
  if (Object.keys(mergedCreds).length > 0) {
    writeLocalAiCredentials(mergedCreds)
    applyLocalAiCredentials(persisted, mergedCreds, persisted.aiProtocol)
  }

  if (Object.keys(persisted).length > 0) {
    useSettingsStore.setState(persisted as Partial<SettingsStore>)
  }

  const initialState = useSettingsStore.getState()
  syncBootSettingsMirror(initialState.themePreference, initialState.windowHeight)
  const sanitizedPayload = stripSecretsForSyncedSettings(pickPersistedSettings(initialState))
  writeSettingsBootCache(sanitizedPayload)

  if (!isUToolsDbAvailable()) return

  const currentSerialized = JSON.stringify(sanitizedPayload)
  const savedNormalizedMatches =
    saved != null && JSON.stringify(pickPersistedSettings({ ...initialState, ...(saved as Partial<SettingsState>) })) === currentSerialized &&
    Object.keys(saved).every((key) => key in sanitizedPayload)

  lastPersistedSettings = savedNormalizedMatches ? currentSerialized : ''

  useSettingsStore.subscribe((state) => {
    enqueueSettingsPersist(state)
  })
  bindSettingsPersistenceFlushEvents()
  if (!savedNormalizedMatches) {
    enqueueSettingsPersist(useSettingsStore.getState())
  }
}

// ---- 选择器（等价旧版 getters）----

export const selectAiSettings = (s: SettingsStore): AISettingsLike => ({
  enabled: s.aiEnabled,
  allowLegacyUTools: s.aiAllowLegacyUTools,
  selectedModelId: s.aiSelectedModelId?.trim() || null,
  useCustomProvider: s.aiUseCustomProvider,
  protocol: isAIProtocol(s.aiProtocol) ? s.aiProtocol : 'openai-responses',
  customBaseURL: s.aiCustomBaseURL,
  customApiKey: s.aiCustomApiKey,
  customModelOptions: s.aiCustomModelOptions
})
