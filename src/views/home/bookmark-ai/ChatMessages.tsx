import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { BookmarkAgentToolEvent } from '@/services/bookmarkAgent'
import type { BookmarkAiToolTrace } from '@/lib/bookmarkAiMessages'
import { Ico } from '../icon'
import { MarkdownMessage } from './MarkdownMessage'
import type { BookmarkAiPanelMessage, BookmarkAiRunState } from './types'

function UserMessageContent({ message }: { message: BookmarkAiPanelMessage }) {
  const text = message.content
  const segments = text.split(/((?:^|\s)[@/][^\s@/]+)/g).filter(Boolean)
  return (
    <div className="bookmark-ai-message-inline">
      {segments.map((segment, index) => {
        const normalized = segment.trimStart()
        const prefix = segment.slice(0, segment.length - normalized.length)
        if (normalized.startsWith('@') || normalized.startsWith('/')) {
          return (
            <span className="bookmark-ai-inline-text" key={`${message.id}-${index}`}>
              {prefix}
              <span className="bookmark-ai-inline-tag">{normalized}</span>
            </span>
          )
        }
        return <span className="bookmark-ai-inline-text" key={`${message.id}-${index}`}>{segment}</span>
      })}
    </div>
  )
}

function ToolTrace({ events }: { events: BookmarkAgentToolEvent[] }) {
  if (events.length === 0) return null
  const running = events.some((event) => event.status === 'running')
  const summary = running
    ? `正在执行工具 · ${events.filter((event) => event.status === 'done').length}/${events.length}`
    : `工具轨迹 · ${events.length} 步`
  return (
    <details className="bookmark-ai-tools" open={running}>
      <summary>
        <span className={`bookmark-ai-tool-icon${running ? ' running' : ''}`}>
          <Ico name={running ? 'loader' : 'check-circle'} className={running ? 'spin' : ''} />
        </span>
        <span>{summary}</span>
        <Ico name="chevron-down" />
      </summary>
      <div className="bookmark-ai-tool-list">
        {events.map((event) => (
          <div className={`bookmark-ai-tool ${event.status}`} key={event.id}>
            <span className="bookmark-ai-tool-icon">
              <Ico
                name={event.status === 'running' ? 'loader' : event.status === 'error' ? 'alert-circle' : 'check'}
                className={event.status === 'running' ? 'spin' : ''}
              />
            </span>
            <div className="bookmark-ai-tool-copy">
              <div className="bookmark-ai-tool-label">{event.label}</div>
              <div className="bookmark-ai-tool-detail">{event.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function StoredToolTrace({ tools }: { tools: BookmarkAiToolTrace[] }) {
  if (tools.length === 0) return null
  return (
    <details className="bookmark-ai-tools bookmark-ai-tools-stored">
      <summary>
        <span className="bookmark-ai-tool-icon"><Ico name="check-circle" /></span>
        <span>工具轨迹 · {tools.length} 步</span>
        <Ico name="chevron-down" />
      </summary>
      <div className="bookmark-ai-tool-list">
        {tools.map((tool) => (
          <div className={`bookmark-ai-tool ${tool.status === 'done' ? 'done' : 'error'}`} key={tool.id}>
            <span className="bookmark-ai-tool-icon">
              <Ico name={tool.status === 'done' ? 'check' : 'alert-circle'} />
            </span>
            <div className="bookmark-ai-tool-copy">
              <div className="bookmark-ai-tool-label">{tool.tool}</div>
              {tool.error ? <div className="bookmark-ai-tool-detail">{tool.error}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

export function ChatMessages({
  messages,
  runState,
  onCopy,
  children,
}: {
  messages: BookmarkAiPanelMessage[]
  runState: BookmarkAiRunState | null
  onCopy: (text: string) => void
  children?: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const root = rootRef.current
    if (!root) return
    root.scrollTo({ top: root.scrollHeight, behavior })
    pinnedRef.current = true
    setShowJump(false)
  }, [])

  const updateScrollIntent = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const atBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 48
    pinnedRef.current = atBottom
    setShowJump(!atBottom)
  }, [])

  useEffect(() => {
    if (!pinnedRef.current) {
      setShowJump(true)
      return
    }
    const frame = requestAnimationFrame(() => scrollToBottom())
    return () => cancelAnimationFrame(frame)
  }, [messages, runState, scrollToBottom])

  return (
    <div className="bookmark-ai-messages-wrap">
      <div className="bookmark-ai-messages" ref={rootRef} onScroll={updateScrollIntent}>
        {messages.map((message) => (
          <article className={`bookmark-ai-message ${message.role}`} key={message.id}>
            {message.role === 'assistant' ? (
              <div className="bookmark-ai-answer-card">
                <div className="bookmark-ai-answer-label">
                  <span className="bookmark-ai-avatar"><Ico name="sparkles" /></span>
                  <span>{message.state === 'streaming' ? '正在回答' : message.state === 'stopped' ? '已停止' : '回答'}</span>
                </div>
                <div className="bookmark-ai-answer-body">
                  <MarkdownMessage content={message.content} onCopyCode={onCopy} />
                </div>
                {message.tools?.length ? <StoredToolTrace tools={message.tools} /> : null}
                {message.state !== 'streaming' && message.content ? (
                  <div className="bookmark-ai-message-actions">
                    <button type="button" onClick={() => onCopy(message.content)} aria-label="复制回答">
                      <Ico name="copy" />复制
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="bookmark-ai-bubble"><UserMessageContent message={message} /></div>
            )}
          </article>
        ))}

        {runState ? <ToolTrace events={runState.toolEvents} /> : null}
        {runState && runState.toolEvents.length === 0 ? (
          <div className="bookmark-ai-thinking" role="status">
            <Ico name="loader" className="spin" />
            <span>{runState.phase === 'answering' ? '正在组织回答…' : '正在理解任务…'}</span>
          </div>
        ) : null}
        {children}
      </div>
      {showJump ? (
        <button type="button" className="bookmark-ai-jump-bottom" onClick={() => scrollToBottom('smooth')}>
          <Ico name="chevron-down" />回到底部
        </button>
      ) : null}
    </div>
  )
}
