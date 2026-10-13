import type * as React from 'react'
import { useDroppable, closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { OverflowHoverTooltip } from '@/components/ui/overflow-tooltip'
import { type HomeItem } from './viewModel'
import { Fav, BookmarkCard } from './BookmarkCard'

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
      onClick={onTabClick}
      onContextMenu={onTabContextMenu}
    >
      {name}
    </button>
  )
}



// ── 书签拖拽：碰撞策略（优先指针命中，空则回退到最近中心，兼顾「拖到段落空白/侧栏」与同段排序）──
export const bookmarkCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  return pointerHits.length ? pointerHits : closestCenter(args)
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
        <span className="s">· {count}</span>
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
}: {
  item: HomeItem
  groupId: string
  subId: string
  selected: boolean
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'bookmark', groupId, subId, item },
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
      onClick={() => { onSelect(item.id); onOpen?.(item) }}
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
}: {
  item: HomeItem
  groupId: string
  subId: string
  selected: boolean
  subText: string
  subClass: string
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'bookmark', groupId, subId, item },
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
      onClick={() => { onSelect(item.id); onOpen?.(item) }}
      {...attributes}
      {...listeners}
    >
      <Fav item={item} />
      <div className="ttl">{item.ttl}</div>
      {subText && <div className={subClass}>{subText}</div>}
    </OverflowHoverTooltip>
  )
}
