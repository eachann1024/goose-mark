import { expect, test } from '@playwright/test'
import {
  BOOKMARK_AI_IMAGE_MAX_BYTES,
  BOOKMARK_AI_IMAGE_MAX_COUNT,
  BOOKMARK_AI_IMAGE_MAX_TOTAL_BYTES,
  calculateBookmarkAiFastFingerprint,
  calculateBookmarkAiSha256,
  hasBookmarkAiImageSignature,
  validateBookmarkAiImageLimits
} from '../../src/components/ai-composer/imageAttachments'
import {
  buildBookmarkAiComposerPayload,
  toBookmarkAiComposerPersistedPayload,
  type BookmarkAiImageAttachment
} from '../../src/lib/bookmarkAiContext'
import {
  normalizeAiReasoningEffort,
  normalizeAiTemperature,
  normalizeUserGlobalPrompt,
  selectAiSessionGenerationOptions,
  USER_GLOBAL_PROMPT_MAX_CHARACTERS,
  type SettingsStore
} from '../../src/stores/settings'

const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

test('图片签名、快速指纹与 SHA-256 在 Chrome 108 基础 API 上可用', async () => {
  const first = new File([pngHeader, new TextEncoder().encode('content')], 'one.png', { type: 'image/png' })
  const duplicate = new File([pngHeader, new TextEncoder().encode('content')], 'renamed.png', { type: 'image/png' })
  const other = new File([pngHeader, new TextEncoder().encode('other')], 'other.png', { type: 'image/png' })

  expect(await hasBookmarkAiImageSignature(first)).toBe(true)
  expect(await hasBookmarkAiImageSignature(new File(['not png'], 'fake.png', { type: 'image/png' }))).toBe(false)
  expect(await calculateBookmarkAiFastFingerprint(first)).toBe(await calculateBookmarkAiFastFingerprint(duplicate))
  expect(await calculateBookmarkAiFastFingerprint(first)).not.toBe(await calculateBookmarkAiFastFingerprint(other))
  expect(await calculateBookmarkAiSha256(first)).toBe(await calculateBookmarkAiSha256(duplicate))
})

test('图片数量、单张和总大小限制按原始字节执行', () => {
  const base = { name: 'image.png', type: 'image/png' }
  expect(validateBookmarkAiImageLimits({ ...base, size: BOOKMARK_AI_IMAGE_MAX_BYTES + 1 }, 0, 0)?.reason)
    .toBe('too-large')
  expect(validateBookmarkAiImageLimits({ ...base, size: 1 }, BOOKMARK_AI_IMAGE_MAX_COUNT, 0)?.reason)
    .toBe('count-limit')
  expect(validateBookmarkAiImageLimits({ ...base, size: 2 }, 0, BOOKMARK_AI_IMAGE_MAX_TOTAL_BYTES - 1)?.reason)
    .toBe('total-limit')
  expect(validateBookmarkAiImageLimits({ ...base, size: 1 }, 0, 0)).toBeNull()
})

test('payload 标记图片能力，持久化转换严格剥离 dataUrl 和 Skill 正文', () => {
  const image: BookmarkAiImageAttachment = {
    id: 'image-1',
    name: 'one.png',
    mediaType: 'image/png',
    dataUrl: 'data:image/png;base64,AAAA',
    size: 4,
    fingerprint: 'fast:4:image/png:1234',
    sha256: 'abcd'
  }
  const payload = buildBookmarkAiComposerPayload(
    [{ type: 'text', text: '/local-skill 看图' }],
    [{
      source: 'local',
      id: 'local-skill',
      command: 'local-skill',
      name: '本地技能',
      description: '测试',
      content: '不可持久化的完整 Skill 正文',
      path: '/safe/SKILL.md'
    }],
    [image]
  )
  expect(payload.images).toEqual([image])
  expect(payload.requiredCapabilities).toEqual({ imageInput: true })

  const persisted = toBookmarkAiComposerPersistedPayload(payload)
  expect(persisted.images[0]).not.toHaveProperty('dataUrl')
  expect(persisted.invokedSkill).not.toHaveProperty('content')
  expect(JSON.stringify(persisted)).not.toContain('base64')
  expect(JSON.stringify(persisted)).not.toContain('完整 Skill 正文')
})

test('全局提示词与生成参数执行稳定规范化', () => {
  expect(normalizeUserGlobalPrompt(`  a\r\nb  `)).toBe('a\nb')
  expect(normalizeUserGlobalPrompt('x'.repeat(USER_GLOBAL_PROMPT_MAX_CHARACTERS + 10))).toHaveLength(
    USER_GLOBAL_PROMPT_MAX_CHARACTERS
  )
  expect(normalizeAiReasoningEffort('high')).toBe('high')
  expect(normalizeAiReasoningEffort('invalid')).toBeNull()
  expect(normalizeAiTemperature(3)).toBe(2)
  expect(normalizeAiTemperature(-1)).toBe(0)
  expect(normalizeAiTemperature('bad')).toBeNull()
})

test('会话临时参数覆盖默认值，null 可显式关闭', () => {
  const base = {
    aiDefaultReasoningEffort: 'medium',
    aiDefaultTemperature: 0.4,
    aiSessionReasoningEffort: undefined,
    aiSessionTemperature: undefined
  } as SettingsStore
  expect(selectAiSessionGenerationOptions(base)).toEqual({ reasoningEffort: 'medium', temperature: 0.4 })
  expect(selectAiSessionGenerationOptions({
    ...base,
    aiSessionReasoningEffort: 'high',
    aiSessionTemperature: 0.8
  })).toEqual({ reasoningEffort: 'high', temperature: 0.8 })
  expect(selectAiSessionGenerationOptions({
    ...base,
    aiSessionReasoningEffort: null,
    aiSessionTemperature: null
  })).toEqual({})
})
