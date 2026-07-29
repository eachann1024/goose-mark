import { useCallback, useEffect, useRef, useState } from 'react'
import {
  executeBookmarkAgentProposal,
  runBookmarkAgent,
  undoBookmarkAgentExecution,
  type BookmarkAgentChangeProposal,
  type BookmarkAgentMessage,
  type BookmarkAgentToolEvent
} from '@/services/bookmarkAgent'
import { Ico } from './icon'

type PanelMessage = BookmarkAgentMessage & { id: number }

const SUGGESTIONS = [
  '帮我找出前端开发相关的书签',
  '检查所有书签是否都能正常访问',
  '帮我整理分组，并先给出修改清单',
  '列出当前所有一级和二级分组'
]

export default function BookmarkAiPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [toolEvents, setToolEvents] = useState<BookmarkAgentToolEvent[]>([])
  const [proposals, setProposals] = useState<BookmarkAgentChangeProposal[]>([])
  const [applyingProposalId, setApplyingProposalId] = useState('')
  const [undoAction, setUndoAction] = useState<{ token: string; label: string } | null>(null)
  const [error, setError] = useState('')
  const seqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    root.scrollTop = root.scrollHeight
  }, [messages, proposals, toolEvents, undoAction])

  const handleToolEvent = useCallback((event: BookmarkAgentToolEvent) => {
    setToolEvents((items) => {
      const index = items.findIndex((item) => item.id === event.id)
      if (index === -1) return [...items, event]
      const next = [...items]
      next[index] = event
      return next
    })
  }, [])

  const send = useCallback(
    async (preset?: string) => {
      const content = (preset ?? input).trim()
      if (!content || busy) return
      const userMessage: PanelMessage = { id: ++seqRef.current, role: 'user', content }
      const nextMessages = [...messages, userMessage]
      setMessages(nextMessages)
      setInput('')
      setError('')
      setToolEvents([])
      setBusy(true)
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const result = await runBookmarkAgent(
          nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          { abortSignal: controller.signal, onToolEvent: handleToolEvent }
        )
        setMessages((items) => [
          ...items,
          { id: ++seqRef.current, role: 'assistant', content: result.text }
        ])
        setProposals((items) => [...items, ...result.proposals])
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'AI 请求失败，请稍后重试')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setBusy(false)
      }
    },
    [busy, handleToolEvent, input, messages]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }, [])

  const applyProposal = useCallback(async (proposal: BookmarkAgentChangeProposal) => {
    if (applyingProposalId || busy) return
    setApplyingProposalId(proposal.id)
    setError('')
    try {
      const result = await executeBookmarkAgentProposal(proposal)
      setProposals((items) => items.filter((item) => item.id !== proposal.id))
      setUndoAction({ token: result.undoToken, label: proposal.summary })
      setMessages((items) => [
        ...items,
        { id: ++seqRef.current, role: 'assistant', content: `${result.message} 如需恢复，请点击下方“撤回”。` }
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '执行变更失败，请稍后重试')
    } finally {
      setApplyingProposalId('')
    }
  }, [applyingProposalId, busy])

  const cancelProposal = useCallback((proposal: BookmarkAgentChangeProposal) => {
    if (applyingProposalId) return
    setProposals((items) => items.filter((item) => item.id !== proposal.id))
    setMessages((items) => [
      ...items,
      { id: ++seqRef.current, role: 'assistant', content: `已取消“${proposal.summary}”，没有修改数据。` }
    ])
  }, [applyingProposalId])

  const undoLastChange = useCallback(() => {
    if (!undoAction || busy || applyingProposalId) return
    setError('')
    try {
      const message = undoBookmarkAgentExecution(undoAction.token)
      setUndoAction(null)
      setMessages((items) => [
        ...items,
        { id: ++seqRef.current, role: 'assistant', content: message }
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '撤回失败')
    }
  }, [applyingProposalId, busy, undoAction])

  return (
    <section className="bookmark-ai-panel" aria-label="AI 助手" onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }}>
      <header className="bookmark-ai-head">
        <div className="bookmark-ai-head-title">
          <span className="bookmark-ai-head-icon"><Ico name="sparkles" /></span>
          <div>
            <h2>AI <span className="bookmark-ai-alpha">alpha</span></h2>
            <p>探索者版 · 书签与网页工具已连接</p>
          </div>
        </div>
        <div className="bookmark-ai-head-actions">
          <button
            type="button"
            title="新对话"
            aria-label="新对话"
            onClick={() => {
              stop()
              setMessages([])
              setToolEvents([])
              setProposals([])
              setUndoAction(null)
              setError('')
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
          >
            <Ico name="plus" />
          </button>
          <button type="button" title="关闭 AI" aria-label="关闭 AI" onClick={onClose}>
            <Ico name="x" />
          </button>
        </div>
      </header>

      <div className="bookmark-ai-messages" ref={scrollRef}>
        {messages.length === 0 && !busy ? (
          <div className="bookmark-ai-empty">
            <span className="bookmark-ai-empty-icon"><Ico name="sparkles" /></span>
            <h3>可以直接让 AI 操作书签</h3>
            <p>可检查链接、调整书签位置并管理分组；写入前会先给你确认。</p>
            <div className="bookmark-ai-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => void send(suggestion)}>
                  {suggestion}
                  <Ico name="arrow-up-right" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <article className={`bookmark-ai-message ${message.role}`} key={message.id}>
            {message.role === 'assistant' ? <span className="bookmark-ai-avatar"><Ico name="sparkles" /></span> : null}
            <div className="bookmark-ai-bubble">{message.content}</div>
          </article>
        ))}

        {toolEvents.length > 0 && (
          <div className="bookmark-ai-tools" aria-label="工具执行进度">
            {toolEvents.map((event) => (
              <div className={`bookmark-ai-tool ${event.status}`} key={event.id}>
                <span className="bookmark-ai-tool-icon">
                  <Ico
                    name={event.status === 'running' ? 'loader' : event.status === 'error' ? 'alert-circle' : 'check'}
                    className={event.status === 'running' ? 'spin' : ''}
                  />
                </span>
                <div>
                  <div className="bookmark-ai-tool-label">{event.label}</div>
                  <div className="bookmark-ai-tool-detail">{event.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {proposals.map((proposal) => {
          const applying = applyingProposalId === proposal.id
          return (
            <section
              className={`bookmark-ai-confirm${proposal.destructive ? ' destructive' : ''}`}
              key={proposal.id}
              aria-label="待确认变更"
            >
              <div className="bookmark-ai-confirm-head">
                <span><Ico name={proposal.destructive ? 'alert-circle' : 'file-text'} /></span>
                <div>
                  <h3>{proposal.summary}</h3>
                  <p>确认前不会修改任何数据</p>
                </div>
              </div>
              <ol>
                {proposal.details.map((detail, index) => <li key={`${proposal.id}-${index}`}>{detail}</li>)}
              </ol>
              <div className="bookmark-ai-confirm-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={!!applyingProposalId || busy}
                  onClick={() => cancelProposal(proposal)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className={proposal.destructive ? 'danger' : 'primary'}
                  disabled={!!applyingProposalId || busy}
                  onClick={() => void applyProposal(proposal)}
                >
                  {applying ? <><Ico name="loader" className="spin" />正在执行</> : '同意并执行'}
                </button>
              </div>
            </section>
          )
        })}

        {undoAction ? (
          <div className="bookmark-ai-undo" role="status">
            <div>
              <Ico name="check-circle" />
              <span>变更已生效</span>
            </div>
            <button type="button" disabled={busy || !!applyingProposalId} onClick={undoLastChange}>
              <Ico name="rotate-ccw" />撤回
            </button>
          </div>
        ) : null}

        {busy && toolEvents.length === 0 ? (
          <div className="bookmark-ai-thinking"><Ico name="loader" className="spin" /> 正在理解任务…</div>
        ) : null}
        {error ? <div className="bookmark-ai-error"><Ico name="alert-circle" />{error}</div> : null}
      </div>

      <footer className="bookmark-ai-composer">
        <div className="bookmark-ai-dock">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            disabled={busy}
            placeholder={busy ? 'AI 正在执行任务…' : '向 AI 提问，或让它操作书签…'}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <button
            type="button"
            className={`bookmark-ai-send${busy ? ' stop' : ''}`}
            aria-label={busy ? '停止生成' : '发送'}
            title={busy ? '停止生成' : '发送'}
            disabled={!busy && !input.trim()}
            onClick={() => busy ? stop() : void send()}
          >
            <Ico name={busy ? 'square' : 'arrow-up'} />
          </button>
        </div>
        <p>写入先预览确认，执行后可撤回；AI 结果仍请核对</p>
      </footer>
    </section>
  )
}
