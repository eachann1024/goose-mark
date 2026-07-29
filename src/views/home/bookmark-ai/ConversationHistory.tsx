import { Ico } from '../icon'
import type { BookmarkAiConversation } from './types'

function formatTime(value: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function ConversationHistory({
  conversations,
  activeId,
  disabled,
  onSelect,
}: {
  conversations: BookmarkAiConversation[]
  activeId: string
  disabled?: boolean
  onSelect: (id: string) => void
}) {
  const items = [...conversations]
    .filter((conversation) => conversation.messages.length > 0)
    .sort((left, right) => right.updatedAt - left.updatedAt)

  return (
    <details className="bookmark-ai-history">
      <summary
        aria-label="历史会话"
        title="历史会话"
        aria-disabled={disabled ? 'true' : undefined}
        onClick={(event) => {
          if (disabled) event.preventDefault()
        }}
      >
        <Ico name="message-square" />
      </summary>
      <div className="bookmark-ai-history-popover">
        <div className="bookmark-ai-history-head">
          <strong>历史会话</strong>
          <span>最近保留 20 个对话</span>
        </div>
        {items.length === 0 ? (
          <div className="bookmark-ai-history-empty">暂无历史会话</div>
        ) : (
          <div className="bookmark-ai-history-list">
            {items.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className={conversation.id === activeId ? 'on' : ''}
                aria-current={conversation.id === activeId ? 'true' : undefined}
                disabled={disabled}
                onClick={(event) => {
                  onSelect(conversation.id)
                  event.currentTarget.closest('details')?.removeAttribute('open')
                }}
              >
                <span className="bookmark-ai-history-title">{conversation.title || '新对话'}</span>
                <span className="bookmark-ai-history-time">{formatTime(conversation.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
