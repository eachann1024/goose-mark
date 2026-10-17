import { type AIProtocol } from '@/constants/ai'

export type AIStructuredOutput = {
  name: string
  description: string
  schema: Record<string, unknown>
}

export type AIProviderMode = 'utools' | 'custom'

export type { AIProtocol }

export interface AIModelOption {
  id: string
  label: string
  description?: string
}

export interface AISettingsLike {
  enabled: boolean
  allowLegacyUTools: boolean
  selectedModelId: string | null
  useCustomProvider: boolean
  /** DeepSeek / OpenAI Responses / OpenAI-compatible Chat Completions / Anthropic */
  protocol: AIProtocol
  customBaseURL: string
  customApiKey: string
  customModelOptions: AIModelOption[]
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content?: string
}

export interface RunAITextOptions {
  output?: AIStructuredOutput
}
