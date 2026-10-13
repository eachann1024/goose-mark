import type { AIStructuredOutput } from '@/constants/aiPrompts'
import { type AISettingsLike, type AIMessage } from '../types'
import { resolveCustomBaseURL } from '../config'
import { readErrorMessage, getAuthFailedMessage } from '../errors'
import { normalizeMessages, extractStructuredText } from '../text'

/**
 * Chat Completions 兜底：部分兼容网关对 Responses 参数更严，但 chat/completions 可用。
 * 仅用于结构化文本任务（书签元信息），不承担工具连续调用。
 */
export async function runOpenAIChatCompletionsText(
  settings: AISettingsLike,
  messages: AIMessage[],
  selectedModelId: string,
  output?: AIStructuredOutput
) {
  const baseURL = resolveCustomBaseURL('openai-compatible', settings.customBaseURL)
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`
  const normalized = normalizeMessages(messages)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const baseBody: Record<string, unknown> = {
      model: selectedModelId,
      messages: normalized.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.2
    }
    const attempts: Record<string, unknown>[] = output
      ? [
          {
            ...baseBody,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: output.name,
                description: output.description,
                schema: output.schema,
                strict: true
              }
            }
          },
          { ...baseBody, response_format: { type: 'json_object' } },
          baseBody
        ]
      : [baseBody]

    let lastError: Error | null = null
    for (const body of attempts) {
      const response = await fetch(url, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.customApiKey.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const detail = await readErrorMessage(response)
        if (response.status === 401 || response.status === 403) {
          throw new Error(getAuthFailedMessage('OpenAI 兼容接口'))
        }
        lastError = new Error(detail || `调用 Chat Completions 失败（${response.status}）`)
        const lower = (detail || '').toLowerCase()
        const canDowngrade = Boolean(output) && (
          response.status === 400
          || response.status === 404
          || response.status === 422
          || lower.includes('response_format')
          || lower.includes('json_schema')
          || lower.includes('unsupported')
        )
        if (!canDowngrade) throw lastError
        continue
      }

      const text = extractStructuredText(await response.json(), output)
      if (text) return text
      lastError = new Error(output
        ? 'AI 返回内容不是可解析的 JSON 对象'
        : 'Chat Completions 没有返回可用内容')
    }

    throw lastError ?? new Error('Chat Completions 没有返回可用内容')
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('请求超时，请检查接口地址是否可达')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
