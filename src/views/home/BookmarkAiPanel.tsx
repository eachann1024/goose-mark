import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookmarkAiComposer,
  type BookmarkAiComposerHandle,
  type BookmarkAiComposerPayload,
} from '@/components/ai-composer'
import { useBookmarkAiChats } from '@/stores/bookmarkAiChats'
import {
  applyBookmarkAiProposal,
  beginBookmarkAiRun,
  cancelBookmarkAiProposal,
  clearBookmarkAiRunError,
  retryBookmarkAiRun,
  stopBookmarkAiRun,
  stopBookmarkAiRunForConversationChange,
  undoBookmarkAiProposal,
  undoRecoveredBookmarkAiApproval,
  useBookmarkAiRun,
} from '@/stores/bookmarkAiRun'
import { Ico } from './icon'
import { ChatMessages } from './bookmark-ai/ChatMessages'
import { ConversationHistory } from './bookmark-ai/ConversationHistory'
import { EmptyState } from './bookmark-ai/EmptyState'
import { PanelResizeHandle } from './bookmark-ai/PanelResizeHandle'
import { ProposalCards } from './bookmark-ai/ProposalCards'
import { RecoveredApprovals } from './bookmark-ai/RecoveredApprovals'
import { copyBookmarkAiText } from './bookmark-ai/clipboard'
import type { BookmarkAiPanelMessage, BookmarkAiRunState } from './bookmark-ai/types'

function plainPayload(text: string): BookmarkAiComposerPayload {
  return {
    promptText: text,
    freeformText: text,
    tokens: [{ type: 'text', text }],
    references: [],
    images: [],
    invokedSkill: null,
    requiredCapabilities: { imageInput: false },
  }
}

export default function BookmarkAiPanel({ onClose }: { onClose: () => void }) {
  const initialConversationIdRef = useRef<string | null>(null)
  if (!initialConversationIdRef.current) {
    const runningConversationId = useBookmarkAiRun.getState().active?.conversationId
    initialConversationIdRef.current = runningConversationId
      ?? useBookmarkAiChats.getState().ensureFreshCurrentConversation()
    if (runningConversationId) {
      useBookmarkAiChats.getState().setCurrentConversation(runningConversationId)
    }
  }

  const [conversationId, setConversationId] = useState(initialConversationIdRef.current)
  const [composerPayload, setComposerPayload] = useState<BookmarkAiComposerPayload | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [changingConversation, setChangingConversation] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerRef = useRef<BookmarkAiComposerHandle>(null)

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  const conversationsRecord = useBookmarkAiChats((state) => state.conversations)
  const approvalJournal = useBookmarkAiChats((state) => state.approvalJournal)
  // 不订阅 composerDraft：每次击键会 re-render 整个面板，旧内核上易打断 IME。
  // composer 有 key={conversationId}，挂载/会话切换 remount 时再读 getState() 即可。
  const storedMessages = useBookmarkAiChats(
    (state) => state.conversations[conversationId]?.messages ?? [],
  )
  const conversations = useMemo(
    () => Object.values(conversationsRecord).sort((left, right) => right.updatedAt - left.updatedAt),
    [conversationsRecord],
  )
  const recoveredApprovals = useMemo(
    () => Object.values(approvalJournal)
      .filter((entry) => entry.conversationId === conversationId)
      .sort((left, right) => right.updatedAt - left.updatedAt),
    [approvalJournal, conversationId],
  )

  const activeRun = useBookmarkAiRun((state) => state.active)
  const allProposals = useBookmarkAiRun((state) => state.proposals)
  const proposalConversationId = useBookmarkAiRun((state) => state.proposalConversationId)
  const applyingProposalId = useBookmarkAiRun((state) => state.applyingProposalId)
  const globalUndoAction = useBookmarkAiRun((state) => state.undoAction)
  const globalError = useBookmarkAiRun((state) => state.error)

  const activeForConversation = activeRun?.conversationId === conversationId ? activeRun : null
  const busy = !!activeRun
  const interactionBusy = busy || !!applyingProposalId || changingConversation
  const proposals = proposalConversationId === conversationId ? allProposals : []
  const undoAction = globalUndoAction?.conversationId === conversationId ? globalUndoAction : null
  const error = globalError?.conversationId === conversationId ? globalError : null

  const messages = useMemo<BookmarkAiPanelMessage[]>(() => {
    if (!activeForConversation?.accumulatedText.trim()) return storedMessages
    const streamingMessage: BookmarkAiPanelMessage = {
      id: activeForConversation.assistantMessageId,
      role: 'assistant',
      content: activeForConversation.accumulatedText,
      createdAt: Date.now(),
      state: 'streaming',
    }
    const existingIndex = storedMessages.findIndex((message) => message.id === streamingMessage.id)
    if (existingIndex < 0) return [...storedMessages, streamingMessage]
    const next = [...storedMessages]
    next[existingIndex] = { ...next[existingIndex], ...streamingMessage }
    return next
  }, [activeForConversation, storedMessages])

  const runState: BookmarkAiRunState | null = activeForConversation
    ? {
        requestId: activeForConversation.requestId,
        phase: activeForConversation.phase,
        toolEvents: activeForConversation.toolEvents,
      }
    : null

  const handleCopy = async (text: string) => {
    const copied = await copyBookmarkAiText(text)
    setCopyStatus(copied ? '已复制' : '复制失败，请手动选择文字')
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopyStatus(''), 2200)
  }

  const sendPayload = (payload: BookmarkAiComposerPayload) => {
    if (interactionBusy || (!payload.promptText.trim() && payload.images.length === 0)) return false
    const validation = composerRef.current?.validateReferences()
    if (validation && validation.invalid.length > 0) {
      useBookmarkAiRun.setState({
        error: { conversationId, message: validation.invalid[0].message, recoverable: false },
      })
      return false
    }
    const started = beginBookmarkAiRun({ conversationId, payload })
    if (!started) return false
    composerRef.current?.clear()
    useBookmarkAiChats.getState().clearComposerDraft()
    setComposerPayload(null)
    return true
  }

  const newConversation = async () => {
    if (changingConversation || applyingProposalId) return
    setChangingConversation(true)
    try {
      await stopBookmarkAiRunForConversationChange()
      const nextId = useBookmarkAiChats.getState().createConversation()
      useBookmarkAiChats.getState().clearComposerDraft()
      composerRef.current?.clear()
      setComposerPayload(null)
      setConversationId(nextId)
    } finally {
      setChangingConversation(false)
      requestAnimationFrame(() => composerRef.current?.focus())
    }
  }

  const selectConversation = async (nextId: string) => {
    if (changingConversation || applyingProposalId || nextId === conversationId) return
    setChangingConversation(true)
    try {
      await stopBookmarkAiRunForConversationChange()
      useBookmarkAiChats.getState().setCurrentConversation(nextId)
      setConversationId(nextId)
    } finally {
      setChangingConversation(false)
    }
  }

  const statusText = changingConversation
    ? '正在安全切换会话'
    : activeRun?.stopping
      ? '正在停止本轮任务'
      : activeForConversation?.phase === 'using-tools'
        ? 'AI 正在使用书签工具'
        : activeForConversation?.phase === 'answering'
          ? 'AI 正在生成回答'
          : activeRun
            ? 'AI 正在理解任务'
            : copyStatus

  return (
    <section className="bookmark-ai-panel" aria-label="AI 助手" onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }}>
      <PanelResizeHandle />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusText}</div>
      <header className="bookmark-ai-head">
        <div className="bookmark-ai-head-title">
          <span className="bookmark-ai-head-icon"><Ico name="sparkles" /></span>
          <div>
            <h2>AI <span className="bookmark-ai-alpha">alpha</span></h2>
            <p>{activeRun ? '任务在后台持续运行 · 可关闭后再回来' : '书签与网页工具已连接 · 写入前确认'}</p>
          </div>
        </div>
        <div className="bookmark-ai-head-actions" role="toolbar" aria-label="AI 对话工具栏">
          <button type="button" title="新对话" aria-label="新对话" disabled={changingConversation || !!applyingProposalId} onClick={() => void newConversation()}>
            <Ico name="plus" />
          </button>
          <ConversationHistory
            conversations={conversations}
            activeId={conversationId}
            disabled={changingConversation || !!applyingProposalId}
            onSelect={(id) => void selectConversation(id)}
          />
          <button type="button" title="关闭 AI；运行中的任务会继续" aria-label="关闭 AI" onClick={onClose}>
            <Ico name="x" />
          </button>
        </div>
      </header>

      {messages.length === 0 && !activeForConversation && recoveredApprovals.length === 0 ? (
        <EmptyState disabled={interactionBusy} onSelect={(value) => void sendPayload(plainPayload(value))} />
      ) : (
        <ChatMessages messages={messages} runState={runState} onCopy={(text) => void handleCopy(text)}>
          <RecoveredApprovals
            entries={recoveredApprovals}
            applyingProposalId={applyingProposalId}
            onUndo={(entry) => void undoRecoveredBookmarkAiApproval({
              conversationId,
              proposalId: entry.proposalId,
              summary: entry.summary,
            })}
          />
          <ProposalCards
            proposals={proposals}
            applyingProposalId={applyingProposalId}
            disabled={interactionBusy}
            onApply={(proposal) => void applyBookmarkAiProposal(conversationId, proposal)}
            onCancel={(proposal) => cancelBookmarkAiProposal(conversationId, proposal)}
          />
          {undoAction ? (
            <div className="bookmark-ai-undo" role="status">
              <div><Ico name="check-circle" /><span>变更已生效</span></div>
              <button
                type="button"
                disabled={busy || !!applyingProposalId}
                onClick={() => undoBookmarkAiProposal(conversationId)}
              >
                <Ico name="rotate-ccw" />撤回
              </button>
            </div>
          ) : null}
        </ChatMessages>
      )}

      {error ? (
        <div className="bookmark-ai-error-card" role="alert">
          <Ico name="alert-circle" />
          <div className="bookmark-ai-error-copy">
            <strong>本轮未完成</strong>
            <p>{error.message}</p>
            <div className="bookmark-ai-error-actions">
              {error.recoverable ? (
                <button type="button" disabled={interactionBusy} onClick={() => retryBookmarkAiRun(conversationId)}>重试</button>
              ) : null}
              <button type="button" onClick={() => clearBookmarkAiRunError(conversationId)}>关闭提示</button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="bookmark-ai-composer">
        <div className="bookmark-ai-dock bookmark-ai-dock-rich">
          <BookmarkAiComposer
            ref={composerRef}
            key={conversationId}
            className="bookmark-ai-composer-shell"
            initialText={useBookmarkAiChats.getState().composerDraft}
            disabled={interactionBusy}
            autoFocus
            placeholder={busy ? 'AI 正在执行任务…' : '向 AI 提问，/ 调用 Skill，@ 引用书签或分组…'}
            onChange={(payload) => {
              setComposerPayload(payload)
              useBookmarkAiChats.getState().setComposerDraft(payload.promptText)
            }}
            onImageError={(message) => {
              useBookmarkAiRun.setState({ error: { conversationId, message, recoverable: false } })
            }}
            onSubmit={(payload) => void sendPayload(payload)}
            onEscape={onClose}
          />
          <div className="bookmark-ai-composer-actions">
            <button
              type="button"
              className={`bookmark-ai-send${busy ? ' stop' : ''}`}
              aria-label={busy ? (activeRun?.stopping ? '正在停止' : '停止生成') : '发送'}
              title={busy ? (activeRun?.stopping ? '正在停止' : '停止生成') : '发送'}
              disabled={busy
                ? !!activeRun?.stopping
                : interactionBusy || !(composerPayload?.promptText.trim() || composerPayload?.images.length)}
              onClick={() => busy
                ? void stopBookmarkAiRun()
                : composerPayload && void sendPayload(composerPayload)}
            >
              <Ico name={busy ? 'square' : 'arrow-up'} />
            </button>
          </div>
        </div>
        <div className="bookmark-ai-composer-meta">
          <span>Enter 发送 · Shift+Enter 换行 · 可粘贴图片</span>
          <span className="bookmark-ai-copy-status" aria-live="polite">{copyStatus}</span>
        </div>
      </footer>
    </section>
  )
}
