import { type AIProtocol } from '@/constants/ai'
import { type AISettingsLike, type AIMessage, type RunAITextOptions } from './types'
import { resolveCustomBaseURL, getSelectedCustomModelId } from './config'
import { AIProviderRequestError, isInvalidJsonResponseError, normalizeStructuredOutputError } from './errors'
import { normalizeMessages, appendStructuredOutputInstruction } from './text'
import { getAIAvailability } from './availability'
import { runOfficialOpenAIResponsesText } from './protocols/responses'
import { runOpenAIChatCompletionsText } from './protocols/chat-completions'
import { runCustomAnthropicText } from './protocols/anthropic'
import { runUToolsText } from './protocols/utools'

// 注意：@ai-sdk/* 与 ai 体积较大，仅在真正发起自定义 AI 调用时才需要。
// 本模块被 stores/settings 在启动期静态引入（取默认配置/归一化模型列表），若在此顶层
// 静态导入会把整个 AI SDK 图打进启动包。故改为在 runCustomText 内 await import() 懒加载，
// 使 ai-sdk 拆到独立 chunk、按需加载（见 vite.config.ts codeSplitting 的 vendor-ai-sdk 组）。

export async function runCustomText(
  settings: AISettingsLike,
  messages: AIMessage[],
  options: RunAITextOptions
) {
  const selectedModelId = getSelectedCustomModelId(settings)
  if (!selectedModelId) {
    throw new AIProviderRequestError({
      cause: new Error('请先保存 AI 配置并获取模型列表'),
      provider: 'custom',
      model: '',
      isCustomModel: true
    })
  }

  const protocol: AIProtocol =
    settings.protocol === 'anthropic' ||
    settings.protocol === 'openai-compatible' ||
    settings.protocol === 'openai-responses'
      ? settings.protocol
      : 'openai-responses'
  const { generateText, Output, jsonSchema } = await import('ai')
  const requestMessages = appendStructuredOutputInstruction(messages, options.output)
  const normalizedMessages = normalizeMessages(requestMessages)
  const system = normalizedMessages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim()
  const chatMessages = normalizedMessages.filter(
    (message): message is { role: 'user' | 'assistant'; content: string } =>
      message.role === 'user' || message.role === 'assistant'
  )

  try {
    const model = protocol === 'openai-responses'
      ? (await import('@ai-sdk/openai')).createOpenAI({
          baseURL: resolveCustomBaseURL(protocol, settings.customBaseURL),
          apiKey: settings.customApiKey.trim(),
          name: 'openai.responses'
        }).responses(selectedModelId)
      : protocol === 'openai-compatible'
        ? (await import('@ai-sdk/openai-compatible')).createOpenAICompatible({
            baseURL: resolveCustomBaseURL(protocol, settings.customBaseURL),
            apiKey: settings.customApiKey.trim(),
            name: 'openai.compatible'
          }).chatModel(selectedModelId)
        : (await import('@ai-sdk/anthropic')).createAnthropic({
            baseURL: resolveCustomBaseURL(protocol, settings.customBaseURL),
            apiKey: settings.customApiKey.trim(),
            name: 'anthropic.official',
            headers: {
              'anthropic-dangerous-direct-browser-access': 'true'
            }
          }).languageModel(selectedModelId)

    const result = await generateText({
      model,
      ...(system ? { system } : {}),
      messages: chatMessages,
      ...(options.output
        ? {
            output: Output.object({
              schema: jsonSchema(options.output.schema as Parameters<typeof jsonSchema>[0]),
              name: options.output.name,
              description: options.output.description
            })
          }
        : {})
    })
    const normalizedText = options.output
      ? JSON.stringify(result.output)
      : result.text.trim()
    if (!normalizedText) throw new Error('AI 没有返回可用内容')
    return normalizedText
  } catch (error) {
    // Vercel AI SDK 是主链；兼容服务返回非标准 JSON 时保留原生 HTTP 兜底。
    if (protocol === 'openai-compatible') {
      try {
        return await runOpenAIChatCompletionsText(
          settings,
          requestMessages,
          selectedModelId,
          options.output
        )
      } catch (fallbackError) {
        throw new AIProviderRequestError({
          cause: normalizeStructuredOutputError(fallbackError, Boolean(options.output)),
          provider: 'custom',
          model: selectedModelId,
          isCustomModel: true
        })
      }
    }

    if (
      protocol === 'openai-responses'
      && (isInvalidJsonResponseError(error) || Boolean(options.output))
    ) {
      try {
        return await runOfficialOpenAIResponsesText(
          settings,
          requestMessages,
          selectedModelId,
          options.output
        )
      } catch (fallbackError) {
        throw new AIProviderRequestError({
          cause: normalizeStructuredOutputError(fallbackError, Boolean(options.output)),
          provider: 'custom',
          model: selectedModelId,
          isCustomModel: true
        })
      }
    }

    if (protocol === 'anthropic' && !options.output && isInvalidJsonResponseError(error)) {
      try {
        return await runCustomAnthropicText(settings, messages, selectedModelId)
      } catch (fallbackError) {
        throw new AIProviderRequestError({
          cause: fallbackError,
          provider: 'custom',
          model: selectedModelId,
          isCustomModel: true
        })
      }
    }

    throw new AIProviderRequestError({
      cause: normalizeStructuredOutputError(error, Boolean(options.output)),
      provider: 'custom',
      model: selectedModelId,
      isCustomModel: true
    })
  }
}

export async function runAIText(
  settings: AISettingsLike,
  messages: AIMessage[],
  options: RunAITextOptions = {}
) {
  const availability = getAIAvailability(settings)
  if (!availability.ok) {
    throw new Error(availability.reason)
  }

  if (availability.provider === 'custom') {
    return runCustomText(settings, messages, options)
  }

  if (options.output) {
    throw new Error('历史 uTools AI 不支持结构化输出，请切换到自定义 AI 服务')
  }

  return runUToolsText(settings, messages)
}
