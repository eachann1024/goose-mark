import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  sanitizeBookmarkAiMessagesForPersistence,
  type BookmarkAiMessage
} from '@/lib/bookmarkAiMessages'
import { utoolsStorage } from '@/lib/utoolsStorage'
import {
  normalizeBookmarkApprovalEntry,
  normalizeBookmarkApprovalJournal,
  pruneBookmarkApprovalJournal
} from '@/services/bookmarkAgent/transaction/journal'
import type {
  BookmarkApprovalEntry,
  BookmarkApprovalJournalPort
} from '@/services/bookmarkAgent/transaction/types'

export const BOOKMARK_AI_CHATS_STORAGE_KEY = 'goose-marks-bookmark-ai-chats'
export const BOOKMARK_AI_CHATS_SCHEMA_VERSION = 2
export const BOOKMARK_AI_CONVERSATION_STALE_MS = 6 * 60 * 60 * 1000
export const BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION = 60
export const BOOKMARK_AI_MAX_CONVERSATIONS = 40

export interface BookmarkAiConversation {
  id: string
  title: string
  titleSource: 'auto' | 'manual'
  messages: BookmarkAiMessage[]
  createdAt: number
  updatedAt: number
}

export interface BookmarkAiChatsPersistedState {
  schemaVersion: typeof BOOKMARK_AI_CHATS_SCHEMA_VERSION
  currentConversationId: string | null
  conversations: Record<string, BookmarkAiConversation>
  composerDraft: string
  approvalJournal: Record<string, BookmarkApprovalEntry>
  updatedAt: number
}

export interface BookmarkAiChatsState extends BookmarkAiChatsPersistedState {
  getCurrentConversation: () => BookmarkAiConversation | null
  getConversationMessages: (conversationId?: string) => BookmarkAiMessage[]
  listConversations: () => BookmarkAiConversation[]
  createConversation: () => string
  ensureFreshCurrentConversation: (options?: { now?: number; maxAgeMs?: number }) => string
  setCurrentConversation: (conversationId: string) => void
  setConversationTitle: (conversationId: string, title: string) => void
  setMessages: (conversationId: string, messages: unknown) => void
  deleteConversation: (conversationId: string) => void
  clearAll: () => void
  setComposerDraft: (draft: string) => void
  clearComposerDraft: () => void
  getApprovalEntry: (proposalId: string) => BookmarkApprovalEntry | null
  listApprovalEntries: (conversationId?: string) => BookmarkApprovalEntry[]
  upsertApprovalEntry: (entry: BookmarkApprovalEntry) => void
  deleteApprovalEntry: (proposalId: string) => void
  cleanupApprovalJournal: (now?: number) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const safeTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

const createConversationId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `bookmark-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function deriveBookmarkAiConversationTitle(messages: BookmarkAiMessage[]): string {
  const firstUserText = messages.find((message) => message.role === 'user')?.content ?? ''
  const normalized = firstUserText.replace(/\s+/g, ' ').trim()
  if (!normalized) return '新对话'
  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized
}

function normalizeConversation(id: string, value: unknown, now: number): BookmarkAiConversation | null {
  if (!isRecord(value)) return null
  const messages = sanitizeBookmarkAiMessagesForPersistence(value.messages, {
    now,
    limit: BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION
  })
  const updatedAt = safeTimestamp(value.updatedAt, now)
  const createdAt = safeTimestamp(value.createdAt, updatedAt)
  const normalizedId = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : id
  if (!normalizedId) return null
  const hasManualTitle =
    value.titleSource === 'manual' && typeof value.title === 'string' && Boolean(value.title.trim())
  const titleSource = hasManualTitle ? 'manual' : 'auto'
  const title = titleSource === 'manual' && typeof value.title === 'string'
    ? value.title.trim().slice(0, 80)
    : deriveBookmarkAiConversationTitle(messages)

  return { id: normalizedId, title, titleSource, messages, createdAt, updatedAt }
}

function pruneConversations(
  conversations: Record<string, BookmarkAiConversation>,
  protectedId?: string | null
): Record<string, BookmarkAiConversation> {
  const values = Object.values(conversations)
  if (values.length <= BOOKMARK_AI_MAX_CONVERSATIONS) return conversations

  const keep = [...values]
    .sort((left, right) => {
      if (left.id === protectedId) return -1
      if (right.id === protectedId) return 1
      if ((left.messages.length === 0) !== (right.messages.length === 0)) {
        return left.messages.length === 0 ? 1 : -1
      }
      return right.updatedAt - left.updatedAt || right.id.localeCompare(left.id)
    })
    .slice(0, BOOKMARK_AI_MAX_CONVERSATIONS)

  return Object.fromEntries(keep.map((conversation) => [conversation.id, conversation]))
}

function newestConversationId(conversations: Record<string, BookmarkAiConversation>): string | null {
  return [...Object.values(conversations)]
    .sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id))[0]?.id ?? null
}

/**
 * 兼容旧数据、坏数据和比当前 schema 更新的数据。未来版本只降级读取当前认识的
 * 文本及终态工具字段，不原样写回未知字段。
 */
export function migrateBookmarkAiChatsState(
  persistedState: unknown,
  _persistedVersion = 0,
  options: { now?: number } = {}
): BookmarkAiChatsPersistedState {
  const now = options.now ?? Date.now()
  if (!isRecord(persistedState)) return createEmptyBookmarkAiChatsState(now)

  const rawConversations = isRecord(persistedState.conversations) ? persistedState.conversations : {}
  const normalized = Object.fromEntries(
    Object.entries(rawConversations).flatMap(([id, value]) => {
      const conversation = normalizeConversation(id, value, now)
      return conversation ? [[conversation.id, conversation]] : []
    })
  )
  const requestedCurrent =
    typeof persistedState.currentConversationId === 'string'
      ? persistedState.currentConversationId
      : typeof persistedState.activeConversationId === 'string'
        ? persistedState.activeConversationId
        : null
  const currentConversationId = requestedCurrent && normalized[requestedCurrent]
    ? requestedCurrent
    : newestConversationId(normalized)
  const conversations = pruneConversations(normalized, currentConversationId)
  const repairedCurrent = currentConversationId && conversations[currentConversationId]
    ? currentConversationId
    : newestConversationId(conversations)

  return {
    schemaVersion: BOOKMARK_AI_CHATS_SCHEMA_VERSION,
    currentConversationId: repairedCurrent,
    conversations,
    composerDraft: typeof persistedState.composerDraft === 'string' ? persistedState.composerDraft : '',
    approvalJournal: normalizeBookmarkApprovalJournal(persistedState.approvalJournal, {
      now,
      fromPersistence: true
    }),
    updatedAt: Math.max(
      safeTimestamp(persistedState.updatedAt, 0),
      ...Object.values(conversations).map((conversation) => conversation.updatedAt),
      0
    )
  }
}

export function createEmptyBookmarkAiChatsState(now = 0): BookmarkAiChatsPersistedState {
  return {
    schemaVersion: BOOKMARK_AI_CHATS_SCHEMA_VERSION,
    currentConversationId: null,
    conversations: {},
    composerDraft: '',
    approvalJournal: {},
    updatedAt: now
  }
}

export const useBookmarkAiChats = create<BookmarkAiChatsState>()(
  persist(
    (set, get) => ({
      ...createEmptyBookmarkAiChatsState(),

      getCurrentConversation: () => {
        const state = get()
        return state.currentConversationId
          ? state.conversations[state.currentConversationId] ?? null
          : null
      },

      getConversationMessages: (conversationId) => {
        const state = get()
        const resolvedId = conversationId ?? state.currentConversationId
        if (!resolvedId) return []
        return sanitizeBookmarkAiMessagesForPersistence(state.conversations[resolvedId]?.messages, {
          limit: BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION
        })
      },

      listConversations: () =>
        Object.values(get().conversations)
          .filter((conversation) => conversation.messages.length > 0)
          .sort((left, right) => right.updatedAt - left.updatedAt),

      createConversation: () => {
        let conversationId = ''
        set((state) => {
          const now = Date.now()
          const reusable = Object.values(state.conversations)
            .filter((conversation) => conversation.messages.length === 0)
            .sort((left, right) => right.updatedAt - left.updatedAt)[0]
          if (reusable) {
            conversationId = reusable.id
            return {
              currentConversationId: reusable.id,
              conversations: {
                ...state.conversations,
                [reusable.id]: { ...reusable, updatedAt: now }
              },
              updatedAt: now
            }
          }

          conversationId = createConversationId()
          const conversation: BookmarkAiConversation = {
            id: conversationId,
            title: '新对话',
            titleSource: 'auto',
            messages: [],
            createdAt: now,
            updatedAt: now
          }
          const conversations = pruneConversations(
            { ...state.conversations, [conversationId]: conversation },
            conversationId
          )
          return { currentConversationId: conversationId, conversations, updatedAt: now }
        })
        return conversationId
      },

      ensureFreshCurrentConversation: (options) => {
        const now = options?.now ?? Date.now()
        const maxAgeMs = options?.maxAgeMs ?? BOOKMARK_AI_CONVERSATION_STALE_MS
        const state = get()
        const current = state.currentConversationId
          ? state.conversations[state.currentConversationId]
          : undefined
        if (!current || current.messages.length === 0) return get().createConversation()
        if (now - current.updatedAt < maxAgeMs) {
          get().setCurrentConversation(current.id)
          return current.id
        }
        return get().createConversation()
      },

      setCurrentConversation: (conversationId) => {
        set((state) => {
          const conversation = state.conversations[conversationId]
          if (!conversation) return state
          const now = Date.now()
          return {
            currentConversationId: conversationId,
            conversations: {
              ...state.conversations,
              [conversationId]: { ...conversation, updatedAt: now }
            },
            updatedAt: now
          }
        })
      },

      setConversationTitle: (conversationId, title) => {
        const normalized = title.replace(/\s+/g, ' ').trim().slice(0, 80)
        if (!normalized) return
        set((state) => {
          const conversation = state.conversations[conversationId]
          if (!conversation) return state
          const now = Date.now()
          return {
            conversations: {
              ...state.conversations,
              [conversationId]: {
                ...conversation,
                title: normalized,
                titleSource: 'manual',
                updatedAt: now
              }
            },
            updatedAt: now
          }
        })
      },

      setMessages: (conversationId, messages) => {
        set((state) => {
          const now = Date.now()
          const previous = state.conversations[conversationId]
          const normalizedMessages = sanitizeBookmarkAiMessagesForPersistence(messages, {
            now,
            limit: BOOKMARK_AI_MAX_MESSAGES_PER_CONVERSATION
          })
          const titleSource = previous?.titleSource ?? 'auto'
          const conversation: BookmarkAiConversation = {
            id: conversationId,
            title:
              titleSource === 'manual'
                ? previous?.title ?? '新对话'
                : deriveBookmarkAiConversationTitle(normalizedMessages),
            titleSource,
            messages: normalizedMessages,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now
          }
          const conversations = pruneConversations(
            { ...state.conversations, [conversationId]: conversation },
            state.currentConversationId ?? conversationId
          )
          const currentConversationId = state.currentConversationId && conversations[state.currentConversationId]
            ? state.currentConversationId
            : conversationId
          return { currentConversationId, conversations, updatedAt: now }
        })
      },

      deleteConversation: (conversationId) => {
        set((state) => {
          if (!state.conversations[conversationId]) return state
          const { [conversationId]: _removed, ...conversations } = state.conversations
          const now = Date.now()
          const approvalJournal = Object.fromEntries(
            Object.values(state.approvalJournal)
              .filter((entry) => entry.conversationId !== conversationId)
              .map((entry) => [entry.proposalId, entry])
          )
          return {
            conversations,
            approvalJournal,
            currentConversationId:
              state.currentConversationId === conversationId
                ? newestConversationId(conversations)
                : state.currentConversationId,
            updatedAt: now
          }
        })
      },

      clearAll: () => set(createEmptyBookmarkAiChatsState(Date.now())),

      setComposerDraft: (composerDraft) => set({ composerDraft, updatedAt: Date.now() }),
      clearComposerDraft: () => set({ composerDraft: '', updatedAt: Date.now() }),

      getApprovalEntry: (proposalId) => get().approvalJournal[proposalId] ?? null,

      listApprovalEntries: (conversationId) =>
        Object.values(get().approvalJournal)
          .filter((entry) => !conversationId || entry.conversationId === conversationId)
          .sort((left, right) => right.updatedAt - left.updatedAt),

      upsertApprovalEntry: (entry) => {
        const normalized = normalizeBookmarkApprovalEntry(entry)
        if (!normalized) throw new Error('审批 journal 条目无效')
        set((state) => ({
          approvalJournal: pruneBookmarkApprovalJournal({
            ...state.approvalJournal,
            [normalized.proposalId]: normalized
          }),
          updatedAt: Math.max(state.updatedAt, normalized.updatedAt)
        }))
      },

      deleteApprovalEntry: (proposalId) => {
        set((state) => {
          if (!state.approvalJournal[proposalId]) return state
          const { [proposalId]: _removed, ...approvalJournal } = state.approvalJournal
          return { approvalJournal, updatedAt: Date.now() }
        })
      },

      cleanupApprovalJournal: (now = Date.now()) => {
        set((state) => ({
          approvalJournal: pruneBookmarkApprovalJournal(state.approvalJournal, now),
          updatedAt: Math.max(state.updatedAt, now)
        }))
      }
    }),
    {
      name: BOOKMARK_AI_CHATS_STORAGE_KEY,
      version: BOOKMARK_AI_CHATS_SCHEMA_VERSION,
      storage: createJSONStorage(() => utoolsStorage),
      migrate: (persistedState, persistedVersion) =>
        migrateBookmarkAiChatsState(persistedState, persistedVersion),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateBookmarkAiChatsState(persistedState)
      }),
      partialize: (state) => ({
        schemaVersion: BOOKMARK_AI_CHATS_SCHEMA_VERSION,
        currentConversationId: state.currentConversationId,
        conversations: state.conversations,
        composerDraft: state.composerDraft,
        approvalJournal: state.approvalJournal,
        updatedAt: state.updatedAt
      })
    }
  )
)

/** runtime/executor 使用的窄接口，避免事务层依赖 Zustand 实现细节。 */
export const bookmarkApprovalJournalPort: BookmarkApprovalJournalPort = {
  get: (proposalId) => useBookmarkAiChats.getState().getApprovalEntry(proposalId),
  list: () => useBookmarkAiChats.getState().listApprovalEntries(),
  put: (entry) => useBookmarkAiChats.getState().upsertApprovalEntry(entry),
  remove: (proposalId) => useBookmarkAiChats.getState().deleteApprovalEntry(proposalId),
  cleanup: (now) => useBookmarkAiChats.getState().cleanupApprovalJournal(now)
}
