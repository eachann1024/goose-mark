import { type AIProviderMode } from './types'

export const MODEL_ERROR_KEYWORDS = ['model', '模型', 'not found', 'unknown', 'unsupported', 'invalid', '不存在', '不可用', '无效']

export const SETTINGS_ENTRY_HINT = '请前往“设置 -> AI 助手”检查配置。'

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

export function isModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return MODEL_ERROR_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()))
}

export async function readErrorMessage(response: Response) {
  // 一次性读取 body，避免二次消费导致空串或异常
  let raw: string
  try {
    raw = await response.text()
  } catch {
    return null
  }

  // 优先从 JSON 字段提取可读错误信息
  try {
    const payload = JSON.parse(raw)
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
    // 非 JSON 响应，直接使用原始文本
  }

  // 兜底：返回原始文本截断（防止超长错误页面）
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.length > 300 ? trimmed.slice(0, 300) + '…' : trimmed
}

export function getApiKeyMissingMessage() {
  return `未填写 API Key。${SETTINGS_ENTRY_HINT}`
}

export function getAuthFailedMessage(providerLabel: string) {
  return `${providerLabel} 鉴权失败。${SETTINGS_ENTRY_HINT}`
}

export function isInvalidJsonResponseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('invalid json response')
    || lower.includes('unexpected token')
    || (lower.includes('json') && lower.includes('response'))
}

export function normalizeStructuredOutputError(error: unknown, enabled: boolean) {
  if (!enabled) return error
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  if (
    lower.includes('json schema') ||
    lower.includes('json_schema') ||
    lower.includes('response format') ||
    lower.includes('structured output') ||
    lower.includes('no object generated')
  ) {
    return new Error('当前模型不支持所需的结构化输出，请切换到支持 JSON Schema 或原生工具调用的模型')
  }
  return error
}
