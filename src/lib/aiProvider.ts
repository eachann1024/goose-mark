import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { getAvailableUToolsAiModels, isUToolsAiSupported, resolvePreferredUToolsModel } from '@/lib/utoolsAi'

const MODEL_ERROR_KEYWORDS = ['model', '模型', 'not found', 'unknown', 'unsupported', 'invalid', '不存在', '不可用', '无效']
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const SETTINGS_ENTRY_HINT = '请前往“设置 -> AI 助手”检查配置。'

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

function getOpenAIChatCompletionsUrl(baseURL: string) {
  return `${baseURL.replace(/\/+$/, '')}/chat/completions`
}

export function getDefaultBaseURL() {
  return DEFAULT_OPENAI_BASE_URL
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const combined = content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!isRecord(part)) return ''

      if (typeof part.text === 'string') return part.text
      if (typeof part.output_text === 'string') return part.output_text
      if (typeof part.content === 'string') return part.content
      return ''
    })
    .join('')
    .trim()

  return combined
}

function extractTextFromJsonPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim()
  }

  if (!isRecord(payload)) {
    return ''
  }

  const directFields = [
    payload.text,
    payload.output_text,
    payload.content,
    payload.response,
    payload.answer,
    payload.result
  ]

  for (const field of directFields) {
    const text = typeof field === 'string'
      ? field.trim()
      : isRecord(field)
        ? extractTextFromJsonPayload(field)
        : extractTextFromContent(field)
    if (text) return text
  }

  if (Array.isArray(payload.choices)) {
    const deltaParts: string[] = []

    for (const choice of payload.choices) {
      if (!isRecord(choice)) continue

      const message = isRecord(choice.message) ? choice.message : null
      const delta = isRecord(choice.delta) ? choice.delta : null
      const text = [
        typeof choice.text === 'string' ? choice.text.trim() : '',
        extractTextFromContent(message?.content),
        extractTextFromContent(delta?.content),
        typeof delta?.text === 'string' ? delta.text.trim() : '',
        typeof message?.text === 'string' ? message.text.trim() : ''
      ].find(Boolean)

      if (text) {
        if (delta && !message && typeof choice.text !== 'string') {
          deltaParts.push(text)
          continue
        }
        return text
      }
    }

    const combinedDelta = deltaParts.join('').trim()
    if (combinedDelta) return combinedDelta
  }

  if (Array.isArray(payload.output)) {
    const outputText = payload.output
      .map(item => extractTextFromJsonPayload(item))
      .join('')
      .trim()

    if (outputText) return outputText
  }

  if (Array.isArray(payload.data)) {
    const nestedText = payload.data
      .map(item => extractTextFromJsonPayload(item))
      .find(Boolean)

    if (nestedText) return nestedText
  }

  return ''
}

function extractTextFromSSEPayload(rawText: string) {
  const dataLines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(line => line && line !== '[DONE]')

  if (!dataLines.length) {
    return ''
  }

  const deltaParts: string[] = []

  for (const line of dataLines) {
    try {
      const payload = JSON.parse(line)
      const text = extractTextFromJsonPayload(payload)
      if (text) {
        if (isRecord(payload) && Array.isArray(payload.choices)) {
          deltaParts.push(text)
          continue
        }
        return text
      }
    } catch {
      continue
    }
  }

  return deltaParts.join('').trim()
}

async function readCustomOpenAIResponse(response: Response) {
  const rawText = (await response.text()).trim()
  if (!rawText) {
    throw new Error('AI 没有返回可用内容')
  }

  try {
    const payload = JSON.parse(rawText)
    const text = extractTextFromJsonPayload(payload)
    if (text) return text
  } catch {
    // ignore and continue with tolerant fallbacks
  }

  const sseText = extractTextFromSSEPayload(rawText)
  if (sseText) return sseText

  if (!/<\/?[a-z][\s\S]*>/i.test(rawText)) {
    return rawText
  }

  throw new Error('AI 返回格式无法识别，请检查自定义供应商的响应格式')
}

function isInvalidJsonResponseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('invalid json response')
    || lower.includes('unexpected token')
    || (lower.includes('json') && lower.includes('response'))
}

async function runCustomOpenAICompatibleText(settings: AISettingsLike, messages: AIMessage[], selectedModelId: string) {
  const baseURL = settings.customBaseURL.trim() || getDefaultBaseURL()
  const response = await fetch(getOpenAIChatCompletionsUrl(baseURL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.customApiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream, text/plain, */*'
    },
    body: JSON.stringify({
      model: selectedModelId,
      messages: normalizeMessages(messages),
      stream: false
    })
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    if (response.status === 401 || response.status === 403) {
      throw new Error(getAuthFailedMessage('OpenAI 兼容接口'))
    }
    throw new Error(detail || `调用自定义 AI 失败（${response.status}）`)
  }

  return readCustomOpenAIResponse(response)
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

  const model = createOpenAICompatible({
    baseURL: settings.customBaseURL.trim() || getDefaultBaseURL(),
    apiKey: settings.customApiKey.trim(),
    name: 'custom.openai'
  }).chatModel(selectedModelId)

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
    if (isInvalidJsonResponseError(error)) {
      try {
        return await runCustomOpenAICompatibleText(settings, messages, selectedModelId)
      } catch (fallbackError) {
        throw new AIProviderRequestError({
          cause: fallbackError,
          provider: 'custom',
          model: selectedModelId,
          isCustomModel: true
        })
      }
    }

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
  baseURL: string
  apiKey: string
}) {
  const apiKey = config.apiKey.trim()
  const baseURL = config.baseURL.trim() || getDefaultBaseURL()
  if (!apiKey) {
    throw new Error(getApiKeyMissingMessage())
  }

  const response = await fetch(getOpenAIModelsUrl(baseURL), {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    if (response.status === 401 || response.status === 403) {
      throw new Error(getAuthFailedMessage('OpenAI 兼容接口'))
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
    customBaseURL: getDefaultBaseURL(),
    customApiKey: '',
    customModelOptions: [] as AIModelOption[]
  }
}
