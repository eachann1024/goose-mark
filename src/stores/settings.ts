import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProviderPreset } from '@/constants/ai'
import { DEFAULT_AI_MODEL, getPresetMeta, resolvePresetByBaseURL } from '@/constants/ai'
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
/** 宫格图标尺寸：小 38px / 中 46px / 大 56px */
export type GridIconSize = 'small' | 'medium' | 'large'
/** 彩蛋背景样式 */
export type EasterEggVariant = 'starry' | 'blackhole'

export interface SettingsState {
  gridColumns: number
  autoCloseWindow: boolean
  preferLocalSnapshotOnStartup: boolean
  localMirrorDirectory: string
  aiEnabled: boolean
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
  /** 列表模式：显示书签标签 */
  listShowTags: boolean
  /** 宫格模式：图标大小 */
  gridIconSize: GridIconSize
  /** AI 快捷保存：控制 ai_quick_save uTools 特性是否注册 */
  aiQuickSaveEnabled: boolean
  /** uTools 主窗口展开高度（px），preload 启动时读取并 setExpendHeight 恢复 */
  windowHeight: number
}

/** uTools 窗口高度范围（与 preload.cjs 的 clampWindowHeight 保持一致） */
export const WINDOW_HEIGHT_MIN = 460
export const WINDOW_HEIGHT_MAX = 900
export const WINDOW_HEIGHT_DEFAULT = 600
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
  setListShowTags: (value: boolean) => void
  setGridIconSize: (value: GridIconSize) => void
  setAiQuickSaveEnabled: (value: boolean) => void
  /** 设置 uTools 窗口高度：持久化 + 即时 setExpendHeight 应用 */
  setWindowHeight: (value: number) => void
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
    listShowTags: true,
    gridIconSize: 'medium',
    aiQuickSaveEnabled: true,
    windowHeight: WINDOW_HEIGHT_DEFAULT
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
      setAiProviderPreset: (preset) => {
        const meta = getPresetMeta(preset)
        // 切换供应商即清空上一供应商缓存的模型列表（避免误用），custom 保留用户已填的 baseURL
        set({
          aiProviderPreset: preset,
          aiCustomBaseURL: preset === 'custom' ? get().aiCustomBaseURL : meta.baseURL,
          aiCustomModelOptions: []
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
      setListShowTags: (value) => set({ listShowTags: !!value }),
      setGridIconSize: (value) => set({ gridIconSize: ['small', 'medium', 'large'].includes(value) ? value : 'medium' }),
      setAiQuickSaveEnabled: (value) => set({ aiQuickSaveEnabled: !!value }),
      setWindowHeight: (value) => {
        const next = clampWindowHeight(value)
        set({ windowHeight: next })
        // 即时应用到 uTools 主窗口（preload 仅负责启动恢复，运行时调整由这里驱动）
        try {
          window.utools?.setExpendHeight?.(next)
        } catch {}
      }
    }),
    {
      name: 'settings', // 持久化 key（与旧版 Pinia $id 一致）
      // 用 any 绕过 storage 泛型与 partialize 返回类型的推断冲突（功能等价，运行时 setItem 只序列化 state）
      storage: createPiniaCompatStorage<any>(),
      // 显式数据字段白名单 partialize：排除 localMirrorDirectory（旧版 omit）及所有 actions（函数无需持久化），
      // 同时防止已删除字段（如 accentColor、searchViewMode、previewPanelWidth 等旧 UI 体系字段）
      // 通过 zustand persist 浅合并回流并再次写入 localStorage —— 旧数据水合时多余键无害，写回时被丢弃。
      partialize: (state) => ({
        gridColumns: state.gridColumns,
        autoCloseWindow: state.autoCloseWindow,
        preferLocalSnapshotOnStartup: state.preferLocalSnapshotOnStartup,
        aiEnabled: state.aiEnabled,
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
        listShowTags: state.listShowTags,
        gridIconSize: state.gridIconSize,
        aiQuickSaveEnabled: state.aiQuickSaveEnabled,
        windowHeight: state.windowHeight,
      }),
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
        // 预置字段兜底：旧数据无此字段时，从已存 baseURL 反查推断；非法值同样回退推断
        if (!['glm', 'glm-coding', 'deepseek', 'custom'].includes(state.aiProviderPreset as string)) {
          patch.aiProviderPreset = resolvePresetByBaseURL(patch.aiCustomBaseURL ?? state.aiCustomBaseURL ?? '')
        }
        if (typeof state.aiCustomApiKey !== 'string') patch.aiCustomApiKey = ''
        if (typeof state.panelContinuous !== 'boolean') patch.panelContinuous = false
        if (typeof state.listShowDescription !== 'boolean') patch.listShowDescription = true
        if (typeof state.listShowTags !== 'boolean') patch.listShowTags = true
        if (!['small', 'medium', 'large'].includes(state.gridIconSize)) patch.gridIconSize = 'medium'
        if (typeof state.easterEggEnabled !== 'boolean') patch.easterEggEnabled = true
        if (!['starry', 'blackhole'].includes(state.easterEggVariant)) patch.easterEggVariant = 'starry'
        if (typeof state.aiQuickSaveEnabled !== 'boolean') patch.aiQuickSaveEnabled = true

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
