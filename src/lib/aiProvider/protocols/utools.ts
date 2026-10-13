import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { resolvePreferredUToolsModel } from '@/lib/utoolsAi'
import { type AISettingsLike, type AIMessage } from '../types'
import { AIProviderRequestError, isModelError } from '../errors'
import { normalizeMessages, extractTextPayload } from '../text'
import { getUToolsApi } from '../availability'

export async function runUToolsText(settings: AISettingsLike, messages: AIMessage[]) {
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
