import { type AIProtocol } from '@/constants/ai'
import { type AIModelOption } from './types'
import { ANTHROPIC_API_VERSION, getOpenAIModelsUrl, resolveCustomBaseURL, getProtocolLabel } from './config'
import { readErrorMessage, getApiKeyMissingMessage, getAuthFailedMessage } from './errors'

export function normalizeModelOption(input: unknown): AIModelOption | null {
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

export async function fetchCustomAIModels(config: {
  baseURL: string
  apiKey: string
  protocol?: AIProtocol
}) {
  const protocol: AIProtocol =
    config.protocol === 'anthropic' ||
    config.protocol === 'openai-compatible' ||
    config.protocol === 'openai-responses'
      ? config.protocol
      : 'openai-responses'
  const apiKey = config.apiKey.trim()
  const baseURL = resolveCustomBaseURL(protocol, config.baseURL)
  if (!apiKey) {
    throw new Error(getApiKeyMissingMessage())
  }

  // 模型列表接口最多等待 15 秒，防止错误地址永久挂起（含响应体读取阶段）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const headers: Record<string, string> =
      protocol === 'anthropic'
        ? {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION
          }
        : {
            Authorization: `Bearer ${apiKey}`
          }

    const response = await fetch(getOpenAIModelsUrl(baseURL), {
      signal: controller.signal,
      headers
    })

    if (!response.ok) {
      const detail = await readErrorMessage(response)
      if (response.status === 401 || response.status === 403) {
        throw new Error(getAuthFailedMessage(getProtocolLabel(protocol)))
      }
      throw new Error(detail || `读取模型列表失败（${response.status}）`)
    }

    const payload = await response.json()
    const rawModels = Array.isArray(payload?.data) ? payload.data : []
    const models = rawModels
      .map((item: unknown) => normalizeModelOption(item))
      .filter((item: AIModelOption | null): item is AIModelOption => Boolean(item))

    if (!models.length) throw new Error('未读取到可用模型')

    return models
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('请求超时，请检查接口地址是否可达')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
