import { create } from 'zustand'
import {
  executeBookmarkAgentProposal,
  runBookmarkAgent,
  undoBookmarkAgentExecution,
  type BookmarkAgentChangeProposal,
  type BookmarkAgentMessage,
  type BookmarkAgentProgressEvent,
  type BookmarkAgentRunResult,
  type BookmarkAgentToolEvent,
  type BookmarkAgentTurnPayload,
  type RunBookmarkAgentOptions,
} from '@/services/bookmarkAgent'
import type { BookmarkAiComposerPayload } from '@/lib/bookmarkAiContext'
import { toBookmarkAiJsonValue, type BookmarkAiMessage, type BookmarkAiToolTrace } from '@/lib/bookmarkAiMessages'
import { useBookmarkAiChats } from '@/stores/bookmarkAiChats'
import { selectAiSessionGenerationOptions, useSettingsStore } from '@/stores/settings'

export type BookmarkAiRunPhase = 'preparing' | 'using-tools' | 'answering'

export interface BookmarkAiRunError {
  conversationId: string
  message: string
  recoverable: boolean
}

export interface BookmarkAiUndoAction {
  conversationId: string
  token: string
  label: string
}

export interface BookmarkAiActiveRun {
  requestId: string
  conversationId: string
  assistantMessageId: string
  controller: AbortController
  phase: BookmarkAiRunPhase
  accumulatedText: string
  toolEvents: BookmarkAgentToolEvent[]
  stopping: boolean
  receivedTextDelta: boolean
}

interface BookmarkAiRunState {
  active: BookmarkAiActiveRun | null
  proposals: BookmarkAgentChangeProposal[]
  proposalConversationId: string | null
  applyingProposalId: string
  undoAction: BookmarkAiUndoAction | null
  error: BookmarkAiRunError | null
  lastPayload: BookmarkAiComposerPayload | null
  lastConversationId: string | null
}

interface BookmarkAgentTextDeltaEvent {
  requestId: string
  delta: string
  text: string
  step: number
  at: number
}

type RunBookmarkAgentWithDelta = (
  history: BookmarkAgentMessage[],
  options: RunBookmarkAgentOptions & {
    onTextDelta?: (event: BookmarkAgentTextDeltaEvent) => void
  },
) => Promise<BookmarkAgentRunResult>

const runBookmarkAgentWithDelta = runBookmarkAgent as RunBookmarkAgentWithDelta

export const useBookmarkAiRun = create<BookmarkAiRunState>()(() => ({
  active: null,
  proposals: [],
  proposalConversationId: null,
  applyingProposalId: '',
  undoAction: null,
  error: null,
  lastPayload: null,
  lastConversationId: null,
}))

let activeCompletion: Promise<void> | null = null

function createId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toAgentPayload(payload: BookmarkAiComposerPayload): BookmarkAgentTurnPayload {
  const globalPrompt = useSettingsStore.getState().userGlobalPrompt.trim()
  return {
    references: payload.references.map((reference) => ({
      id: reference.id,
      type: reference.kind,
      label: reference.titleSnapshot,
      content: reference.descriptionSnapshot,
    })),
    invokedSkill: payload.invokedSkill
      ? {
          id: payload.invokedSkill.id,
          source: payload.invokedSkill.source,
          ...(payload.invokedSkill.source === 'local' && payload.invokedSkill.content
            ? { instructions: payload.invokedSkill.content }
            : {}),
        }
      : undefined,
    images: payload.images.map((image) => ({
      data: image.dataUrl,
      mediaType: image.mediaType,
      name: image.name,
      size: image.size,
    })),
    requiredCapabilities: payload.requiredCapabilities,
    ...(globalPrompt ? { globalPrompt } : {}),
  }
}

function toPersistedToolTrace(events: BookmarkAgentToolEvent[]): BookmarkAiToolTrace[] {
  return events
    .filter((event) => event.status !== 'running')
    .map((event) => {
      const input = toBookmarkAiJsonValue(event.input)
      const output = toBookmarkAiJsonValue(event.output)
      return {
        id: event.id,
        tool: event.tool,
        status: event.status === 'error' ? 'error' : 'done',
        ...(input !== undefined ? { input } : {}),
        ...(output !== undefined ? { output } : {}),
        ...(event.error?.message ? { error: event.error.message } : {}),
      }
    })
}

function phaseFromProgress(event: BookmarkAgentProgressEvent): BookmarkAiRunPhase {
  if (event.phase === 'tool') return 'using-tools'
  if (event.phase === 'generating' || event.phase === 'finishing') return 'answering'
  return 'preparing'
}

function normalizeError(error: unknown): Omit<BookmarkAiRunError, 'conversationId'> {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; recoverable?: unknown }
    return {
      message: typeof candidate.message === 'string' ? candidate.message : 'AI 请求失败，请稍后重试',
      recoverable: candidate.recoverable !== false,
    }
  }
  return { message: error instanceof Error ? error.message : 'AI 请求失败，请稍后重试', recoverable: true }
}

function upsertMessage(messages: BookmarkAiMessage[], message: BookmarkAiMessage) {
  const index = messages.findIndex((item) => item.id === message.id)
  if (index < 0) return [...messages, message]
  const next = [...messages]
  next[index] = { ...next[index], ...message }
  return next
}

function commitMessage(conversationId: string, message: BookmarkAiMessage) {
  const chats = useBookmarkAiChats.getState()
  chats.setMessages(conversationId, upsertMessage(chats.getConversationMessages(conversationId), message))
}

function appendMessage(conversationId: string, message: BookmarkAiMessage) {
  const chats = useBookmarkAiChats.getState()
  chats.setMessages(conversationId, [...chats.getConversationMessages(conversationId), message])
}

function updateActive(requestId: string, updater: (active: BookmarkAiActiveRun) => BookmarkAiActiveRun) {
  useBookmarkAiRun.setState((state) =>
    state.active?.requestId === requestId ? { active: updater(state.active) } : state,
  )
}

function updateToolEvent(requestId: string, event: BookmarkAgentToolEvent) {
  updateActive(requestId, (active) => {
    const index = active.toolEvents.findIndex((item) => item.id === event.id)
    const toolEvents = [...active.toolEvents]
    if (index < 0) toolEvents.push(event)
    else toolEvents[index] = event
    return { ...active, phase: 'using-tools', toolEvents }
  })
}

function buildHistory(conversationId: string, payload: BookmarkAiComposerPayload, reuseLastUser: boolean) {
  const chats = useBookmarkAiChats.getState()
  const stored = chats.getConversationMessages(conversationId)
  const lastUserIndex = reuseLastUser ? stored.findLastIndex((message) => message.role === 'user') : -1
  if (lastUserIndex >= 0) return stored.slice(0, lastUserIndex + 1)

  const userMessage: BookmarkAiMessage = {
    id: createId('bookmark-ai-user'),
    role: 'user',
    content: payload.promptText.trim() || `已上传 ${payload.images.length} 张图片，请分析图片内容。`,
    createdAt: Date.now(),
  }
  const next = [...stored, userMessage]
  chats.setMessages(conversationId, next)
  return next
}

async function executeRun(input: {
  requestId: string
  conversationId: string
  assistantMessageId: string
  payload: BookmarkAiComposerPayload
  history: BookmarkAiMessage[]
  controller: AbortController
}) {
  const { requestId, conversationId, assistantMessageId, payload, history, controller } = input
  const isCurrent = () => useBookmarkAiRun.getState().active?.requestId === requestId
  const generationOptions = selectAiSessionGenerationOptions(useSettingsStore.getState())

  try {
    const result = await runBookmarkAgentWithDelta(
      history.map(({ role, content }): BookmarkAgentMessage => ({ role, content })),
      {
        requestId,
        conversationId,
        abortSignal: controller.signal,
        payload: toAgentPayload(payload),
        settingsOverride: {
          reasoning: generationOptions.reasoningEffort ?? 'default',
          ...(generationOptions.temperature !== undefined
            ? { temperature: generationOptions.temperature }
            : {}),
        },
        onToolEvent: (event) => {
          if (event.requestId === requestId) updateToolEvent(requestId, event)
        },
        onTextDelta: (event) => {
          if (event.requestId !== requestId || !event.text) return
          updateActive(requestId, (active) => ({
            ...active,
            phase: 'answering',
            accumulatedText: event.text,
            receivedTextDelta: true,
          }))
        },
        onProgress: (event) => {
          if (event.requestId !== requestId) return
          updateActive(requestId, (active) => ({
            ...active,
            phase: phaseFromProgress(event),
            ...(!active.receivedTextDelta && event.text?.trim()
              ? { accumulatedText: event.text.trim() }
              : {}),
          }))
        },
      },
    )
    if (!isCurrent()) return

    commitMessage(conversationId, {
      id: assistantMessageId,
      role: 'assistant',
      content: result.text,
      createdAt: Date.now(),
      ...(result.toolEvents.length > 0 ? { tools: toPersistedToolTrace(result.toolEvents) } : {}),
    })
    useBookmarkAiRun.setState((state) => ({
      active: null,
      proposals: result.proposals.length > 0
        ? state.proposalConversationId === conversationId
          ? [...state.proposals, ...result.proposals]
          : result.proposals
        : state.proposals,
      proposalConversationId: result.proposals.length > 0 ? conversationId : state.proposalConversationId,
      error: result.error && result.error.code !== 'aborted'
        ? { conversationId, message: result.error.message, recoverable: result.recoverable }
        : null,
      lastPayload: result.error && result.error.code !== 'aborted' ? state.lastPayload : null,
      lastConversationId: result.error && result.error.code !== 'aborted' ? state.lastConversationId : null,
    }))
  } catch (error) {
    if (!isCurrent()) return
    useBookmarkAiRun.setState({
      active: null,
      error: { conversationId, ...normalizeError(error) },
    })
  }
}

export function beginBookmarkAiRun(input: {
  conversationId: string
  payload: BookmarkAiComposerPayload
  reuseLastUser?: boolean
}) {
  const payload = input.payload
  const state = useBookmarkAiRun.getState()
  if (state.active || state.applyingProposalId || (!payload.promptText.trim() && payload.images.length === 0)) return false

  const requestId = createId('bookmark-ai-request')
  const assistantMessageId = `${requestId}-assistant`
  const controller = new AbortController()
  const history = buildHistory(input.conversationId, payload, !!input.reuseLastUser)
  useBookmarkAiRun.setState({
    active: {
      requestId,
      conversationId: input.conversationId,
      assistantMessageId,
      controller,
      phase: 'preparing',
      accumulatedText: '',
      toolEvents: [],
      stopping: false,
      receivedTextDelta: false,
    },
    error: null,
    lastPayload: payload,
    lastConversationId: input.conversationId,
  })

  activeCompletion = executeRun({
    requestId,
    conversationId: input.conversationId,
    assistantMessageId,
    payload,
    history,
    controller,
  }).finally(() => {
    if (useBookmarkAiRun.getState().active?.requestId === requestId) {
      useBookmarkAiRun.setState({ active: null })
    }
    activeCompletion = null
  })
  return true
}

export async function stopBookmarkAiRun() {
  const active = useBookmarkAiRun.getState().active
  if (!active) return
  updateActive(active.requestId, (current) => ({ ...current, stopping: true }))
  active.controller.abort()
  await activeCompletion
}

export async function stopBookmarkAiRunForConversationChange() {
  await stopBookmarkAiRun()
}

export function retryBookmarkAiRun(conversationId: string) {
  const state = useBookmarkAiRun.getState()
  if (state.active) return false
  if (state.lastPayload && state.lastConversationId === conversationId) {
    return beginBookmarkAiRun({ conversationId, payload: state.lastPayload, reuseLastUser: true })
  }
  const lastUserText = [...useBookmarkAiChats.getState().getConversationMessages(conversationId)]
    .reverse()
    .find((message) => message.role === 'user')?.content
  if (!lastUserText) return false
  return beginBookmarkAiRun({
    conversationId,
    reuseLastUser: true,
    payload: {
      promptText: lastUserText,
      freeformText: lastUserText,
      tokens: [{ type: 'text', text: lastUserText }],
      references: [],
      images: [],
      invokedSkill: null,
      requiredCapabilities: { imageInput: false },
    },
  })
}

export function clearBookmarkAiRunError(conversationId?: string) {
  const error = useBookmarkAiRun.getState().error
  if (!error || (conversationId && error.conversationId !== conversationId)) return
  useBookmarkAiRun.setState({ error: null })
}

export function clearBookmarkAiConversationRuntime(conversationId: string) {
  useBookmarkAiRun.setState((state) => ({
    proposals: state.proposalConversationId === conversationId ? [] : state.proposals,
    proposalConversationId: state.proposalConversationId === conversationId ? null : state.proposalConversationId,
    undoAction: state.undoAction?.conversationId === conversationId ? null : state.undoAction,
    error: state.error?.conversationId === conversationId ? null : state.error,
  }))
}

export async function applyBookmarkAiProposal(conversationId: string, proposal: BookmarkAgentChangeProposal) {
  const state = useBookmarkAiRun.getState()
  if (state.active || state.applyingProposalId) return
  useBookmarkAiRun.setState({ applyingProposalId: proposal.id, error: null })
  try {
    const result = await executeBookmarkAgentProposal(proposal)
    useBookmarkAiRun.setState((current) => ({
      proposals: current.proposals.filter((item) => item.id !== proposal.id),
      proposalConversationId: current.proposals.length > 1 ? current.proposalConversationId : null,
      undoAction: { conversationId, token: result.undoToken, label: proposal.summary },
    }))
    appendMessage(conversationId, {
      id: createId('bookmark-ai-assistant'),
      role: 'assistant',
      content: `${result.message} 如需恢复，请点击下方“撤回”。`,
      createdAt: Date.now(),
    })
  } catch (error) {
    useBookmarkAiRun.setState({ error: { conversationId, ...normalizeError(error) } })
  } finally {
    useBookmarkAiRun.setState({ applyingProposalId: '' })
  }
}

export function cancelBookmarkAiProposal(conversationId: string, proposal: BookmarkAgentChangeProposal) {
  if (useBookmarkAiRun.getState().applyingProposalId) return
  useBookmarkAiRun.setState((state) => ({
    proposals: state.proposals.filter((item) => item.id !== proposal.id),
    proposalConversationId: state.proposals.length > 1 ? state.proposalConversationId : null,
  }))
  appendMessage(conversationId, {
    id: createId('bookmark-ai-assistant'),
    role: 'assistant',
    content: `已取消“${proposal.summary}”，没有修改数据。`,
    createdAt: Date.now(),
  })
}

export async function undoBookmarkAiProposal(conversationId: string) {
  const action = useBookmarkAiRun.getState().undoAction
  if (!action || action.conversationId !== conversationId || useBookmarkAiRun.getState().active) return
  useBookmarkAiRun.setState({ error: null })
  try {
    const message = await undoBookmarkAgentExecution(action.token)
    useBookmarkAiRun.setState({ undoAction: null })
    appendMessage(conversationId, {
      id: createId('bookmark-ai-assistant'),
      role: 'assistant',
      content: message,
      createdAt: Date.now(),
    })
  } catch (error) {
    useBookmarkAiRun.setState({ error: { conversationId, ...normalizeError(error) } })
  }
}

export async function undoRecoveredBookmarkAiApproval(input: {
  conversationId: string
  proposalId: string
  summary: string
}) {
  const state = useBookmarkAiRun.getState()
  if (state.active || state.applyingProposalId) return
  const operationId = `recovered:${input.proposalId}`
  useBookmarkAiRun.setState({ applyingProposalId: operationId, error: null })
  try {
    const message = await undoBookmarkAgentExecution(`approval:${input.proposalId}`)
    appendMessage(input.conversationId, {
      id: createId('bookmark-ai-assistant'),
      role: 'assistant',
      content: `${message} 已恢复“${input.summary}”。`,
      createdAt: Date.now(),
    })
  } catch (error) {
    useBookmarkAiRun.setState({
      error: { conversationId: input.conversationId, ...normalizeError(error) },
    })
  } finally {
    useBookmarkAiRun.setState({ applyingProposalId: '' })
  }
}
