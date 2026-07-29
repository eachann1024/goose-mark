import type { BookmarkAgentToolEvent } from '@/services/bookmarkAgent'
import type { BookmarkAiComposerPayload } from '@/lib/bookmarkAiContext'
import type { BookmarkAiMessage } from '@/lib/bookmarkAiMessages'
import type { BookmarkAiConversation as StoredBookmarkAiConversation } from '@/stores/bookmarkAiChats'

export type BookmarkAiMessageState = 'complete' | 'streaming' | 'stopped' | 'error'

export type BookmarkAiPanelMessage = BookmarkAiMessage & {
  state?: BookmarkAiMessageState
  payload?: BookmarkAiComposerPayload
}

export type BookmarkAiConversation = StoredBookmarkAiConversation

export type BookmarkAiRunState = {
  requestId: string
  phase: 'preparing' | 'using-tools' | 'answering'
  toolEvents: BookmarkAgentToolEvent[]
}
