import type { AIStructuredOutput } from '@/constants/aiPrompts'
import { parseAIJsonObject } from '@/lib/aiOutput'
import { type AIMessage } from './types'

export function normalizeMessages(messages: AIMessage[]) {
  return messages
    .filter(message => typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role,
      content: message.content!.trim()
    }))
}

export function appendStructuredOutputInstruction(
  messages: AIMessage[],
  output?: AIStructuredOutput
): AIMessage[] {
  if (!output) return messages

  const instruction = [
    '只输出单个合法 JSON 对象，不要输出 Markdown、解释或其他文字。',
    `输出必须严格符合以下 JSON Schema，字段名不得替换：${JSON.stringify(output.schema)}`
  ].join('\n')
  const systemIndex = messages.findIndex((message) => message.role === 'system')
  if (systemIndex < 0) {
    return [{ role: 'system', content: instruction }, ...messages]
  }

  return messages.map((message, index) => index === systemIndex
    ? { ...message, content: `${message.content?.trim() || ''}\n\n${instruction}`.trim() }
    : message)
}

export function extractStructuredText(payload: unknown, output?: AIStructuredOutput) {
  const text = extractTextFromJsonPayload(payload)
  if (!text) return ''
  if (!output) return text

  try {
    const parsed = parseAIJsonObject(text)
    return matchesJsonSchemaShape(parsed, output.schema) ? text : ''
  } catch {
    return ''
  }
}

export function matchesJsonSchemaShape(value: unknown, schema: unknown): boolean {
  if (!isRecord(schema)) return true

  if (schema.type === 'object') {
    if (!isRecord(value)) return false
    const required = Array.isArray(schema.required)
      ? schema.required.filter((field): field is string => typeof field === 'string')
      : []
    if (required.some((field) => !Object.prototype.hasOwnProperty.call(value, field))) {
      return false
    }

    if (isRecord(schema.properties)) {
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(value, field)
          && !matchesJsonSchemaShape(value[field], fieldSchema)) {
          return false
        }
      }
    }
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false
    if (schema.items && value.some((item) => !matchesJsonSchemaShape(item, schema.items))) {
      return false
    }
  }

  return true
}

export function extractTextPayload(result: string | { text?: string; content?: string }) {
  const text = typeof result === 'string'
    ? result
    : typeof result?.content === 'string'
      ? result.content
      : typeof result?.text === 'string'
        ? result.text
        : ''

  const normalizedText = text.trim()
  if (!normalizedText) {
    throw new Error('AI 没有返回可用内容')
  }

  return normalizedText
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const combined = content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!isRecord(part)) return ''

      if (typeof part.text === 'string') return part.text
      if (typeof part.output_text === 'string') return part.output_text
      if (typeof part.content === 'string') return part.content
      return ''
    })
    .join('')
    .trim()

  return combined
}

export function extractTextFromJsonPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim()
  }

  if (!isRecord(payload)) {
    return ''
  }

  const directFields = [
    payload.text,
    payload.output_text,
    payload.content,
    payload.response,
    payload.answer,
    payload.result
  ]

  for (const field of directFields) {
    const text = typeof field === 'string'
      ? field.trim()
      : isRecord(field)
        ? extractTextFromJsonPayload(field)
        : extractTextFromContent(field)
    if (text) return text
  }

  if (Array.isArray(payload.choices)) {
    const deltaParts: string[] = []

    for (const choice of payload.choices) {
      if (!isRecord(choice)) continue

      const message = isRecord(choice.message) ? choice.message : null
      const delta = isRecord(choice.delta) ? choice.delta : null
      const text = [
        typeof choice.text === 'string' ? choice.text.trim() : '',
        extractTextFromContent(message?.content),
        extractTextFromContent(delta?.content),
        typeof delta?.text === 'string' ? delta.text.trim() : '',
        typeof message?.text === 'string' ? message.text.trim() : ''
      ].find(Boolean)

      if (text) {
        if (delta && !message && typeof choice.text !== 'string') {
          deltaParts.push(text)
          continue
        }
        return text
      }
    }

    const combinedDelta = deltaParts.join('').trim()
    if (combinedDelta) return combinedDelta
  }

  if (Array.isArray(payload.output)) {
    const outputText = payload.output
      .map(item => extractTextFromJsonPayload(item))
      .join('')
      .trim()

    if (outputText) return outputText
  }

  if (Array.isArray(payload.data)) {
    const nestedText = payload.data
      .map(item => extractTextFromJsonPayload(item))
      .find(Boolean)

    if (nestedText) return nestedText
  }

  return ''
}
