import { expect, test } from '@playwright/test'
import {
  AI_PROTOCOLS,
  DEFAULT_AI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  getProtocolMeta,
  isAIProtocol,
  resolveProtocolByBaseURL,
  type AIProtocol,
} from '../../src/constants/ai'
import {
  fetchCustomAIModels,
  getDefaultBaseURL,
  getDefaultModelId,
  getProtocolDefaults,
} from '../../src/lib/aiProvider'
import { useSettingsStore } from '../../src/stores/settings'

const responsesConfig = {
  baseURL: 'https://responses.example.test/v1',
  apiKey: 'responses-key',
  modelOptions: [{ id: 'gpt-responses', label: 'GPT Responses' }],
  selectedModelId: 'gpt-responses',
}

test.beforeEach(() => {
  useSettingsStore.setState({
    aiEnabled: false,
    aiAllowLegacyUTools: false,
    aiSelectedModelId: responsesConfig.selectedModelId,
    aiUseCustomProvider: true,
    aiProtocol: 'openai-responses',
    aiProtocolVersion: 4,
    aiCustomBaseURL: responsesConfig.baseURL,
    aiCustomApiKey: responsesConfig.apiKey,
    aiCustomModelOptions: responsesConfig.modelOptions,
    aiProtocolConfigs: { 'openai-responses': responsesConfig },
  })
})

test('三种协议具有稳定且互不混淆的默认配置', () => {
  expect(AI_PROTOCOLS.map((item) => item.id)).toEqual([
    'openai-responses',
    'openai-compatible',
    'anthropic',
  ])
  expect(getProtocolDefaults('openai-responses')).toEqual({
    protocol: 'openai-responses',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: DEFAULT_AI_MODEL,
  })
  expect(getProtocolDefaults('openai-compatible')).toEqual({
    protocol: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: DEFAULT_AI_MODEL,
  })
  expect(getProtocolDefaults('anthropic')).toEqual({
    protocol: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
  })
  expect(getDefaultBaseURL('anthropic')).toBe('https://api.anthropic.com/v1')
  expect(getDefaultModelId('anthropic')).toBe(DEFAULT_ANTHROPIC_MODEL)
  expect(getProtocolMeta('openai-compatible').label).toContain('OpenAI')
})

test('旧 OpenAI/Anthropic 地址可迁移到当前协议名', () => {
  expect(isAIProtocol('openai-responses')).toBe(true)
  expect(isAIProtocol('openai-compatible')).toBe(true)
  expect(isAIProtocol('anthropic')).toBe(true)
  expect(isAIProtocol('openai')).toBe(false)
  expect(isAIProtocol('claude')).toBe(false)

  expect(resolveProtocolByBaseURL('https://legacy.example.test/v1')).toBe(
    'openai-compatible',
  )
  expect(resolveProtocolByBaseURL('https://api.anthropic.com/v1')).toBe(
    'anthropic',
  )
  expect(resolveProtocolByBaseURL('https://proxy.example.test/anthropic/v1')).toBe(
    'anthropic',
  )
})

test('切换协议时分别保存 Base URL、凭证与模型', () => {
  const store = useSettingsStore.getState()

  store.setAiProtocol('openai-compatible')
  useSettingsStore.getState().saveAiCustomConfig({
    baseURL: 'https://chat.example.test/v1',
    apiKey: 'chat-key',
    modelOptions: [{ id: 'chat-model', label: 'Chat Model' }],
  })

  useSettingsStore.getState().setAiProtocol('anthropic')
  useSettingsStore.getState().saveAiCustomConfig({
    baseURL: 'https://claude.example.test/v1',
    apiKey: 'claude-key',
    modelOptions: [{ id: 'claude-model', label: 'Claude Model' }],
  })

  useSettingsStore.getState().setAiProtocol('openai-responses')
  expect(useSettingsStore.getState()).toMatchObject({
    aiProtocol: 'openai-responses',
    aiCustomBaseURL: responsesConfig.baseURL,
    aiCustomApiKey: responsesConfig.apiKey,
    aiSelectedModelId: responsesConfig.selectedModelId,
  })

  useSettingsStore.getState().setAiProtocol('openai-compatible')
  expect(useSettingsStore.getState()).toMatchObject({
    aiProtocol: 'openai-compatible',
    aiCustomBaseURL: 'https://chat.example.test/v1',
    aiCustomApiKey: 'chat-key',
    aiSelectedModelId: 'chat-model',
  })

  useSettingsStore.getState().setAiProtocol('anthropic')
  expect(useSettingsStore.getState()).toMatchObject({
    aiProtocol: 'anthropic',
    aiCustomBaseURL: 'https://claude.example.test/v1',
    aiCustomApiKey: 'claude-key',
    aiSelectedModelId: 'claude-model',
  })
})

for (const protocol of [
  'openai-responses',
  'openai-compatible',
  'anthropic',
] satisfies AIProtocol[]) {
  test(`${protocol} 拉取模型时选择正确鉴权头且不访问真实网络`, async () => {
    const originalFetch = globalThis.fetch
    let requestURL = ''
    let requestHeaders: Record<string, string> = {}
    globalThis.fetch = async (input, init) => {
      requestURL = String(input)
      requestHeaders = (init?.headers ?? {}) as Record<string, string>
      return new Response(
        JSON.stringify({ data: [{ id: `${protocol}-model`, name: 'Test Model' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    try {
      const models = await fetchCustomAIModels({
        protocol,
        baseURL:
          protocol === 'anthropic'
            ? 'https://claude.example.test/v1/'
            : 'https://openai.example.test/v1/',
        apiKey: 'test-key',
      })

      expect(requestURL).toBe(
        protocol === 'anthropic'
          ? 'https://claude.example.test/v1/models'
          : 'https://openai.example.test/v1/models',
      )
      expect(models).toEqual([
        { id: `${protocol}-model`, label: 'Test Model', description: undefined },
      ])
      if (protocol === 'anthropic') {
        expect(requestHeaders['x-api-key']).toBe('test-key')
        expect(requestHeaders['anthropic-version']).toBe('2023-06-01')
        expect(requestHeaders.Authorization).toBeUndefined()
      } else {
        expect(requestHeaders.Authorization).toBe('Bearer test-key')
        expect(requestHeaders['x-api-key']).toBeUndefined()
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })
}
