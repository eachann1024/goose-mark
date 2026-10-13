import { isUToolsAiSupported } from '@/lib/utoolsAi'
import { type AISettingsLike } from './types'
import { getSelectedCustomModelId, shouldUseLegacyUTools } from './config'
import { getApiKeyMissingMessage } from './errors'

export function getUToolsApi() {
  if (typeof window === 'undefined') return null
  return window.utools ?? null
}

export function getAIAvailability(settings: AISettingsLike) {
  if (!settings.enabled) {
    return { ok: false as const, reason: 'AI 助手尚未开启，请先到设置中打开' }
  }

  if (!shouldUseLegacyUTools(settings)) {
    if (!settings.customApiKey.trim()) {
      return { ok: false as const, reason: getApiKeyMissingMessage() }
    }

    if (!getSelectedCustomModelId(settings)) {
      return { ok: false as const, reason: '请先填写 API Key 并拉取模型列表' }
    }

    return { ok: true as const, provider: 'custom' as const }
  }

  const utools = getUToolsApi()
  if (!utools) {
    return { ok: false as const, reason: '当前不在 uTools 环境中运行，请配置 AI 服务' }
  }

  if (!isUToolsAiSupported() || typeof utools.ai !== 'function') {
    return { ok: false as const, reason: '请在 uTools 设置中开启 AI 功能' }
  }

  return { ok: true as const, provider: 'utools' as const }
}
