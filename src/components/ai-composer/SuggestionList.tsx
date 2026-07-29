import { createPortal } from 'react-dom'
import type { BookmarkAiReferenceSuggestion, BookmarkAiSkillCommand } from '@/lib/bookmarkAiContext'

export type BookmarkAiSuggestionItem =
  | { type: 'reference'; value: BookmarkAiReferenceSuggestion }
  | { type: 'skill'; value: BookmarkAiSkillCommand }

interface SuggestionListProps {
  id: string
  items: BookmarkAiSuggestionItem[]
  activeIndex: number
  anchorRect: DOMRect
  emptyText: string
  statusText?: string
  onSelect: (item: BookmarkAiSuggestionItem) => void
}

export function SuggestionList({
  id,
  items,
  activeIndex,
  anchorRect,
  emptyText,
  statusText,
  onSelect
}: SuggestionListProps) {
  const width = 328
  const viewportPadding = 8
  const left = Math.max(viewportPadding, Math.min(anchorRect.left, window.innerWidth - width - viewportPadding))
  const spaceAbove = anchorRect.top - viewportPadding
  const estimatedHeight = Math.min(280, Math.max(44, items.length * 48 + (statusText ? 28 : 8)))
  const placeAbove = spaceAbove >= estimatedHeight || spaceAbove > window.innerHeight - anchorRect.bottom
  const style = placeAbove
    ? { left, bottom: Math.max(viewportPadding, window.innerHeight - anchorRect.top + 4), width }
    : { left, top: Math.min(window.innerHeight - viewportPadding, anchorRect.bottom + 4), width }

  return createPortal(
    <div
      id={id}
      role="listbox"
      className="bookmark-ai-suggestion-popover"
      style={{ position: 'fixed', zIndex: 9999, maxHeight: 280, ...style }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.length === 0 ? (
        <div className="bookmark-ai-suggestion-empty" role="status">{emptyText}</div>
      ) : (
        <div className="bookmark-ai-suggestion-list">
          {items.map((item, index) => {
            const key = item.type === 'reference'
              ? `${item.value.kind}:${item.value.id}`
              : `${item.value.source}:${item.value.command}`
            const title = item.type === 'reference'
              ? item.value.titleSnapshot
              : `/${item.value.command}`
            const detail = item.type === 'reference'
              ? item.value.descriptionSnapshot
              : item.value.description
            return (
              <button
                key={key}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                className={`bookmark-ai-suggestion-option${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(item)
                }}
              >
                <span className={`bookmark-ai-suggestion-icon is-${item.type}`} aria-hidden="true" />
                <span className="bookmark-ai-suggestion-copy">
                  <span className="bookmark-ai-suggestion-title">{title}</span>
                  <span className="bookmark-ai-suggestion-detail">{detail}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {statusText ? <div className="bookmark-ai-suggestion-status" role="status">{statusText}</div> : null}
    </div>,
    document.body
  )
}
