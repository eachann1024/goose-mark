import { create } from 'zustand'
import type { AIProviderPreset } from '@/constants/ai'
import { DEFAULT_AI_MODEL, getPresetMeta, resolvePresetByBaseURL } from '@/constants/ai'
import type { AIModelOption, AISettingsLike } from '@/lib/aiProvider'
import { getDefaultAISettings, getDefaultBaseURL, normalizeAIModelOptions } from '@/lib/aiProvider'
import { emitStorageSync, isUToolsDbAvailable } from '@/lib/utoolsDb'
import { loadSettingsSnapshot, saveSettingsSnapshot } from '@/lib/stateRepository'

/**
 * 设置 store（Zustand）
 * --------------------------------------------------------------------------
 * 设置 store（Zustand）
 * 说明：setter 仅保留业务赋值逻辑，持久化由 utools.db 仓储统一处理。
 */

export type ViewMode = 'list' | 'grid' | 'cards'
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
export interface SettingsState {
  gridColumns: number
  autoCloseWindow: boolean
  preferLocalSnapshotOnStartup: boolean
  localMirrorDirectory: string
  aiEnabled: boolean
  /** 历史兼容：仅老用户已手动开启过 AI 时保留 uTools 内置 AI 路径 */
  aiAllowLegacyUTools: boolean
  aiSelectedModelId: string
  aiUseCustomProvider: boolean
  /** 当前选中的 OpenAI 协议供应商预置（仅 aiUseCustomProvider 为 true 时生效） */
  aiProviderPreset: AIProviderPreset
  aiCustomBaseURL: string
  aiCustomApiKey: string
  aiCustomModelOptions: AIModelOption[]
  homeViewMode: ViewMode
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
  /** 列表/宫格模式：书签没有描述时隐藏网址占位 */
  listShowTags: boolean
  /** 界面缩放档位：大 / 正常 / 小（默认正常） */
  uiScale: UIScale
  /** 宫格模式：图标大小 */
  gridIconSize: GridIconSize
  /** AI 快捷保存：控制 ai_quick_save uTools 特性是否注册 */
  aiQuickSaveEnabled: boolean
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
  setGridColumns: (value: number) => void
  setAutoCloseWindow: (value: boolean) => void
  setPreferLocalSnapshotOnStartup: (value: boolean) => void
  setLocalMirrorDirectory: (value: string) => void
  setAiEnabled: (value: boolean) => void
  setAiSelectedModelId: (value: string | null) => void
  setAiCustomProviderEnabled: (value: boolean) => void
  /** 选择供应商预置：非 custom 时自动填入对应 BaseURL 并清空已缓存模型（供应商变了，旧模型列表失效） */
  setAiProviderPreset: (preset: AIProviderPreset) => void
  saveAiCustomConfig: (config: { baseURL: string; apiKey: string; modelOptions: AIModelOption[] }) => void
  setEasterEggEnabled: (value: boolean) => void
  setEasterEggVariant: (value: EasterEggVariant) => void
  setSkipFailedIconMatch: (value: boolean) => void
  setHomeViewMode: (mode: ViewMode) => void
  setDensity: (value: Density) => void
  setPanelContinuous: (value: boolean) => void
  setListShowDescription: (value: boolean) => void
  setListFullDescription: (value: boolean) => void
  setListShowTags: (value: boolean) => void
  setUiScale: (value: UIScale) => void
  setGridIconSize: (value: GridIconSize) => void
  setAiQuickSaveEnabled: (value: boolean) => void
  /** 设置 uTools 窗口高度：持久化 + 即时 setExpendHeight 应用 */
  setWindowHeight: (value: number) => void
  setDetachedWindowPosition: (value: DetachedWindowPosition | null) => void
  setUseUtoolsBrowser: (value: boolean) => void
}

export type SettingsStore = SettingsState & SettingsActions

type PersistedSettingsState = SettingsState

const createInitialState = (): SettingsState => {
  const defaults = getDefaultAISettings()
  return {
    gridColumns: 3,
    autoCloseWindow: true,
    preferLocalSnapshotOnStartup: false,
    localMirrorDirectory: '',
    aiEnabled: defaults.enabled,
    aiAllowLegacyUTools: defaults.allowLegacyUTools,
    aiSelectedModelId: defaults.selectedModelId ?? DEFAULT_AI_MODEL,
    aiUseCustomProvider: defaults.useCustomProvider,
    aiProviderPreset: 'glm',
    aiCustomBaseURL: defaults.customBaseURL,
    aiCustomApiKey: defaults.customApiKey,
    aiCustomModelOptions: defaults.customModelOptions,
    homeViewMode: 'grid',
    density: 'regular',
    easterEggEnabled: true,
    easterEggVariant: 'starry' as EasterEggVariant,
    skipFailedIconMatch: true,
    panelContinuous: false,
    listShowDescription: true,
    listFullDescription: true,
    listShowTags: true,
    uiScale: 'normal',
    gridIconSize: 'medium',
    aiQuickSaveEnabled: false,
    windowHeight: WINDOW_HEIGHT_DEFAULT,
    detachedWindowPosition: null,
    useUtoolsBrowser: false
  }
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  ...createInitialState(),

      setGridColumns: (value) => set({ gridColumns: Math.min(5, Math.max(2, Math.round(value))) }),
      setAutoCloseWindow: (value) => set({ autoCloseWindow: !!value }),
      setPreferLocalSnapshotOnStartup: (value) => set({ preferLocalSnapshotOnStartup: !!value }),
      setLocalMirrorDirectory: (value) => set({ localMirrorDirectory: String(value || '').trim() }),
      setAiEnabled: (value) => set({ aiEnabled: !!value }),
      setAiSelectedModelId: (value) => set({ aiSelectedModelId: String(value || '').trim() || DEFAULT_AI_MODEL }),
      setAiCustomProviderEnabled: (value) => set({ aiUseCustomProvider: !!value }),
      setAiProviderPreset: (preset) => {
        const meta = getPresetMeta(preset)
        // 切换供应商即清空上一供应商缓存的模型列表与选中模型（避免旧 provider 的模型 id 残留，
        // 导致下拉视觉显示默认值、但实际仍把旧模型 id 发给新端点 → “旧模型不能访问”）。
        // 归一到 DEFAULT_AI_MODEL，与模型下拉的兜底显示一致；用户拉取模型后 saveAiCustomConfig 再校正。
        // custom 保留用户已填的 baseURL。
        set({
          aiProviderPreset: preset,
          aiCustomBaseURL: preset === 'custom' ? get().aiCustomBaseURL : meta.baseURL,
          aiCustomModelOptions: [],
          aiSelectedModelId: DEFAULT_AI_MODEL
        })
      },
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
      setEasterEggEnabled: (value) => set({ easterEggEnabled: !!value }),
      setEasterEggVariant: (value) => set({ easterEggVariant: ['starry', 'blackhole'].includes(value) ? value : 'starry' }),
      setSkipFailedIconMatch: (value) => set({ skipFailedIconMatch: !!value }),
      setHomeViewMode: (mode) => set({ homeViewMode: mode }),
      setDensity: (value) => set({ density: ['compact', 'regular', 'comfy'].includes(value) ? value : 'regular' }),
      setPanelContinuous: (value) => set({ panelContinuous: !!value }),
      setListShowDescription: (value) => set({ listShowDescription: !!value }),
      setListFullDescription: (value) => set({ listFullDescription: !!value }),
      setListShowTags: (value) => set({ listShowTags: !!value }),
      setUiScale: (value) => set({ uiScale: (['large', 'normal', 'small'] as const).includes(value) ? value : 'normal' }),
      setGridIconSize: (value) => set({ gridIconSize: ['small', 'medium', 'large'].includes(value) ? value : 'medium' }),
      setAiQuickSaveEnabled: (value) => set({ aiQuickSaveEnabled: !!value }),
      setWindowHeight: (value) => {
        const next = clampWindowHeight(value)
        set({ windowHeight: next })
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
}))

const pickPersistedSettings = (state: SettingsStore): PersistedSettingsState => ({
  gridColumns: state.gridColumns,
  autoCloseWindow: state.autoCloseWindow,
  preferLocalSnapshotOnStartup: state.preferLocalSnapshotOnStartup,
  localMirrorDirectory: state.localMirrorDirectory,
  aiEnabled: state.aiEnabled,
  aiAllowLegacyUTools: state.aiAllowLegacyUTools,
  aiSelectedModelId: state.aiSelectedModelId,
  aiUseCustomProvider: state.aiUseCustomProvider,
  aiProviderPreset: state.aiProviderPreset,
  aiCustomBaseURL: state.aiCustomBaseURL,
  aiCustomApiKey: state.aiCustomApiKey,
  aiCustomModelOptions: state.aiCustomModelOptions,
  homeViewMode: state.homeViewMode,
  density: state.density,
  easterEggEnabled: state.easterEggEnabled,
  easterEggVariant: state.easterEggVariant,
  skipFailedIconMatch: state.skipFailedIconMatch,
  panelContinuous: state.panelContinuous,
  listShowDescription: state.listShowDescription,
  listFullDescription: state.listFullDescription,
  listShowTags: state.listShowTags,
  uiScale: state.uiScale,
  gridIconSize: state.gridIconSize,
  aiQuickSaveEnabled: state.aiQuickSaveEnabled,
  windowHeight: state.windowHeight,
  detachedWindowPosition: state.detachedWindowPosition,
  useUtoolsBrowser: state.useUtoolsBrowser
})

const normalizePersistedSettings = (state: Partial<SettingsState> | null | undefined): Partial<SettingsState> => {
  if (!state) return {}
  const patch: Partial<SettingsState> = { ...state }
  const rawAiEnabled = state.aiEnabled
  const rawAiUseCustomProvider = state.aiUseCustomProvider
  const rawAiAllowLegacyUTools = state.aiAllowLegacyUTools

  if (typeof patch.aiSelectedModelId !== 'string' || !patch.aiSelectedModelId.trim()) {
    patch.aiSelectedModelId = DEFAULT_AI_MODEL
  }
  if (typeof patch.aiEnabled !== 'boolean') patch.aiEnabled = false
  const allowLegacyUTools = typeof rawAiAllowLegacyUTools === 'boolean'
    ? rawAiAllowLegacyUTools
    : rawAiEnabled === true && rawAiUseCustomProvider === false
  patch.aiAllowLegacyUTools = allowLegacyUTools
  patch.aiUseCustomProvider = allowLegacyUTools
    ? (typeof rawAiUseCustomProvider === 'boolean' ? rawAiUseCustomProvider : false)
    : true
  if (typeof patch.aiCustomBaseURL !== 'string') patch.aiCustomBaseURL = getDefaultBaseURL()
  if (!['glm', 'glm-coding', 'deepseek', 'custom'].includes(patch.aiProviderPreset as string)) {
    patch.aiProviderPreset = resolvePresetByBaseURL(patch.aiCustomBaseURL ?? '')
  }
  if (typeof patch.aiCustomApiKey !== 'string') patch.aiCustomApiKey = ''
  if (typeof patch.panelContinuous !== 'boolean') patch.panelContinuous = false
  if (typeof patch.listShowDescription !== 'boolean') patch.listShowDescription = true
  if (typeof patch.listFullDescription !== 'boolean') patch.listFullDescription = true
  if (typeof patch.listShowTags !== 'boolean') patch.listShowTags = true
  if (!['small', 'medium', 'large'].includes(String(patch.gridIconSize))) patch.gridIconSize = 'medium'
  if (!['large', 'normal', 'small'].includes(String(patch.uiScale))) patch.uiScale = 'normal'
  if (typeof patch.easterEggEnabled !== 'boolean') patch.easterEggEnabled = true
  if (!['starry', 'blackhole'].includes(String(patch.easterEggVariant))) patch.easterEggVariant = 'starry'
  if (typeof patch.aiQuickSaveEnabled !== 'boolean') patch.aiQuickSaveEnabled = false
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

  return patch
}

let settingsPersistenceStarted = false
let settingsPersistPromise: Promise<void> = Promise.resolve()
let lastPersistedSettings = ''

const enqueueSettingsPersist = (state: SettingsStore): void => {
  const payload = pickPersistedSettings(state)
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

export const initializeSettingsStorePersistence = async (): Promise<void> => {
  if (settingsPersistenceStarted) return
  settingsPersistenceStarted = true

  const persisted = normalizePersistedSettings(loadSettingsSnapshot())
  if (Object.keys(persisted).length > 0) {
    useSettingsStore.setState(persisted as Partial<SettingsStore>)
  }

  if (!isUToolsDbAvailable()) return

  useSettingsStore.subscribe((state) => {
    enqueueSettingsPersist(state)
  })
  lastPersistedSettings = ''
  enqueueSettingsPersist(useSettingsStore.getState())
}

// ---- 选择器（等价旧版 getters）----

export const selectAiSettings = (s: SettingsStore): AISettingsLike => ({
  enabled: s.aiEnabled,
  allowLegacyUTools: s.aiAllowLegacyUTools,
  selectedModelId: s.aiSelectedModelId?.trim() || null,
  useCustomProvider: s.aiUseCustomProvider,
  customBaseURL: s.aiCustomBaseURL,
  customApiKey: s.aiCustomApiKey,
  customModelOptions: s.aiCustomModelOptions
})
