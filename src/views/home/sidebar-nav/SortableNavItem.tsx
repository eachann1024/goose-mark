import type * as React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ico } from '../icon'

interface SortableNavItemProps {
  id: string
  name: string
  count: number
  isActive: boolean
  isEditing: boolean
  groupId: string
  inputVal: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onSubClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onMoreClick: (e: React.MouseEvent) => void
  onInputChange: (val: string) => void
  onInputKeyDown: (e: React.KeyboardEvent) => void
  onInputBlur: () => void
}

export function SortableNavItem({
  id,
  name,
  count,
  isActive,
  isEditing,
  groupId,
  inputVal,
  inputRef,
  onSubClick,
  onContextMenu,
  onMoreClick,
  onInputChange,
  onInputKeyDown,
  onInputBlur,
}: SortableNavItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id,
    disabled: isEditing,
    data: { type: 'sub', groupId },
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`nav-item${isActive ? ' on' : ''} nav-item-editing`}
      >
        <input
          ref={inputRef}
          className="sidebar-inline-input"
          value={inputVal}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={onInputBlur}
        />
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`nav-item nav-item-hoverable${isActive ? ' on' : ''}${isDragging ? ' dragging' : ''}${isOver ? ' drop-over' : ''}`}
      data-nav-type="sub"
      data-group-id={groupId}
      data-sub-id={id}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onSubClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSubClick() } }}
      onContextMenu={onContextMenu}
    >
      <span>{name}</span>
      <span className="nav-item-trailing">
        <span className="count nav-item-count">{count}</span>
        <button
          className="nav-icon-btn nav-item-more"
          title="更多操作"
          onClick={onMoreClick}
        >
          <Ico name="more-horizontal" />
        </button>
      </span>
    </div>
  )
}
