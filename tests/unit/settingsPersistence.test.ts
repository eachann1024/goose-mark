import { expect, test } from '@playwright/test'
import {
  flushSettingsStorePersistence,
  useSettingsStore,
} from '../../src/stores/settings'

test('AI 连接草稿在收起边界同步写入 uTools 云同步数据库', () => {
  const docs = new Map<string, { _id: string; _rev: string; data: unknown }>()
  let revision = 0
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      utools: {
        db: {
          get: (id: string) => docs.get(id) ?? null,
          put: (doc: { _id: string; data: unknown }) => {
            const stored = { ...doc, _rev: String(++revision) }
            docs.set(doc._id, stored)
            return { ok: true, id: doc._id, rev: stored._rev }
          },
          remove: (id: string) => {
            docs.delete(id)
            return { ok: true, id }
          },
          allDocs: () => Array.from(docs.values()),
        },
      },
    },
  })

  try {
    useSettingsStore.setState({
      aiEnabled: true,
      aiProtocol: 'openai-compatible',
      aiCustomBaseURL: 'https://old.example.test/v1',
      aiCustomApiKey: '',
      aiCustomModelOptions: [{ id: 'long-model-id', label: 'Long model' }],
      aiSelectedModelId: 'long-model-id',
      aiProtocolConfigs: {},
    })

    useSettingsStore.getState().setAiCustomCredentials({
      baseURL: 'https://new.example.test/v1',
      apiKey: 'sk-cloud-sync',
    })
    flushSettingsStorePersistence()

    const settings = docs.get('gm:settings')?.data as Record<string, unknown>
    expect(settings).toMatchObject({
      aiEnabled: true,
      aiProtocol: 'openai-compatible',
      aiCustomBaseURL: 'https://new.example.test/v1',
      aiCustomApiKey: 'sk-cloud-sync',
      aiSelectedModelId: 'long-model-id',
    })
    expect(settings.aiProtocolConfigs).toMatchObject({
      'openai-compatible': {
        baseURL: 'https://new.example.test/v1',
        apiKey: 'sk-cloud-sync',
        selectedModelId: 'long-model-id',
      },
    })
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
