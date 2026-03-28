import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { getAvailableUToolsAiModels, isUToolsAiSupported, resolvePreferredUToolsModel } from '@/lib/utoolsAi'

const MODEL_ERROR_KEYWORDS = ['model', '模型', 'not found', 'unknown', 'unsupported', 'invalid', '不存在', '不可用', '无效']
const DEFAULT_CUSTOM_PROTOCOL = 'openai'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com/v1'
const SETTINGS_ENTRY_HINT = '请前往“设置 -> AI 助手”检查配置。'

export type CustomAIProtocol = 'openai' | 'claude'
export type AIProviderMode = 'utools' | 'custom'

export interface AIModelOption {
  id: string
  label: string
  description?: string
}

export interface AISettingsLike {
  enabled: boolean
  selectedModelId: string | null
  useCustomProvider: boolean
  customProtocol: CustomAIProtocol
  customBaseURL: string
  customApiKey: string
  customModelOptions: AIModelOption[]
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content?: string
}

export class AIProviderRequestError extends Error {
  override cause: unknown
  provider: AIProviderMode
  model: string
  fallbackAttempted: boolean
  isCustomModel: boolean

  constructor(input: {
    cause: unknown
    provider: AIProviderMode
    model: string
    fallbackAttempted?: boolean
    isCustomModel: boolean
  }) {
    super(input.cause instanceof Error ? input.cause.message : String(input.cause))
    this.name = 'AIProviderRequestError'
    this.cause = input.cause
    this.provider = input.provider
    this.model = input.model
    this.fallbackAttempted = !!input.fallbackAttempted
    this.isCustomModel = input.isCustomModel
  }
}

function getUToolsApi() {
  if (typeof window === 'undefined') return null
  return window.utools ?? null
}

function isModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return MODEL_ERROR_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()))
}

function normalizeMessages(messages: AIMessage[]) {
  return messages
    .filter(message => typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role,
      content: message.content!.trim()
    }))
}

function normalizeModelOption(input: unknown): AIModelOption | null {
  if (!input) return null

  if (typeof input === 'string') {
    const id = input.trim()
    return id ? { id, label: id } : null
  }

  if (typeof input !== 'object') return null

  const maybeModel = input as {
    id?: unknown
    name?: unknown
    display_name?: unknown
    description?: unknown
    type?: unknown
  }

  const id = typeof maybeModel.id === 'string' ? maybeModel.id.trim() : ''
  if (!id) return null

  const labelSource =
    typeof maybeModel.display_name === 'string' && maybeModel.display_name.trim()
      ? maybeModel.display_name.trim()
      : typeof maybeModel.name === 'string' && maybeModel.name.trim()
        ? maybeModel.name.trim()
        : id

  const descriptionParts = [
    typeof maybeModel.description === 'string' ? maybeModel.description.trim() : '',
    typeof maybeModel.type === 'string' ? maybeModel.type.trim() : ''
  ].filter(Boolean)

  return {
    id,
    label: labelSource,
    description: descriptionParts.length ? descriptionParts.join(' · ') : undefined
  }
}

function getOpenAIModelsUrl(baseURL: string) {
  return `${baseURL.replace(/\/+$/, '')}/models`
}

export function getDefaultBaseURL(protocol: CustomAIProtocol) {
  return protocol === 'claude' ? DEFAULT_CLAUDE_BASE_URL : DEFAULT_OPENAI_BASE_URL
}

async function readErrorMessage(response: Response) {
  try {
    const payload = await response.json()
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error.trim()
    }
    if (typeof payload?.error?.message === 'string' && payload.error.message.trim()) {
      return payload.error.message.trim()
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim()
    }
  } catch {
    // ignore non-json responses
  }

  try {
    const text = await response.text()
    return text.trim() || null
  } catch {
    return null
  }
}

function getApiKeyMissingMessage() {
  return `未填写 API Key。${SETTINGS_ENTRY_HINT}`
}

function getAuthFailedMessage(providerLabel: string) {
  return `${providerLabel} 鉴权失败。${SETTINGS_ENTRY_HINT}`
}

function getSelectedCustomModelId(settings: AISettingsLike) {
  const selectedModelId = settings.selectedModelId?.trim()
  if (selectedModelId) return selectedModelId
  return settings.customModelOptions[0]?.id ?? null
}

function extractTextPayload(result: string | { text?: string; content?: string }) {
  const text = typeof result === 'string'
    ? result
    : typeof result?.content === 'string'
      ? result.content
      : typeof result?.text === 'string'
        ? result.text
        : ''

  const normalizedText = text.trim()
  if (!normalizedText) {
    throw new Error('AI 没有返回可用内容')
  }

  return normalizedText
}

async function runUToolsText(settings: AISettingsLike, messages: AIMessage[]) {
  const utools = getUToolsApi()
  if (!utools?.ai) {
    throw new AIProviderRequestError({
      cause: new Error('当前 uTools 版本未提供 AI 能力'),
      provider: 'utools',
      model: settings.selectedModelId?.trim() || DEFAULT_AI_MODEL,
      isCustomModel: false
    })
  }

  const modelId = await resolvePreferredUToolsModel(settings.selectedModelId)

  try {
    const result = await utools.ai({
      model: modelId,
      messages: normalizeMessages(messages)
    })
    return extractTextPayload(result)
  } catch (error) {
    if (!isModelError(error)) {
      throw new AIProviderRequestError({
        cause: error,
        provider: 'utools',
        model: modelId,
        isCustomModel: false
      })
    }

    try {
      const result = await utools.ai({
        messages: normalizeMessages(messages)
      })
      return extractTextPayload(result)
    } catch (fallbackError) {
      throw new AIProviderRequestError({
        cause: fallbackError,
        provider: 'utools',
        model: modelId,
        fallbackAttempted: true,
        isCustomModel: false
      })
    }
  }
}

async function runCustomText(settings: AISettingsLike, messages: AIMessage[]) {
  const selectedModelId = getSelectedCustomModelId(settings)
  if (!selectedModelId) {
    throw new AIProviderRequestError({
      cause: new Error('请先保存自定义 AI 配置并获取模型列表'),
      provider: 'custom',
      model: '',
      isCustomModel: true
    })
  }

  const model = settings.customProtocol === 'openai'
    ? createOpenAICompatible({
        baseURL: settings.customBaseURL.trim() || getDefaultBaseURL('openai'),
        apiKey: settings.customApiKey.trim(),
        name: 'custom.openai'
      }).chatModel(selectedModelId)
    : createAnthropic({
        baseURL: settings.customBaseURL.trim() || getDefaultBaseURL('claude'),
        apiKey: settings.customApiKey.trim(),
        name: 'custom.claude'
      })(selectedModelId)

  try {
    const { text } = await generateText({
      model,
      messages: normalizeMessages(messages)
    })

    const normalizedText = text.trim()
    if (!normalizedText) {
      throw new Error('AI 没有返回可用内容')
    }

    return normalizedText
  } catch (error) {
    throw new AIProviderRequestError({
      cause: error,
      provider: 'custom',
      model: selectedModelId,
      isCustomModel: true
    })
  }
}

export function normalizeAIModelOptions(modelOptions: AIModelOption[] | undefined) {
  if (!Array.isArray(modelOptions)) {
    return [] as AIModelOption[]
  }

  return modelOptions
    .filter((item): item is AIModelOption => Boolean(item && typeof item === 'object'))
    .map(item => ({
      id: typeof item.id === 'string' ? item.id.trim() : '',
      label: typeof item.label === 'string' ? item.label.trim() : '',
      description: typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : undefined
    }))
    .filter(item => item.id && item.label)
}

export function getAIProviderMode(settings: AISettingsLike): AIProviderMode {
  return settings.useCustomProvider ? 'custom' : 'utools'
}

export function getStoredAIModelOptions(settings: AISettingsLike) {
  return settings.useCustomProvider ? settings.customModelOptions : []
}

export function getAIAvailability(settings: AISettingsLike) {
  if (!settings.enabled) {
    return { ok: false as const, reason: 'AI 助手尚未开启，请先到设置中打开' }
  }

  if (settings.useCustomProvider) {
    if (!settings.customApiKey.trim()) {
      return { ok: false as const, reason: getApiKeyMissingMessage() }
    }

    if (!getSelectedCustomModelId(settings)) {
      return { ok: false as const, reason: '请先保存自定义 AI 配置并获取模型列表' }
    }

    return { ok: true as const, provider: 'custom' as const }
  }

  const utools = getUToolsApi()
  if (!utools) {
    return { ok: false as const, reason: '当前不在 uTools 环境中运行，请切换到自定义 AI' }
  }

  if (!isUToolsAiSupported() || typeof utools.ai !== 'function') {
    return { ok: false as const, reason: '请在 uTools 设置中开启 AI 功能' }
  }

  return { ok: true as const, provider: 'utools' as const }
}

export async function fetchCustomAIModels(config: {
  protocol: CustomAIProtocol
  baseURL: string
  apiKey: string
}) {
  const apiKey = config.apiKey.trim()
  const baseURL = config.baseURL.trim() || getDefaultBaseURL(config.protocol)
  if (!apiKey) {
    throw new Error(getApiKeyMissingMessage())
  }

  const response = config.protocol === 'openai'
    ? await fetch(getOpenAIModelsUrl(baseURL), {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
    : await fetch(getOpenAIModelsUrl(baseURL), {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    if (response.status === 401 || response.status === 403) {
      throw new Error(getAuthFailedMessage(config.protocol === 'openai' ? 'OpenAI 兼容接口' : 'Claude 接口'))
    }
    throw new Error(detail || `读取模型列表失败（${response.status}）`)
  }

  const payload = await response.json()
  const rawModels = Array.isArray(payload?.data) ? payload.data : []
  const models = rawModels
    .map((item: unknown) => normalizeModelOption(item))
    .filter((item: AIModelOption | null): item is AIModelOption => Boolean(item))

  if (!models.length) {
    throw new Error('未读取到可用模型')
  }

  return models
}

export async function runAIText(settings: AISettingsLike, messages: AIMessage[]) {
  const availability = getAIAvailability(settings)
  if (!availability.ok) {
    throw new Error(availability.reason)
  }

  return availability.provider === 'custom'
    ? runCustomText(settings, messages)
    : runUToolsText(settings, messages)
}

export async function getAvailableAIModels(settings: AISettingsLike) {
  if (settings.useCustomProvider) {
    return settings.customModelOptions
  }
  return getAvailableUToolsAiModels()
}

export function getDefaultAISettings() {
  return {
    enabled: true,
    selectedModelId: DEFAULT_AI_MODEL,
    useCustomProvider: false,
    customProtocol: DEFAULT_CUSTOM_PROTOCOL as CustomAIProtocol,
    customBaseURL: getDefaultBaseURL(DEFAULT_CUSTOM_PROTOCOL as CustomAIProtocol),
    customApiKey: '',
    customModelOptions: [] as AIModelOption[]
  }
}
