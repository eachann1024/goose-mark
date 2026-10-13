import { type AISettingsLike, type AIMessage } from '../types'
import { ANTHROPIC_API_VERSION, resolveCustomBaseURL } from '../config'
import { readErrorMessage, getAuthFailedMessage } from '../errors'
import { normalizeMessages, isRecord, extractTextFromJsonPayload } from '../text'

/** Anthropic Messages API 原生兜底（SDK 解析失败时） */
export async function runCustomAnthropicText(settings: AISettingsLike, messages: AIMessage[], selectedModelId: string) {
  const baseURL = resolveCustomBaseURL('anthropic', settings.customBaseURL)
  const normalized = normalizeMessages(messages)
  const system = normalized.filter((m) => m.role === 'system').map((m) => m.content).join('\n').trim()
  const chatMessages = normalized
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(`${baseURL}/messages`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'x-api-key': settings.customApiKey.trim(),
        'anthropic-version': ANTHROPIC_API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: selectedModelId,
        max_tokens: 1024,
        ...(system ? { system } : {}),
        messages: chatMessages.length ? chatMessages : [{ role: 'user', content: '' }]
      })
    })

    if (!response.ok) {
      const detail = await readErrorMessage(response)
      if (response.status === 401 || response.status === 403) {
        throw new Error(getAuthFailedMessage('Anthropic'))
      }
      throw new Error(detail || `调用 Anthropic 失败（${response.status}）`)
    }

    const payload = await response.json()
    const text = extractTextFromJsonPayload(payload)
    if (!text) {
      // Anthropic content 数组：[{ type: 'text', text: '...' }]
      if (isRecord(payload) && Array.isArray(payload.content)) {
        const joined = payload.content
          .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
          .join('')
          .trim()
        if (joined) return joined
      }
      throw new Error('AI 没有返回可用内容')
    }
    return text
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('请求超时，请检查接口地址是否可达')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
