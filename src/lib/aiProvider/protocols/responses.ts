import type { AIStructuredOutput } from '../types'
import { type AISettingsLike, type AIMessage } from '../types'
import { getOpenAIResponsesUrl, resolveCustomBaseURL } from '../config'
import { readErrorMessage, getAuthFailedMessage } from '../errors'
import { normalizeMessages, extractStructuredText, isRecord, extractTextFromJsonPayload } from '../text'
import { runOpenAIChatCompletionsText } from './chat-completions'

export function isOfficialOpenAIBaseURL(baseURL: string) {
  try {
    const host = new URL(baseURL.includes('://') ? baseURL : `https://${baseURL}`).hostname.toLowerCase()
    return host === 'api.openai.com' || host.endsWith('.openai.com')
  } catch {
    return false
  }
}

export function buildResponsesTextFormat(output?: AIStructuredOutput) {
  if (!output) return undefined
  return {
    format: {
      type: 'json_schema' as const,
      name: output.name,
      description: output.description,
      schema: output.schema,
      strict: true
    }
  }
}

/** 读取 OpenAI Responses SSE 流，拼接 output_text.delta */
export async function readResponsesSSE(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('OpenAI Responses API 没有返回可读流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let streamError: string | null = null

  const consumeEventData = (data: string) => {
    if (!data || data === '[DONE]') return
    let event: unknown
    try {
      event = JSON.parse(data)
    } catch {
      return
    }
    if (!isRecord(event)) return

    const type = typeof event.type === 'string' ? event.type : ''
    if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
      text += event.delta
      return
    }
    if (type === 'response.completed' && isRecord(event.response)) {
      const finalText = extractTextFromJsonPayload(event.response)
      if (finalText) text = finalText
      return
    }
    if (type === 'response.failed' || type === 'error') {
      const errObj = isRecord(event.error) ? event.error : isRecord(event.response) ? event.response.error : null
      const msg =
        (isRecord(errObj) && typeof errObj.message === 'string' && errObj.message) ||
        (typeof event.message === 'string' && event.message) ||
        'OpenAI Responses 流式调用失败'
      streamError = msg
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      consumeEventData(trimmed.slice(5).trim())
    }
  }

  // 处理末尾残留
  const tail = buffer.trim()
  if (tail.startsWith('data:')) {
    consumeEventData(tail.slice(5).trim())
  }

  if (streamError) throw new Error(streamError)
  return text.trim()
}

export async function runOfficialOpenAIResponsesText(
  settings: AISettingsLike,
  messages: AIMessage[],
  selectedModelId: string,
  output?: AIStructuredOutput
) {
  const normalized = normalizeMessages(messages)
  const instructions = normalized
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim()
  const input = normalized
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role, content: message.content }))

  const baseURL = resolveCustomBaseURL('openai-responses', settings.customBaseURL)
  const official = isOfficialOpenAIBaseURL(baseURL)
  const textFormat = buildResponsesTextFormat(output)

  // 官方：非流式 + max_output_tokens；兼容网关常要求 store=false、stream=true，且拒 max_output_tokens
  const attemptBodies: Record<string, unknown>[] = official
    ? [
        {
          model: selectedModelId,
          store: false,
          ...(instructions ? { instructions } : {}),
          input,
          max_output_tokens: 1024,
          ...(textFormat ? { text: textFormat } : {})
        }
      ]
    : [
        {
          model: selectedModelId,
          store: false,
          stream: true,
          ...(instructions ? { instructions } : {}),
          input,
          ...(textFormat ? { text: textFormat } : {})
        },
        // 个别网关不接受 json_schema text.format，再试纯文本流
        {
          model: selectedModelId,
          store: false,
          stream: true,
          ...(instructions
            ? {
                instructions: `${instructions}\n\n只输出合法 JSON 对象，不要使用 Markdown 代码块。`
              }
            : {
                instructions: '只输出合法 JSON 对象，不要使用 Markdown 代码块。'
              }),
          input
        }
      ]

  let lastError: unknown = null
  for (const body of attemptBodies) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), official ? 45_000 : 90_000)
    try {
      const response = await fetch(getOpenAIResponsesUrl(baseURL), {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.customApiKey.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream, text/plain, */*'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const detail = await readErrorMessage(response)
        if (response.status === 401 || response.status === 403) {
          throw new Error(getAuthFailedMessage('OpenAI 官方 Responses API'))
        }
        lastError = new Error(detail || `调用 OpenAI Responses API 失败（${response.status}）`)
        continue
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      const useStream = Boolean(body.stream) || contentType.includes('text/event-stream')
      const text = useStream
        ? await readResponsesSSE(response)
        : extractTextFromJsonPayload(await response.json())

      if (!text || (output && !extractStructuredText(text, output))) {
        lastError = new Error(output
          ? 'AI 返回内容不是可解析的 JSON 对象'
          : 'OpenAI Responses API 没有返回可用内容')
        continue
      }
      return text
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        lastError = new Error('请求超时，请检查接口地址是否可达')
      } else {
        lastError = err
      }
    } finally {
      clearTimeout(timer)
    }
  }

  // 兼容网关：Responses 参数受限时降级到 chat/completions（仅文本结构化任务）
  if (!official) {
    try {
      return await runOpenAIChatCompletionsText(settings, messages, selectedModelId, output)
    } catch (fallbackErr) {
      // 保留更具体的原始错误，便于排查
      if (lastError) throw lastError
      throw fallbackErr
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenAI Responses API 调用失败')
}
