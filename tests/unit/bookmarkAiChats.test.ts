import { beforeEach, describe, expect, test } from 'bun:test'
import {
  sanitizeBookmarkAiMessagesForPersistence,
  toBookmarkAiJsonValue,
  type BookmarkAiMessage
} from '../../src/lib/bookmarkAiMessages'
import {
  BOOKMARK_AI_CHATS_SCHEMA_VERSION,
  BOOKMARK_AI_CONVERSATION_STALE_MS,
  BOOKMARK_AI_MAX_CONVERSATIONS,
  BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION,
  BOOKMARK_AI_CHATS_STORAGE_KEY,
  createEmptyBookmarkAiChatsState,
  migrateBookmarkAiChatsState,
  useBookmarkAiChats
} from '../../src/stores/bookmarkAiChats'

const message = (index: number, content = `消息 ${index}`): BookmarkAiMessage => ({
  id: `message-${index}`,
  role: index % 2 === 0 ? 'user' : 'assistant',
  content,
  createdAt: index + 1
})

beforeEach(() => {
  useBookmarkAiChats.setState(createEmptyBookmarkAiChatsState())
})

describe('bookmark AI 消息持久化边界', () => {
  test('只保留可序列化文本和终态工具轨迹', () => {
    const cycle: Record<string, unknown> = { ok: true, missing: undefined }
    cycle.self = cycle
    const messages = sanitizeBookmarkAiMessagesForPersistence([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '已完成',
        createdAt: 1,
        tools: [
          { id: 'running', tool: 'searchBookmarks', status: 'running', input: { query: 'AI' } },
          { id: 'done', tool: 'searchBookmarks', status: 'done', input: cycle, output: { count: 2 } },
          { toolCallId: 'failed', tool: 'readWebPage', status: 'output-error', errorText: '超时' }
        ]
      },
      {
        id: 'placeholder',
        role: 'assistant',
        content: '',
        tools: [{ id: 'still-running', tool: 'readWebPage', status: 'running' }]
      },
      { id: 'unknown-role', role: 'tool', content: '不能保存' }
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0].tools).toEqual([
      {
        id: 'done',
        tool: 'searchBookmarks',
        status: 'done',
        input: { ok: true },
        output: { count: 2 }
      },
      {
        id: 'failed',
        tool: 'readWebPage',
        status: 'error',
        error: '超时'
      }
    ])
    expect(() => JSON.stringify(messages)).not.toThrow()
  })

  test('循环引用、BigInt、非有限数字和过深值可安全降级', () => {
    const input: Record<string, unknown> = { count: 1n, invalid: Number.POSITIVE_INFINITY }
    input.self = input
    expect(toBookmarkAiJsonValue(input)).toEqual({ count: '1' })
  })
})

describe('bookmark AI 会话状态', () => {
  test('使用目标专用 key 和版本化 schema', () => {
    expect(BOOKMARK_AI_CHATS_STORAGE_KEY).toBe('goose-marks-bookmark-ai-chats')
    expect(BOOKMARK_AI_CHATS_SCHEMA_VERSION).toBe(2)
    expect(useBookmarkAiChats.persist.getOptions().version).toBe(2)
  })

  test('重复新建复用空会话，非空后创建独立会话并可切换', () => {
    const store = useBookmarkAiChats.getState()
    const firstId = store.createConversation()
    expect(store.createConversation()).toBe(firstId)

    store.setMessages(firstId, [message(0, '第一段会话')])
    const secondId = store.createConversation()
    expect(secondId).not.toBe(firstId)
    store.setMessages(secondId, [message(2, '第二段会话')])
    store.setCurrentConversation(firstId)

    expect(useBookmarkAiChats.getState().currentConversationId).toBe(firstId)
    expect(store.listConversations()).toHaveLength(2)
    expect(store.getConversationMessages(firstId)[0].content).toBe('第一段会话')
  })

  test('标题自动取第一条用户消息，手动标题不会被后续消息覆盖', () => {
    const store = useBookmarkAiChats.getState()
    const id = store.createConversation()
    store.setMessages(id, [message(0, '  帮我   整理书签  '), message(1, '好的')])
    expect(useBookmarkAiChats.getState().conversations[id].title).toBe('帮我 整理书签')

    store.setConversationTitle(id, '收藏夹清理')
    store.setMessages(id, [message(0, '换一个问题')])
    expect(useBookmarkAiChats.getState().conversations[id].title).toBe('收藏夹清理')
  })

  test('每会话只保留最后 60 条消息', () => {
    const store = useBookmarkAiChats.getState()
    const id = store.createConversation()
    store.setMessages(
      id,
      Array.from({ length: BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION + 5 }, (_, index) => message(index))
    )
    const messages = store.getConversationMessages(id)
    expect(messages).toHaveLength(BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION)
    expect(messages[0].id).toBe('message-5')
  })

  test('全局会话数受限且当前会话不会被淘汰', () => {
    const store = useBookmarkAiChats.getState()
    for (let index = 0; index < BOOKMARK_AI_MAX_CONVERSATIONS + 5; index += 1) {
      const id = store.createConversation()
      store.setMessages(id, [message(index * 2, `会话 ${index}`)])
    }
    const state = useBookmarkAiChats.getState()
    expect(Object.keys(state.conversations)).toHaveLength(BOOKMARK_AI_MAX_CONVERSATIONS)
    expect(state.currentConversationId).not.toBeNull()
    expect(state.conversations[state.currentConversationId!]).toBeDefined()
  })

  test('删除当前会话会修复 current 指针，清空会话也会清除草稿', () => {
    const store = useBookmarkAiChats.getState()
    const firstId = store.createConversation()
    store.setMessages(firstId, [message(0)])
    const secondId = store.createConversation()
    store.setMessages(secondId, [message(2)])
    store.setComposerDraft('未发送内容')

    store.deleteConversation(secondId)
    expect(useBookmarkAiChats.getState().currentConversationId).toBe(firstId)
    store.clearAll()
    expect(useBookmarkAiChats.getState().conversations).toEqual({})
    expect(useBookmarkAiChats.getState().currentConversationId).toBeNull()
    expect(useBookmarkAiChats.getState().composerDraft).toBe('')
  })

  test('草稿可写入和清除', () => {
    const store = useBookmarkAiChats.getState()
    store.setComposerDraft('稍后继续')
    expect(useBookmarkAiChats.getState().composerDraft).toBe('稍后继续')
    store.clearComposerDraft()
    expect(useBookmarkAiChats.getState().composerDraft).toBe('')
  })

  test('6 小时内继续，过期后保留旧历史并进入新空会话', () => {
    const store = useBookmarkAiChats.getState()
    const oldId = store.createConversation()
    store.setMessages(oldId, [message(0, '旧会话')])
    const base = 10_000
    useBookmarkAiChats.setState((state) => ({
      conversations: {
        ...state.conversations,
        [oldId]: { ...state.conversations[oldId], updatedAt: base }
      }
    }))

    expect(store.ensureFreshCurrentConversation({ now: base + 1 })).toBe(oldId)
    useBookmarkAiChats.setState((state) => ({
      conversations: {
        ...state.conversations,
        [oldId]: { ...state.conversations[oldId], updatedAt: base }
      }
    }))
    const nextId = store.ensureFreshCurrentConversation({
      now: base + BOOKMARK_AI_CONVERSATION_STALE_MS + 1
    })
    expect(nextId).not.toBe(oldId)
    expect(useBookmarkAiChats.getState().conversations[oldId]).toBeDefined()
    expect(useBookmarkAiChats.getState().conversations[nextId].messages).toEqual([])
  })
})

describe('bookmark AI 会话迁移', () => {
  test('坏数据降级为空状态', () => {
    expect(migrateBookmarkAiChatsState('bad', 0, { now: 123 })).toEqual(
      createEmptyBookmarkAiChatsState(123)
    )
  })

  test('修复无效 current 指针和异常字段', () => {
    const migrated = migrateBookmarkAiChatsState(
      {
        schemaVersion: 1,
        currentConversationId: 'missing',
        conversations: {
          valid: {
            id: 'valid',
            title: 42,
            messages: [{ id: 'm1', role: 'user', content: '恢复内容', createdAt: -1 }],
            createdAt: 'bad',
            updatedAt: 20
          },
          invalid: 'broken'
        },
        composerDraft: 99
      },
      1,
      { now: 100 }
    )
    expect(migrated.currentConversationId).toBe('valid')
    expect(Object.keys(migrated.conversations)).toEqual(['valid'])
    expect(migrated.conversations.valid.title).toBe('恢复内容')
    expect(migrated.conversations.valid.messages[0].createdAt).toBe(100)
    expect(migrated.composerDraft).toBe('')
  })

  test('未来版本只读取认识的安全字段并清理运行态工具', () => {
    const migrated = migrateBookmarkAiChatsState(
      {
        schemaVersion: 99,
        activeConversationId: 'future',
        conversations: {
          future: {
            messages: [
              {
                role: 'assistant',
                content: '未来版本文本',
                tools: [
                  { tool: 'searchBookmarks', status: 'running' },
                  { tool: 'searchBookmarks', status: 'done', output: { count: 1 } }
                ]
              }
            ]
          }
        },
        unknownFutureField: { mustNotPersist: true }
      },
      99,
      { now: 100 }
    )
    expect(migrated.schemaVersion).toBe(BOOKMARK_AI_CHATS_SCHEMA_VERSION)
    expect(migrated.currentConversationId).toBe('future')
    expect(migrated.conversations.future.messages[0].tools).toHaveLength(1)
    expect(migrated).not.toHaveProperty('unknownFutureField')
  })
})
