import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { AIModelOption } from '@/lib/aiProvider'
import {
  fetchCustomAIModels,
  getDefaultBaseURL,
  getStoredAIModelOptions
} from '@/lib/aiProvider'
import { getAvailableUToolsAiModels, isUToolsAiSupported } from '@/lib/utoolsAi'
import { useSettingsStore, selectAiSettings } from '@/stores/settings'
import { useAppState } from '@/hooks/useAppState'
import { useUIManager } from '@/hooks/useUIManager'
import { Button, Input, Switch, SettingsBlock, SettingsRow } from './_ui'

type UToolsAiModel = {
  id: string
  label: string
  description?: string
  icon?: string
  cost?: string
}

type AnyModel = UToolsAiModel | AIModelOption

/**
 * AISettings：AI 助手设置（uTools 自带 AI vs 自定义 OpenAI 兼容供应商 + 模型选择）。
 * 对应旧 Vue views/settings/AISettings.vue，功能等价；无埋点。
 */
export default function AISettings() {
  const s = useSettingsStore()
  const aiSettings = useSettingsStore(selectAiSettings)
  const { isUTools } = useAppState()
  const showToast = useUIManager((u) => u.showToast)

  const [customBaseURL, setCustomBaseURL] = useState(s.aiCustomBaseURL)
  const [customApiKey, setCustomApiKey] = useState(s.aiCustomApiKey)
  const [customSaveError, setCustomSaveError] = useState('')
  const [savingCustomConfig, setSavingCustomConfig] = useState(false)

  const [utoolsModels, setUtoolsModels] = useState<UToolsAiModel[]>([])
  const [loadingUToolsModels, setLoadingUToolsModels] = useState(false)
  const [utoolsLoadError, setUtoolsLoadError] = useState('')
  const [utoolsFallbackNotice, setUtoolsFallbackNotice] = useState('')
  const [isModelPopoverOpen, setIsModelPopoverOpen] = useState(false)

  const popoverRef = useRef<HTMLDivElement | null>(null)

  const usingCustomProvider = s.aiUseCustomProvider
  const aiSupported = isUTools && isUToolsAiSupported()
  const customModels = useMemo(
    () => getStoredAIModelOptions(aiSettings),
    [aiSettings]
  )
  const currentModels: AnyModel[] = usingCustomProvider
    ? customModels
    : utoolsModels
  const currentModel =
    currentModels.find((m) => m.id === s.aiSelectedModelId) ?? null

  const saveButtonReason = savingCustomConfig
    ? '正在保存并读取模型列表'
    : !customApiKey.trim()
      ? '请先填写 API Key'
      : ''

  const modelHint = (() => {
    if (!s.aiEnabled) return '先打开 AI 助手后再选择模型'
    if (usingCustomProvider) {
      if (savingCustomConfig) return '模型列表读取中，请稍候'
      if (customSaveError) return customSaveError
      if (!customModels.length) return '请先填写并保存自定义 AI 配置'
      return '选择后会用于书签的标题简介生成和分类推荐'
    }
    if (!isUTools) return '当前不在 uTools 环境，请切换到自定义 AI'
    if (!aiSupported) return '当前 uTools 版本未提供 AI 能力'
    if (loadingUToolsModels) return '正在读取 uTools AI 模型列表'
    if (utoolsLoadError) return utoolsLoadError
    if (utoolsFallbackNotice) return utoolsFallbackNotice
    if (!utoolsModels.length) return '当前未读取到可用模型，请先在 uTools 中配置 AI'
    return '选择后会用于书签的标题简介生成和分类推荐'
  })()

  const canOpenModelSelector = (() => {
    if (!s.aiEnabled) return false
    if (usingCustomProvider)
      return customModels.length > 0 && !savingCustomConfig
    return aiSupported && utoolsModels.length > 0 && !loadingUToolsModels
  })()

  const loadUToolsModels = async (force = false) => {
    if (
      !s.aiEnabled ||
      usingCustomProvider ||
      !isUTools ||
      !aiSupported
    ) {
      setUtoolsModels([])
      setUtoolsLoadError(
        !isUTools ? '' : aiSupported ? '' : '当前 uTools 版本未提供 AI 能力'
      )
      return
    }
    if (!force && loadingUToolsModels) return

    setLoadingUToolsModels(true)
    setUtoolsLoadError('')
    setUtoolsFallbackNotice('')

    try {
      const models = await getAvailableUToolsAiModels()
      setUtoolsModels(models)

      if (!models.length) return

      const currentSelectedModelId = s.aiSelectedModelId?.trim()
      const hasSelectedModel =
        currentSelectedModelId &&
        models.some((m) => m.id === currentSelectedModelId)
      if (!hasSelectedModel) {
        s.setAiSelectedModelId(models[0].id)
        if (currentSelectedModelId) {
          setUtoolsFallbackNotice(
            `已保存模型 ${currentSelectedModelId} 不可用，已自动切换为 ${models[0].label}`
          )
        }
      }
    } catch (error) {
      console.error('[AISettings] Load uTools models failed:', error)
      setUtoolsModels([])
      setUtoolsLoadError(
        error instanceof Error
          ? error.message
          : '模型列表读取失败，请稍后重试'
      )
    } finally {
      setLoadingUToolsModels(false)
    }
  }

  const handleSaveCustomConfig = async () => {
    if (saveButtonReason) {
      showToast({ title: saveButtonReason, variant: 'warning' })
      return
    }

    setSavingCustomConfig(true)
    setCustomSaveError('')

    try {
      const modelOptions = await fetchCustomAIModels({
        baseURL: customBaseURL,
        apiKey: customApiKey
      })

      s.saveAiCustomConfig({
        baseURL: customBaseURL,
        apiKey: customApiKey,
        modelOptions
      })
      s.setAiSelectedModelId(modelOptions[0]?.id ?? s.aiSelectedModelId)
      showToast({ title: '自定义 AI 已保存', variant: 'success' })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '保存自定义 AI 失败'
      setCustomSaveError(message)
      showToast({ title: message, variant: 'error' })
    } finally {
      setSavingCustomConfig(false)
    }
  }

  const selectModel = (modelId: string) => {
    s.setAiSelectedModelId(modelId)
    setIsModelPopoverOpen(false)
  }

  // 同步 store -> 本地输入（旧版 watch aiCustomBaseURL / aiCustomApiKey）
  useEffect(() => {
    setCustomBaseURL(s.aiCustomBaseURL)
  }, [s.aiCustomBaseURL])
  useEffect(() => {
    setCustomApiKey(s.aiCustomApiKey)
  }, [s.aiCustomApiKey])

  // 旧版 watch([aiEnabled, aiUseCustomProvider, isUTools, aiSupported]) immediate
  useEffect(() => {
    if (!s.aiEnabled) {
      setIsModelPopoverOpen(false)
      return
    }
    if (!s.aiUseCustomProvider) {
      void loadUToolsModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.aiEnabled, s.aiUseCustomProvider, isUTools, aiSupported])

  // 点击外部关闭 model popover
  useEffect(() => {
    if (!isModelPopoverOpen) return
    const onDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsModelPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [isModelPopoverOpen])

  return (
    <div className="flex flex-col gap-3">
      <SettingsBlock title="AI 助手" desc="控制书签 AI 入口与可用范围">
        <SettingsRow
          label="启用 AI 功能"
          hint="关闭后会隐藏书签里的 AI 生成与分类推荐入口"
        >
          <Switch
            checked={s.aiEnabled}
            aria-label="启用 AI 功能"
            onChange={(checked) => s.setAiEnabled(checked)}
          />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock
        title="AI 来源"
        desc="默认使用 uTools AI，也可以切到自定义 OpenAI 兼容接口"
      >
        <div className="space-y-3">
          <SettingsRow
            label="使用自定义 OpenAI 兼容接口"
            hint="DeepSeek、Moonshot、智谱、本地 Ollama 等均走该协议"
          >
            <Switch
              checked={s.aiUseCustomProvider}
              aria-label="切换自定义 AI"
              onChange={(checked) => s.setAiCustomProviderEnabled(checked)}
            />
          </SettingsRow>

          {usingCustomProvider ? (
            <>
              <div className="settings-field">
                <label className="settings-field__label">Base URL</label>
                <Input
                  value={customBaseURL}
                  onChange={(e) => setCustomBaseURL(e.target.value)}
                  placeholder={getDefaultBaseURL()}
                  className="h-9"
                  autoComplete="off"
                />
              </div>

              <div className="settings-field">
                <label className="settings-field__label">API Key</label>
                <Input
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  type="password"
                  placeholder="输入后点击保存自动拉取模型"
                  className="h-9"
                  autoComplete="off"
                />
              </div>

              <SettingsRow
                label="保存配置"
                hint={saveButtonReason || '保存后会读取可用模型列表'}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 px-3"
                  disabled={!!saveButtonReason}
                  onClick={handleSaveCustomConfig}
                >
                  {savingCustomConfig ? '保存中...' : '保存'}
                </Button>
              </SettingsRow>
            </>
          ) : !isUTools ? (
            <p className="text-xs text-muted-foreground">
              当前不在 uTools 环境，可切换到自定义 AI 使用。
            </p>
          ) : !aiSupported ? (
            <p className="text-xs text-muted-foreground">
              当前 uTools 版本未提供 AI 能力，可切换到自定义 AI。
            </p>
          ) : null}
        </div>
      </SettingsBlock>

      <SettingsBlock title="AI 模型" desc="选择书签 AI 默认使用的模型">
        <div className="space-y-2">
          <div className="settings-row">
            <label className="text-sm font-medium">默认模型</label>
            <div className="flex items-center gap-2">
              {!usingCustomProvider && isUTools ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => loadUToolsModels(true)}
                >
                  刷新
                </Button>
              ) : usingCustomProvider ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={handleSaveCustomConfig}
                >
                  重新获取
                </Button>
              ) : null}

              <div className="relative" ref={popoverRef}>
                <Button
                  variant="outline"
                  className="h-9 min-w-[220px] justify-between px-3 font-normal"
                  disabled={!canOpenModelSelector}
                  onClick={() =>
                    canOpenModelSelector &&
                    setIsModelPopoverOpen((v) => !v)
                  }
                >
                  <span
                    className={`truncate text-left ${
                      canOpenModelSelector
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {currentModel?.label || '请选择模型'}
                  </span>
                  <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>

                {isModelPopoverOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-xl border border-border bg-popover p-1 shadow-lg">
                    <div className="max-h-72 space-y-1 overflow-y-auto custom-scroll">
                      {currentModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className="settings-list-item"
                          onClick={() => selectModel(model.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">
                              {model.label}
                            </div>
                            <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              {model.description || model.id}
                            </div>
                          </div>
                          {s.aiSelectedModelId === model.id && (
                            <Check className="ml-2 size-4 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{modelHint}</p>
        </div>
      </SettingsBlock>
    </div>
  )
}
