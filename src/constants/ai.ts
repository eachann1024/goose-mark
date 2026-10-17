/** OpenAI 系列协议默认模型（用户拉取列表前的占位） */
export const DEFAULT_AI_MODEL = 'gpt-4o-mini'

/** Anthropic（A 社）默认模型 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5'

/** DeepSeek 默认模型。官方文档：https://api-docs.deepseek.com/ */
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

/** 拉取模型失败或列表为空时的兜底 */
export const DEEPSEEK_FALLBACK_MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }
]

/** 接入协议：DeepSeek / OpenAI Responses / OpenAI-compatible Chat Completions / Anthropic */
export type AIProtocol = 'deepseek' | 'openai-responses' | 'openai-compatible' | 'anthropic'

/** 实际发请求的线路。DeepSeek 会按模型再落到 Responses 或 Chat Completions。 */
export type AIWireProtocol = Exclude<AIProtocol, 'deepseek'>

export interface AIProtocolMeta {
  id: AIProtocol
  label: string
  /** 默认 Base URL */
  baseURL: string
  /** 列表中展示的简短说明 */
  hint: string
  defaultModel: string
}

/**
 * 支持的 AI 协议。DeepSeek 放在第一项。
 * - deepseek：官方 API。Flash → Responses；Pro → Chat Completions
 * - openai-responses：OpenAI Responses API
 * - openai-compatible：兼容 OpenAI Chat Completions 的服务
 * - anthropic：Anthropic 原生 Messages 协议
 */
export const AI_PROTOCOLS: AIProtocolMeta[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: DEEPSEEK_BASE_URL,
    hint: '官方 API',
    defaultModel: DEFAULT_DEEPSEEK_MODEL
  },
  {
    id: 'openai-responses',
    label: 'OpenAI Responses',
    baseURL: 'https://api.openai.com/v1',
    hint: 'OpenAI 官方新协议',
    defaultModel: DEFAULT_AI_MODEL
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI 兼容',
    baseURL: 'https://api.openai.com/v1',
    hint: 'Chat Completions，兼容多数模型与中转服务',
    defaultModel: DEFAULT_AI_MODEL
  },
  {
    id: 'anthropic',
    label: 'Anthropic 原生',
    baseURL: 'https://api.anthropic.com/v1',
    hint: 'Claude 原生协议',
    defaultModel: DEFAULT_ANTHROPIC_MODEL
  }
]

export function getProtocolMeta(protocol: AIProtocol): AIProtocolMeta {
  return AI_PROTOCOLS.find((p) => p.id === protocol) ?? AI_PROTOCOLS[0]
}

export function isAIProtocol(value: unknown): value is AIProtocol {
  return value === 'deepseek' || value === 'openai-responses' || value === 'openai-compatible' || value === 'anthropic'
}

export function isDeepSeekBaseURL(baseURL: string) {
  return (baseURL || '').trim().toLowerCase().includes('deepseek.com')
}

/** DeepSeek V4 Pro 尚不支持 Responses，走兼容 Chat Completions。 */
export function isDeepSeekProModel(modelId: string | null | undefined): boolean {
  if (!modelId) return false
  return /deepseek-v4-pro|v4-pro/i.test(modelId.trim())
}

/**
 * 解析实际请求线路。
 * DeepSeek：Flash → openai-responses；Pro → openai-compatible。
 */
export function resolveRequestProtocol(protocol: AIProtocol, modelId?: string | null): AIWireProtocol {
  if (protocol === 'deepseek') {
    return isDeepSeekProModel(modelId) ? 'openai-compatible' : 'openai-responses'
  }
  return protocol
}

/**
 * 从历史 Base URL 推断协议（迁移用）。
 * deepseek 主机名迁移到 DeepSeek，anthropic 主机名迁移到 Anthropic，其余迁移到 OpenAI 兼容。
 */
export function resolveProtocolByBaseURL(baseURL: string): AIProtocol {
  const normalized = (baseURL || '').trim().toLowerCase()
  if (isDeepSeekBaseURL(normalized)) return 'deepseek'
  if (normalized.includes('anthropic.com') || normalized.includes('/anthropic')) {
    return 'anthropic'
  }
  return 'openai-compatible'
}
