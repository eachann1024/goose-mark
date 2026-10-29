import { useMemo, type MouseEvent, type ReactElement } from 'react'
import { useDndContext, useDroppable, closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { OverflowHoverTooltip } from '@/components/ui/overflow-tooltip'
import { type HomeGroup, type HomeItem } from './viewModel'
import { Fav, BookmarkCard } from './BookmarkCard'
import { HighlightText } from './highlight'
import { Ico } from './icon'
import { resolveDropGap, type DropGapInfo } from './dropGap'
import { bookmarkDragId } from './bookmarkDragId'

// ── SortableTab：顶栏一级分组 Tab 可拖拽单项（模块顶层，避免 TDZ）──────────
export interface SortableTabProps {
  id: string
  name: string
  isActive: boolean
  onTabClick: () => void
  onTabContextMenu: (e: React.MouseEvent) => void
}



export function SortableTab({ id, name, isActive, onTabClick, onTabContextMenu }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group-tab${isActive ? ' on' : ''}${isDragging ? ' dragging' : ''}`}
      data-group-id={id}
      onClick={onTabClick}
      onContextMenu={onTabContextMenu}
    >
      {name}
    </button>
  )
}



// ── 书签拖拽：碰撞策略（优先指针命中，空则回退到最近中心，兼顾「拖到段落空白/侧栏」与同段排序）──
export const bookmarkCollision: CollisionDetection = (args) => {
  // 保活的隐藏面板仍在注册表中，不能用它们缓存的矩形决定落点。
  const droppableContainers = args.droppableContainers.filter((container) => {
    const node = container.node.current
    if (!node || node.getClientRects().length === 0) return false
    if (args.active.data.current?.type === 'sub') {
      return container.data.current?.type === 'sub'
        && container.data.current.groupId === args.active.data.current.groupId
    }
    return true
  })
  const visibleArgs = { ...args, droppableContainers }
  const pointerHits = pointerWithin(visibleArgs)
  return pointerHits.length ? pointerHits : closestCenter(visibleArgs)
}



// ── DropGap：跨子分组拖拽的落点占位（真实占位元素，靠布局让后面的卡片/格子让开）──
export function DropGap({ height, view }: { height: number; view: 'list' | 'grid' }) {
  return <div className={`drop-gap is-${view}`} style={height > 0 ? { height } : undefined} aria-hidden />
}

/** 当前拖拽落点是否落在别的子分组（同段由 dnd-kit 自身让位） */
export function useDragDropGap(groups: HomeGroup[], view: 'list' | 'grid'): DropGapInfo | null {
  const { active, over } = useDndContext()
  return useMemo(() => resolveDropGap(active, over, groups, view), [active, over, groups, view])
}

/** 在指定下标插入落点占位 */
export function insertDropGap(nodes: ReactElement[], gap: DropGapInfo | null): ReactElement[] {
  if (!gap) return nodes
  const at = Math.max(0, Math.min(gap.index, nodes.length))
  return [
    ...nodes.slice(0, at),
    <DropGap key="__drop-gap__" height={gap.height} view={gap.view} />,
    ...nodes.slice(at)
  ]
}



// ── SecBlock：子分组段容器（droppable），让空段与段落空白区也能接收书签 ──────────
export function SecBlock({
  groupId,
  subId,
  subName,
  count,
  view,
  children,
}: {
  groupId: string
  subId: string
  subName: string
  count: number
  view: 'list' | 'grid'
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `area:${groupId}:${subId}`,
    data: { type: 'sub-area', groupId, subId },
  })
  return (
    <div
      ref={setNodeRef}
      className={`sec-block${isOver ? ' drop-over' : ''}`}
      data-sec-id={`sec-${groupId}-${subId}`}
      data-sub-id={subId}
      data-view={view}
    >
      <div className="sec-head">
        <span className="g">{subName}</span>
        <span className="s">{count} 个</span>
      </div>
      {children}
    </div>
  )
}



// ── SortableCard：列表视图可拖拽书签行（模块顶层，避免 TDZ）────────────────────
export function SortableCard({
  item,
  groupId,
  subId,
  selected,
  onSelect,
  onOpen,
  onInspect,
  onMore,
  query,
}: {
  item: HomeItem
  groupId: string
  subId: string
  selected: boolean
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  onInspect?: (item: HomeItem) => void
  onMore?: (e: MouseEvent, item: HomeItem) => void
  query?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmarkDragId(groupId, subId, item.id),
    data: { type: 'bookmark', groupId, subId, bookmarkId: item.id, item },
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <BookmarkCard
      item={item}
      selected={selected}
      groupId={groupId}
      subId={subId}
      style={style}
      anchorRef={setNodeRef}
      disabled={isDragging}
      dndProps={{ ...attributes, ...listeners }}
      query={query}
      showHost
      onMore={onMore ? (e) => onMore(e, item) : undefined}
      onClick={() => { onSelect(item.id); onInspect?.(item) }}
      onDoubleClick={() => onOpen?.(item)}
    />
  )
}



// ── SortableGridCell：网格视图可拖拽书签格（模块顶层，避免 TDZ）───────────────────
export function SortableGridCell({
  item,
  groupId,
  subId,
  selected,
  subText,
  subClass,
  onSelect,
  onOpen,
  onInspect,
  onMore,
  query,
}: {
  item: HomeItem
  groupId: string
  subId: string
  selected: boolean
  subText: string
  subClass: string
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  onInspect?: (item: HomeItem) => void
  onMore?: (e: MouseEvent, item: HomeItem) => void
  query?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmarkDragId(groupId, subId, item.id),
    data: { type: 'bookmark', groupId, subId, bookmarkId: item.id, item },
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <OverflowHoverTooltip
      anchorRef={setNodeRef}
      style={style}
      title={item.ttl}
      description={subClass === 'dsc' ? subText : undefined}
      disabled={isDragging}
      className={`gcard${selected ? ' sel' : ''}`}
      data-item-id={item.id}
      data-group-id={groupId}
      data-sub-id={subId}
      {...attributes}
      {...listeners}
      onClick={() => { onSelect(item.id); onInspect?.(item) }}
      onDoubleClick={() => onOpen?.(item)}
    >
      <Fav item={item} />
      <div className="meta">
        <div className="ttl"><HighlightText text={item.ttl} query={query} /></div>
        {subText && <div className={subClass}><HighlightText text={subText} query={query} /></div>}
      </div>
      {item.pin && <Ico name="pin" className="pin" />}
      {onMore && (
        <button
          type="button"
          data-more
          className="more"
          aria-label="更多"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMore(e, item) }}
        >
          <Ico name="more-horizontal" />
        </button>
      )}
    </OverflowHoverTooltip>
  )
}
