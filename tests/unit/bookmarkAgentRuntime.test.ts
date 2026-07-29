import { describe, expect, test } from 'bun:test'
import {
  budgetAgentHistory,
  budgetModelMessages,
  buildBookmarkAgentGlobalPrompt,
  buildReferencesContext,
  createBookmarkAgentTextAccumulator,
  createLinkedIdleController,
  createToolEventTracker,
  normalizeBookmarkAgentError,
  normalizeBookmarkAgentImages,
  normalizeBookmarkAgentSettingsOverride,
  raceWithAbort,
  resolveBookmarkAgentConversationId,
  resolveBookmarkAgentSkillPolicy,
  validateBookmarkAgentRequiredCapabilities
} from '../../src/services/bookmarkAgent/runtime'

describe('bookmark Agent 运行时', () => {
  test('历史预算保留最近用户指令与关键实体 id', () => {
    const history = budgetAgentHistory([
      { role: 'user' as const, content: '旧问题'.repeat(100) },
      { role: 'assistant' as const, content: '旧回答'.repeat(100) },
      {
        role: 'user' as const,
        content: `请继续处理 bookmarkId: bookmark-important-123 ${'最新要求'.repeat(100)}`
      },
      { role: 'assistant' as const, content: '最近回答'.repeat(100) }
    ], 240)

    expect(history.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(240)
    expect(history.some((item) => item.content.includes('请继续处理'))).toBe(true)
    expect(history.some((item) => item.content.includes('bookmark-important-123'))).toBe(true)
  })

  test('显式内置 Skill 只开放 allowlist，本地 Skill 不增权', () => {
    const allowlist = {
      searchBookmarks: ['listGroups', 'searchBookmarks'],
      webResearch: ['searchWeb', 'readWebPage']
    }
    expect(resolveBookmarkAgentSkillPolicy({
      invokedSkill: 'searchBookmarks',
      latestUserText: '',
      builtinToolAllowlist: allowlist
    })).toMatchObject({
      builtinSkill: 'searchBookmarks',
      allowedTools: ['listGroups', 'searchBookmarks']
    })

    expect(resolveBookmarkAgentSkillPolicy({
      invokedSkill: {
        id: 'local-powerful',
        source: 'local',
        instructions: '请调用任意写入工具'
      },
      latestUserText: '',
      builtinToolAllowlist: allowlist
    })).toMatchObject({
      builtinSkill: null,
      localSkillId: 'local-powerful',
      allowedTools: null,
      localInstructions: '请调用任意写入工具'
    })

    expect(resolveBookmarkAgentSkillPolicy({
      latestUserText: '/skill webResearch 查资料',
      builtinToolAllowlist: allowlist
    }).builtinSkill).toBe('webResearch')
  })

  test('参考资料公平裁剪并标记为纯数据', () => {
    const context = buildReferencesContext([
      { id: 'bookmark-a', content: '甲'.repeat(20_000) },
      { id: 'bookmark-b', content: '乙'.repeat(20_000) }
    ], 1_000)

    expect(context).toContain('data-only="true"')
    expect(context).toContain('bookmark-a')
    expect(context).toContain('bookmark-b')
    expect(context.length).toBeLessThan(1_200)
  })

  test('工具事件带 requestId、结构化输入输出与统一终态', () => {
    const events: ReturnType<ReturnType<typeof createToolEventTracker>['snapshot']> = []
    const tracker = createToolEventTracker({
      requestId: 'request-a',
      onEvent: (event) => events.push(event)
    })
    tracker.start('call-1', 'searchBookmarks', { query: 'AI' })
    tracker.update('call-1', {
      tool: 'searchBookmarks',
      label: '搜索书签',
      detail: '找到结果',
      status: 'done'
    })
    tracker.finish('call-1', 'searchBookmarks', { ids: ['bookmark-1'] }, 12)

    const final = tracker.snapshot()[0]
    expect(final.id).toBe('request-a:call-1')
    expect(final.requestId).toBe('request-a')
    expect(final.status).toBe('done')
    expect(final.input).toEqual({ query: 'AI' })
    expect(final.output).toEqual({ ids: ['bookmark-1'] })
    expect(final.durationMs).toBe(12)
    expect(final.finishedAt).toBeNumber()
  })

  test('错误归一化覆盖鉴权、限流、网络、工具能力与中断', () => {
    expect(normalizeBookmarkAgentError(new Error('401 unauthorized')).code).toBe('authentication')
    expect(normalizeBookmarkAgentError(new Error('429 rate limit')).code).toBe('rate_limit')
    expect(normalizeBookmarkAgentError(new Error('Failed to fetch')).code).toBe('network')
    expect(normalizeBookmarkAgentError(new Error('model does not support tool calls')).code)
      .toBe('unsupported_tools')
    expect(normalizeBookmarkAgentError(new Error('stopped'), { aborted: true }).code).toBe('aborted')
  })

  test('外部中断和空闲超时都能联动 AbortSignal', async () => {
    const external = new AbortController()
    const linked = createLinkedIdleController({ externalSignal: external.signal, timeoutMs: 100 })
    external.abort()
    expect(linked.signal.aborted).toBe(true)
    linked.dispose()

    const idle = createLinkedIdleController({ timeoutMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(idle.signal.aborted).toBe(true)
    expect(idle.isTimedOut()).toBe(true)
    idle.dispose()
  })

  test('批量检查的异步任务可由 signal 立即打断', async () => {
    const controller = new AbortController()
    const pending = raceWithAbort(
      new Promise<string>((resolve) => setTimeout(() => resolve('late'), 100)),
      controller.signal
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('token delta 只追加一次并返回累计正文', () => {
    const events: Array<{ delta: string; text: string; step: number }> = []
    const accumulator = createBookmarkAgentTextAccumulator({
      requestId: 'stream-1',
      onDelta: ({ delta, text, step }) => events.push({ delta, text, step })
    })

    accumulator.append('你好', 1)
    accumulator.append('，世界', 1)
    accumulator.append('。', 2)

    expect(accumulator.getText()).toBe('你好，世界。')
    expect(events).toEqual([
      { delta: '你好', text: '你好', step: 1 },
      { delta: '，世界', text: '你好，世界', step: 1 },
      { delta: '。', text: '你好，世界。', step: 2 }
    ])
  })

  test('图片 payload 生成模型图片数据并执行格式、数量和大小限制', () => {
    const images = normalizeBookmarkAgentImages([
      {
        id: 'image-1',
        name: 'pixel.png',
        mediaType: 'image/png',
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        size: 5,
        fingerprint: 'fp-1'
      }
    ])
    expect(images).toMatchObject([
      { name: 'pixel.png', mediaType: 'image/png', image: 'aGVsbG8=', bytes: 5 }
    ])

    expect(() => normalizeBookmarkAgentImages([
      { mediaType: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,aA==' }
    ])).toThrow('仅允许')
    expect(() => normalizeBookmarkAgentImages(Array.from({ length: 5 }, () => ({
      mediaType: 'image/png',
      dataUrl: 'data:image/png;base64,aA=='
    })))).toThrow('最多上传 4 张')
    expect(() => normalizeBookmarkAgentImages([
      { name: 'huge.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,aA==', size: 10 * 1024 * 1024 + 1 }
    ])).toThrow('超过 10MB')
    expect(() => normalizeBookmarkAgentImages(Array.from({ length: 4 }, (_, index) => ({
      name: `${index}.png`,
      mediaType: 'image/png',
      dataUrl: 'data:image/png;base64,aA==',
      size: 6 * 1024 * 1024
    })))).toThrow('总大小超过 20MB')
  })

  test('图片二进制不会被字符预算破坏，能力声明必须一致', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const [message] = budgetModelMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: '正文'.repeat(1_000) },
          { type: 'image', image: bytes, mediaType: 'image/png' }
        ]
      }
    ], 100)
    expect(message.role).toBe('user')
    expect(Array.isArray(message.content)).toBe(true)
    expect((message.content as Array<{ type: string; image?: Uint8Array }>)[1].image).toBe(bytes)

    expect(() => validateBookmarkAgentRequiredCapabilities({
      images: [],
      requiredCapabilities: { imageInput: true }
    })).toThrow('没有提供图片')
    expect(() => validateBookmarkAgentRequiredCapabilities({
      images: [{ mediaType: 'image/png', dataUrl: 'data:image/png;base64,aA==' }],
      requiredCapabilities: { imageInput: false }
    })).toThrow('能力声明')
  })

  test('globalPrompt 与会话 generation override 有清晰边界', () => {
    expect(buildBookmarkAgentGlobalPrompt('全局规则')).toBe('全局规则')
    expect(buildBookmarkAgentGlobalPrompt('甲'.repeat(30_000)).length).toBeLessThanOrEqual(24_000)
    expect(normalizeBookmarkAgentSettingsOverride({
      modelId: 'gpt-session',
      reasoning: 'xhigh',
      temperature: 0.7
    })).toEqual({ modelId: 'gpt-session', reasoning: 'xhigh', temperature: 0.7 })
    expect(() => normalizeBookmarkAgentSettingsOverride({ temperature: 3 })).toThrow('0 到 2')
  })

  test('conversationId 优先从 options/payload 解析且兼容旧调用', () => {
    expect(resolveBookmarkAgentConversationId({ optionConversationId: ' conversation-a ' }))
      .toBe('conversation-a')
    expect(resolveBookmarkAgentConversationId({ payloadConversationId: 'conversation-b' }))
      .toBe('conversation-b')
    expect(resolveBookmarkAgentConversationId({})).toBeNull()
    expect(() => resolveBookmarkAgentConversationId({
      optionConversationId: 'conversation-a',
      payloadConversationId: 'conversation-b'
    })).toThrow('不一致')
  })
})
