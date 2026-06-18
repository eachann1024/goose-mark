export const DEFAULT_AI_MODEL = 'deepseek-v3.2'

/** OpenAI 协议供应商预置标识 */
export type AIProviderPreset = 'glm' | 'glm-coding' | 'deepseek' | 'custom'

export interface AIProviderPresetMeta {
  id: AIProviderPreset
  label: string
  /** OpenAI 兼容 BaseURL；custom 为空，由用户手填 */
  baseURL: string
  /** 列表中展示的简短地址说明 */
  hint: string
}

/**
 * 预置供应商列表（OpenAI 协议）。
 * - GLM：智谱开放平台标准端点
 * - GLM Coding Plan：智谱包月编程套餐专用端点（49 元/月起）
 * - DeepSeek：DeepSeek 官方端点
 * - 自定义：用户手填 BaseURL
 */
export const AI_PROVIDER_PRESETS: AIProviderPresetMeta[] = [
  { id: 'glm', label: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', hint: 'open.bigmodel.cn/api/paas/v4' },
  { id: 'glm-coding', label: 'GLM Coding Plan', baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4', hint: 'open.bigmodel.cn/api/coding/paas/v4' },
  { id: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', hint: 'api.deepseek.com/v1' },
  { id: 'custom', label: '自定义', baseURL: '', hint: '手动填写 Base URL' }
]

/** 按 BaseURL 反查命中的预置（用于水合时从已存 baseURL 推断当前预置）。命中不到则视为 custom。 */
export function resolvePresetByBaseURL(baseURL: string): AIProviderPreset {
  const normalized = (baseURL || '').trim().replace(/\/+$/, '')
  const hit = AI_PROVIDER_PRESETS.find(p => p.baseURL && p.baseURL.replace(/\/+$/, '') === normalized)
  return hit?.id ?? 'custom'
}

export function getPresetMeta(preset: AIProviderPreset): AIProviderPresetMeta {
  return AI_PROVIDER_PRESETS.find(p => p.id === preset) ?? AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1]
}
