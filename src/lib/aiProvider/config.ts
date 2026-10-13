import { DEFAULT_AI_MODEL, DEFAULT_ANTHROPIC_MODEL, getProtocolMeta, type AIProtocol } from '@/constants/ai'
import { type AIProviderMode, type AIModelOption, type AISettingsLike } from './types'

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'

export const ANTHROPIC_API_VERSION = '2023-06-01'

export function getOpenAIModelsUrl(baseURL: string) {
  return `${baseURL.replace(/\/+$/, '')}/models`
}

export function getOpenAIResponsesUrl(baseURL: string) {
  return `${baseURL.replace(/\/+$/, '')}/responses`
}

export function getDefaultBaseURL(protocol: AIProtocol = 'openai-responses') {
  return protocol === 'anthropic' ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL
}

/** 解析用户自定义 Base URL，空值回落到协议官方默认 */
export function resolveCustomBaseURL(
  protocol: AIProtocol,
  customBaseURL?: string | null
): string {
  const trimmed = (customBaseURL || '').trim().replace(/\/+$/, '')
  return trimmed || getDefaultBaseURL(protocol).replace(/\/+$/, '')
}

export function getDefaultModelId(protocol: AIProtocol = 'openai-responses') {
  return protocol === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_AI_MODEL
}

export function getProtocolLabel(protocol: AIProtocol) {
  if (protocol === 'anthropic') return 'Anthropic 原生接口'
  if (protocol === 'openai-compatible') return 'OpenAI 兼容接口'
  return 'OpenAI Responses API'
}

export function getSelectedCustomModelId(settings: AISettingsLike) {
  const selectedModelId = settings.selectedModelId?.trim()
  if (selectedModelId) return selectedModelId
  return settings.customModelOptions[0]?.id ?? null
}

export function shouldUseLegacyUTools(settings: AISettingsLike) {
  return settings.allowLegacyUTools && !settings.useCustomProvider
}

export function getAIProviderMode(settings: AISettingsLike): AIProviderMode {
  return shouldUseLegacyUTools(settings) ? 'utools' : 'custom'
}

export function getStoredAIModelOptions(settings: AISettingsLike) {
  return settings.useCustomProvider ? settings.customModelOptions : []
}

export function getDefaultAISettings() {
  const protocol: AIProtocol = 'openai-responses'
  return {
    enabled: false,
    allowLegacyUTools: false,
    selectedModelId: getDefaultModelId(protocol),
    useCustomProvider: true,
    protocol,
    customBaseURL: getDefaultBaseURL(protocol),
    customApiKey: '',
    customModelOptions: [] as AIModelOption[]
  }
}

/** 切换协议时的默认字段（BaseURL / 默认模型），供 settings store 使用 */
export function getProtocolDefaults(protocol: AIProtocol) {
  const meta = getProtocolMeta(protocol)
  return {
    protocol: meta.id,
    baseURL: meta.baseURL,
    defaultModel: meta.defaultModel
  }
}
