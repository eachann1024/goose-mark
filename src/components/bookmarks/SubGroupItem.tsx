import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTextOverflow } from '@/hooks/useTextOverflow'
import { useUIManager } from '@/hooks/useUIManager'
import { BookmarkTooltip } from './_BookmarkTooltip'
import './bookmarks.css'

/**
 * SubGroupItem（React 版）
 * --------------------------------------------------------------------------
 * 侧栏二级分组按钮，支持选中/拖拽悬停态、文字溢出 tooltip、右键编辑父分组。
 * 等价旧版 Vue SubGroupItem.vue。useTextOverflow / useUIManager 来自第 2 阶段 hooks。
 * 无埋点。
 */
export interface SubGroupItemSub {
  id: string
  name: string
  bookmarkIds?: string[]
}

export interface SubGroupItemProps {
  sub: SubGroupItemSub
  isActive: boolean
  isDragOver: boolean
  hasUpdate: boolean
  onSelect: (id: string) => void
  onDragOver?: (event: React.DragEvent) => void
  onDragLeave?: (event: React.DragEvent) => void
  onDrop?: (event: React.DragEvent) => void
  onEditParentGroup?: () => void
}

export function SubGroupItem({
  sub,
  isActive,
  isDragOver,
  hasUpdate,
  onSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onEditParentGroup
}: SubGroupItemProps) {
  const isTooltipEnabled = useUIManager((s) => s.isTooltipEnabled)
  const { overflowMap, observeOverflow } = useTextOverflow()
  const nameRef = useRef<HTMLDivElement | null>(null)

  // 名称变化时重新检测溢出（等价旧版 watch + onMounted + nextTick）
  useEffect(() => {
    if (nameRef.current) observeOverflow('self', nameRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.name])

  const isTruncated = overflowMap['self'] ?? false

  const handleSelect = (event: React.MouseEvent<HTMLButtonElement>) => {
    onSelect(sub.id)
    event.currentTarget.blur?.()
  }

  return (
    <BookmarkTooltip
      content={<p>{sub.name}</p>}
      disabled={!isTooltipEnabled || !isTruncated}
      side="right"
      offset={8}
    >
      <button
        type="button"
        className={cn(
          'subgroup-btn flex items-center justify-start w-full px-3 py-2 rounded-md text-sm transition-none text-left relative min-w-0 overflow-hidden outline-none disabled:pointer-events-none disabled:opacity-50',
          isActive ? 'subgroup-btn--active' : 'subgroup-btn--idle',
          isDragOver && 'subgroup-btn--drag-over'
        )}
        data-active={isActive ? 'true' : undefined}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          onEditParentGroup?.()
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div ref={nameRef} className="flex-1 min-w-0 truncate block">
          {sub.name}
        </div>
        {hasUpdate && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    </BookmarkTooltip>
  )
}

export default SubGroupItem
