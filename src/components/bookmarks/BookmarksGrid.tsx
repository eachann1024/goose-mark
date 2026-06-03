import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2 } from 'lucide-react'
import type { Bookmark } from '@/types/bookmark'
import { BookmarkCard } from '@/components/BookmarkCard'
import { Button } from '@/components/ui/button'
import { useUIManager } from '@/hooks/useUIManager'
import { BookmarkTooltip } from './_BookmarkTooltip'
import './bookmarks.css'

/**
 * BookmarksGrid（React 版）
 * --------------------------------------------------------------------------
 * 书签网格视图：@dnd-kit 拖拽排序（替 vuedraggable，emit fromId/toId）、添加卡片、
 * 回收站清空确认 + 成功 Toast（带复制 URL 列表）、highlightedId 居中滚动。
 * 等价旧版 Vue BookmarksGrid.vue。i-ph 图标 → lucide-react；BookmarkCard 复用。
 * 清空成功反馈用 useUIManager.showToast（替旧版 ResultToast）。无埋点。
 */
export interface BookmarksGridProps {
  bookmarks: Bookmark[]
  selectedIndex: number
  isTrashActive: boolean
  setGridRef?: (el: HTMLElement | null) => void
  columns?: number
  hideAddCard?: boolean
  showCommandHints?: boolean
  hintKeyById?: Record<string, string>
  showEdit?: boolean
  showDelete?: boolean
  showLocate?: boolean
  highlightedId?: string | null
  readonly?: boolean
  selectionVariant?: 'default' | 'search'
  /** 顶部插槽（如引导横幅），等价旧版 #header slot */
  header?: ReactNode
  onRemove?: (bookmark: Bookmark) => void
  onEdit?: (bookmark: Bookmark, el?: HTMLElement) => void
  onOpen?: (bookmark: Bookmark) => void
  onContextMenu?: (event: React.MouseEvent, bookmark: Bookmark) => void
  onLocate?: (bookmark: Bookmark) => void
  onAdd?: (el?: HTMLElement) => void
  onEmptyTrash?: () => void
  onReorder?: (payload: { fromId: string; toId: string }) => void
}

const isUTools = typeof window !== 'undefined' && !!(window as unknown as { utools?: unknown }).utools
const ADD_BUTTON_HEIGHT = isUTools ? '60px' : '66px'
const DURATION = 300

interface SortableCardProps {
  bookmark: Bookmark
  index: number
  disabled: boolean
  selected: boolean
  showHint?: boolean
  hintKey?: string
  readonly?: boolean
  showEdit?: boolean
  showDelete?: boolean
  showLocate?: boolean
  highlighted: boolean
  selectionVariant?: 'default' | 'search'
  columns?: number
  onRemove?: (bookmark: Bookmark) => void
  onEdit?: (bookmark: Bookmark, el?: HTMLElement) => void
  onOpen?: (bookmark: Bookmark) => void
  onLocate?: (bookmark: Bookmark) => void
  onContextMenu?: (event: React.MouseEvent, bookmark: Bookmark) => void
}

function SortableCard({
  bookmark,
  index,
  disabled,
  selected,
  showHint,
  hintKey,
  readonly,
  showEdit,
  showDelete,
  showLocate,
  highlighted,
  selectionVariant,
  columns,
  onRemove,
  onEdit,
  onOpen,
  onLocate,
  onContextMenu
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmark.id,
    disabled
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 100 : undefined
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-bookmark-index={index}
      data-bookmark-id={bookmark.id}
      className="bookmark-card-wrapper"
      {...attributes}
      {...listeners}
    >
      <BookmarkCard
        bookmark={bookmark}
        selected={selected}
        showHint={showHint}
        hintKey={hintKey}
        readonly={readonly}
        showEdit={showEdit}
        showDelete={showDelete}
        showLocate={showLocate}
        highlighted={highlighted}
        selectionVariant={selectionVariant}
        index={index}
        gridColumns={columns}
        onRemove={onRemove}
        onEdit={onEdit}
        onOpen={onOpen}
        onLocate={onLocate}
        onContextMenu={(e) => onContextMenu?.(e, bookmark)}
      />
    </div>
  )
}

export function BookmarksGrid({
  bookmarks,
  selectedIndex,
  isTrashActive,
  setGridRef,
  columns,
  hideAddCard,
  showCommandHints,
  hintKeyById,
  showEdit,
  showDelete,
  showLocate,
  highlightedId,
  readonly,
  selectionVariant,
  header,
  onRemove,
  onEdit,
  onOpen,
  onContextMenu,
  onLocate,
  onAdd,
  onEmptyTrash,
  onReorder
}: BookmarksGridProps) {
  const showToast = useUIManager((s) => s.showToast)
  const sectionRef = useRef<HTMLElement | null>(null)

  // 本地顺序（拖拽中平滑），props 变化时同步（等价旧版 localBookmarks + watch）
  const [localBookmarks, setLocalBookmarks] = useState<Bookmark[]>(bookmarks)
  useEffect(() => {
    setLocalBookmarks(bookmarks)
  }, [bookmarks])

  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const cols = columns && columns >= 2 && columns <= 5 ? columns : 4
  const gridStyle: React.CSSProperties = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }

  const itemIds = useMemo(() => localBookmarks.map((b) => b.id), [localBookmarks])

  const handleDragEnd = (event: DragEndEvent) => {
    if (readonly) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromId = String(active.id)
    const toId = String(over.id)
    // 本地立即重排，保证视觉连续；父级据 fromId/toId 重排 store 后回传 props 再同步
    setLocalBookmarks((prev) => {
      const fromIdx = prev.findIndex((b) => b.id === fromId)
      const toIdx = prev.findIndex((b) => b.id === toId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
    onReorder?.({ fromId, toId })
  }

  // highlightedId 居中滚动（等价旧版 watch highlightedId）
  useEffect(() => {
    if (!highlightedId) return
    requestAnimationFrame(() => {
      const item = document.querySelector(`[data-bookmark-id="${highlightedId}"]`) as HTMLElement | null
      if (!item) return
      let scroller = item.parentElement
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
      if (!scroller) return
      const target = item.offsetTop - scroller.clientHeight / 2 + item.clientHeight / 2
      const start = scroller.scrollTop
      const delta = Math.max(0, target) - start
      if (Math.abs(delta) < 1) {
        scroller.scrollTop = Math.max(0, target)
        return
      }
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - t0) / DURATION, 1)
        scroller!.scrollTop = start + delta * (1 - Math.pow(1 - t, 3))
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, [highlightedId])

  const copyText = async (text: string) => {
    try {
      if (!navigator.clipboard) {
        showToast({ title: '当前环境不支持剪贴板复制', variant: 'warning' })
        return
      }
      await navigator.clipboard.writeText(text)
      showToast({ title: '已复制到剪贴板', variant: 'success' })
    } catch {
      showToast({ title: '复制失败，请检查权限后重试', variant: 'error' })
    }
  }

  const confirmEmptyTrash = () => {
    const urls = bookmarks.map((b) => b.url).filter(Boolean).join('\n')
    const count = bookmarks.length
    onEmptyTrash?.()
    setEmptyTrashConfirmOpen(false)
    showToast({
      title: '回收站已清空',
      description: count > 0 ? `已永久删除 ${count} 条书签` : undefined,
      variant: 'success',
      actionLabel: urls ? '复制URL列表' : undefined,
      onAction: urls ? () => copyText(urls) : undefined
    })
  }

  return (
    <section
      ref={(el) => {
        sectionRef.current = el
        setGridRef?.(el)
      }}
      className="flex-1"
    >
      {header}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className="grid gap-4 content-start pt-2" style={gridStyle}>
            {localBookmarks.map((bookmark, index) => (
              <SortableCard
                key={bookmark.id}
                bookmark={bookmark}
                index={index}
                disabled={!!readonly}
                selected={selectedIndex === index}
                showHint={showCommandHints}
                hintKey={hintKeyById?.[bookmark.id]}
                readonly={readonly}
                showEdit={showEdit}
                showDelete={showDelete}
                showLocate={showLocate}
                highlighted={highlightedId === bookmark.id}
                selectionVariant={selectionVariant}
                columns={columns}
                onRemove={onRemove}
                onEdit={onEdit}
                onOpen={onOpen}
                onLocate={onLocate}
                onContextMenu={onContextMenu}
              />
            ))}

            {/* 添加卡片 */}
            {!isTrashActive && !hideAddCard && !readonly && (
              <BookmarkTooltip content={<p>添加书签</p>}>
                <Button
                  variant="outline"
                  className="bookmark-add-card group relative flex flex-row items-center justify-center gap-2 rounded-xl border-dashed py-3 px-4 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer w-full bg-transparent"
                  style={{ height: ADD_BUTTON_HEIGHT }}
                  onClick={(e) => onAdd?.(e.currentTarget)}
                >
                  <div className="group-hover:scale-110 transition-transform">
                    <Plus className="w-7 h-7" />
                  </div>
                </Button>
              </BookmarkTooltip>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {isTrashActive && bookmarks.length > 0 && (
        <div className="flex justify-center py-8">
          <Button variant="destructive" onClick={() => setEmptyTrashConfirmOpen(true)}>
            <Trash2 className="size-4 mr-2" />
            清空回收站
          </Button>
        </div>
      )}

      {/* 清空回收站确认 */}
      {emptyTrashConfirmOpen && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="presentation"
        >
          <div
            className="w-full sm:max-w-md mx-4 p-4 rounded-lg bg-card border border-border shadow-lg"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-lg font-semibold">清空回收站？</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              此操作不可恢复，将永久删除回收站内 {bookmarks.length} 条书签。
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setEmptyTrashConfirmOpen(false)}>
                取消
              </Button>
              <Button variant="destructive" autoFocus onClick={confirmEmptyTrash}>
                确认清空
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default BookmarksGrid
