import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Bookmark } from '@/types/bookmark'
import { BookmarkIcon } from '@/components/BookmarkIcon'
import { BookmarkSkeleton } from './BookmarkSkeleton'
import { BookmarkTooltip } from './_BookmarkTooltip'
import { Button } from '@/components/ui/button'
import { Edit3, ExternalLink, Trash2, Pin, BookmarkX } from 'lucide-react'
import './bookmarks.css'

/**
 * BookmarksList（React 版）
 * --------------------------------------------------------------------------
 * 书签列表视图：支持「分区(sections)大纲」与「扁平 flat」两种模式，list/cards 两种排版，
 * 键盘上下选择 + 回车打开、双击打开、右键、HTML5 拖拽排序、高亮居中滚动、骨架加载、空态。
 * 等价旧版 Vue BookmarksList.vue。i-ph/lucide-vue-next → lucide-react；BookmarkIcon 复用。
 * 受控 selectedIndex + 回调。无埋点。
 */
export interface BookmarkSection {
  groupId: string
  groupName: string
  subGroupId: string
  subGroupName: string
  bookmarks: Bookmark[]
  anchorId: string
}

export interface BookmarksListProps {
  bookmarks: Bookmark[]
  selectedIndex: number
  isTrashActive: boolean
  showCommandHints?: boolean
  hintKeyById?: Record<string, string>
  highlightedId?: string | null
  readonly?: boolean
  clickableIcon?: boolean
  sections?: BookmarkSection[]
  loading?: boolean
  variant?: 'list' | 'cards'
  onRemove?: (bookmark: Bookmark) => void
  onEdit?: (bookmark: Bookmark, el?: HTMLElement) => void
  onOpen?: (bookmark: Bookmark) => void
  onContextMenu?: (event: React.MouseEvent, bookmark: Bookmark) => void
  onLocate?: (bookmark: Bookmark) => void
  onReorder?: (payload: { fromId: string; toId: string }) => void
  onSelect?: (index: number) => void
  onIconClick?: (bookmark: Bookmark) => void
  onScrollToSection?: (anchorId: string) => void
}

// desc 现为纯文本；剥离旧数据残留的 HTML 标签并解码实体
const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
}
const renderDesc = (desc?: string): string => {
  if (!desc) return ''
  return desc.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => HTML_ENTITY_MAP[m] ?? m)
}

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const DURATION = 300

export function BookmarksList({
  bookmarks,
  selectedIndex,
  isTrashActive,
  showCommandHints,
  hintKeyById,
  highlightedId,
  readonly,
  clickableIcon,
  sections,
  loading,
  variant = 'list',
  onRemove,
  onEdit,
  onOpen,
  onContextMenu,
  onReorder,
  onSelect,
  onIconClick
}: BookmarksListProps) {
  const listRef = useRef<HTMLElement | null>(null)
  const dragStartIndexRef = useRef(-1)

  // 拖拽
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (readonly) return
    dragStartIndexRef.current = index
    const bookmark = bookmarks[index]
    if (bookmark && e.dataTransfer) {
      e.dataTransfer.setData('text/bookmark-id', bookmark.id)
      e.dataTransfer.effectAllowed = 'move'
    }
  }
  const handleDragOver = (e: React.DragEvent) => {
    if (readonly) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = (e: React.DragEvent, index: number) => {
    if (readonly) return
    e.preventDefault()
    const from = dragStartIndexRef.current
    if (from === -1 || from === index) {
      dragStartIndexRef.current = -1
      return
    }
    const fromId = bookmarks[from]?.id
    const toId = bookmarks[index]?.id
    if (fromId && toId) onReorder?.({ fromId, toId })
    dragStartIndexRef.current = -1
  }

  // 滚动辅助
  const animateScroll = (target: number) => {
    const el = listRef.current
    if (!el) return
    const start = el.scrollTop
    const delta = target - start
    if (Math.abs(delta) < 1) {
      el.scrollTop = target
      return
    }
    const startTime = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      el.scrollTop = start + delta * ease
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  const scrollItemToCenter = (item: Element) => {
    const el = listRef.current
    if (!el) return
    const top = (item as HTMLElement).offsetTop - el.clientHeight / 2 + (item as HTMLElement).clientHeight / 2
    animateScroll(Math.max(0, top))
  }
  const scrollToIndex = (index: number) => {
    requestAnimationFrame(() => {
      const item = listRef.current?.querySelector(`[data-index="${index}"]`)
      if (item) scrollItemToCenter(item)
    })
  }

  // 键盘选择
  const handleKeydown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(selectedIndex + 1, bookmarks.length - 1)
      onSelect?.(next)
      scrollToIndex(next)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(selectedIndex - 1, 0)
      onSelect?.(prev)
      scrollToIndex(prev)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const bookmark = bookmarks[selectedIndex]
      if (bookmark) onOpen?.(bookmark)
    }
  }

  const handleIconClick = (e: React.MouseEvent, bookmark: Bookmark) => {
    if (!clickableIcon) return
    e.stopPropagation()
    onIconClick?.(bookmark)
  }

  // 高亮居中滚动（等价旧版 watch highlightedId）
  useEffect(() => {
    if (!highlightedId) return
    requestAnimationFrame(() => {
      const idx = bookmarks.findIndex((b) => b.id === highlightedId)
      if (idx !== -1) {
        const item = listRef.current?.querySelector(`[data-index="${idx}"]`)
        if (item) scrollItemToCenter(item)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedId])

  // 挂载聚焦（启用键盘）
  useEffect(() => {
    listRef.current?.focus()
  }, [])

  const sectionStartIndices = useMemo(() => {
    if (!sections) return []
    const indices: number[] = []
    let offset = 0
    sections.forEach((section) => {
      indices.push(offset)
      offset += section.bookmarks.length
    })
    return indices
  }, [sections])

  const hasSections = !!sections && sections.length > 0

  const renderItem = (bookmark: Bookmark, globalIndex: number, keyExtra = '') => {
    const isSelected = selectedIndex === globalIndex
    const isHighlighted = highlightedId === bookmark.id
    const isCards = variant === 'cards'
    return (
      <li
        key={bookmark.id + keyExtra}
        data-index={globalIndex}
        data-bookmark-id={bookmark.id}
        data-active={isSelected || undefined}
        draggable={!hasSections}
        className={cn(
          'bookmark-list-item group relative cursor-pointer select-none transition-colors duration-150',
          isCards
            ? 'bookmark-card-item flex items-center gap-[13px] px-[14px] py-3 rounded-xl bg-card border border-border shadow-sm'
            : 'flex items-start gap-3 px-3 py-2.5 rounded-xl',
          isSelected && 'is-selected',
          isHighlighted && 'is-highlighted ring-1 ring-primary/30'
        )}
        onClick={() => onSelect?.(globalIndex)}
        onDoubleClick={() => onOpen?.(bookmark)}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu?.(e, bookmark)
        }}
        onDragStart={(e) => handleDragStart(e, globalIndex)}
        onDragOver={(e) => handleDragOver(e)}
        onDrop={(e) => handleDrop(e, globalIndex)}
      >
        {/* Command Hint */}
        {showCommandHints && hintKeyById?.[bookmark.id] && (
          <span className="absolute left-0 top-0 z-10 h-5 min-w-[20px] -translate-x-1/3 -translate-y-1/3 px-1.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow">
            {hintKeyById[bookmark.id]}
          </span>
        )}

        {/* Icon */}
        <div
          className={cn('shrink-0', !isCards && 'mt-0.5', clickableIcon && 'cursor-pointer')}
          onClick={(e) => handleIconClick(e, bookmark)}
        >
          <BookmarkIcon icon={bookmark.icon} fallbackText={bookmark.title} size="md" />
        </div>

        {/* Content */}
        <div className={cn('flex-1 min-w-0 flex flex-col', isCards ? 'gap-0.5' : 'gap-1')}>
          <div className={isCards ? 'flex items-center gap-2 min-w-0' : 'flex items-center justify-between'}>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={
                  isCards
                    ? 'text-[14px] font-semibold text-foreground truncate'
                    : 'text-sm font-medium text-foreground truncate'
                }
              >
                {bookmark.title}
              </span>
              {bookmark.pinned && <Pin className="text-primary size-2.5 shrink-0" />}
            </div>
            {!isCards && (
              <div
                className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <BookmarkTooltip content={<p>打开</p>}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen?.(bookmark)
                    }}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                </BookmarkTooltip>
                <BookmarkTooltip content={<p>编辑</p>}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit?.(bookmark)
                    }}
                  >
                    <Edit3 className="size-3.5" />
                  </Button>
                </BookmarkTooltip>
                <BookmarkTooltip content={<p>删除</p>}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove?.(bookmark)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </BookmarkTooltip>
              </div>
            )}
          </div>

          {isCards && bookmark.desc && (
            <div className="text-[12px] text-muted-foreground leading-[1.45] line-clamp-2">
              {renderDesc(bookmark.desc)}
            </div>
          )}
          <div className="text-[10.5px] text-muted-foreground/70 font-mono truncate">{getDomain(bookmark.url)}</div>
          {!isCards && bookmark.desc && (
            <div className="bookmark-desc-rendered text-[12px] text-muted-foreground/80 leading-relaxed mt-0.5 whitespace-pre-wrap">
              {renderDesc(bookmark.desc)}
            </div>
          )}
        </div>

        {/* Cards mode right side: tags + hover actions */}
        {isCards && (
          <>
            {bookmark.tags && bookmark.tags.length > 0 && (
              <div className="shrink-0 flex items-center gap-1 group-hover:hidden">
                {bookmark.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-muted text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="shrink-0 hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <BookmarkTooltip content={<p>打开</p>}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen?.(bookmark)
                  }}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </BookmarkTooltip>
              <BookmarkTooltip content={<p>编辑</p>}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit?.(bookmark)
                  }}
                >
                  <Edit3 className="size-3.5" />
                </Button>
              </BookmarkTooltip>
              <BookmarkTooltip content={<p>删除</p>}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove?.(bookmark)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </BookmarkTooltip>
            </div>
          </>
        )}
      </li>
    )
  }

  return (
    <section
      ref={listRef}
      tabIndex={0}
      className="flex-1 min-h-0 overflow-y-auto outline-none"
      onKeyDown={handleKeydown}
    >
      {loading ? (
        <>
          <BookmarkSkeleton count={6} showHeaders />
          <BookmarkSkeleton count={4} showHeaders />
        </>
      ) : hasSections ? (
        <div className="flex flex-col pb-4">
          {sections!.map((section, sectionIdx) => (
            <div
              key={section.anchorId}
              className={cn('flex flex-col', sectionIdx < sections!.length - 1 && 'mb-[30px]')}
            >
              <div id={section.anchorId} className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5">
                <div className="w-1 h-3.5 rounded-full bg-primary/40 shrink-0" />
                <h3 className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                  {section.groupName}
                </h3>
                <span className="text-[10px] text-muted-foreground/30">·</span>
                <span className="text-[10px] text-muted-foreground/50">{section.subGroupName}</span>
              </div>
              <ul className={variant === 'cards' ? 'flex flex-col gap-[10px] px-3 pb-1' : 'flex flex-col gap-1 px-2 py-1'}>
                {section.bookmarks.map((bookmark, localIdx) =>
                  renderItem(bookmark, sectionStartIndices[sectionIdx] + localIdx, '-' + section.anchorId)
                )}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className={variant === 'cards' ? 'flex flex-col gap-[10px] px-3 py-3' : 'flex flex-col gap-1 px-2 py-1'}>
          {bookmarks.map((bookmark, index) => renderItem(bookmark, index))}
        </ul>
      )}

      {/* Empty State */}
      {!loading && bookmarks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground/40 mb-3">
            <BookmarkX className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{isTrashActive ? '回收站是空的' : '还没有书签'}</p>
          {!isTrashActive && <p className="text-xs text-muted-foreground/60 mt-1">点击 + 按钮或粘贴链接添加</p>}
        </div>
      )}
    </section>
  )
}

export default BookmarksList
