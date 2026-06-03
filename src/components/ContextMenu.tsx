import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import {
  ExternalLink,
  Globe,
  Copy,
  FileText,
  Pencil,
  Pin,
  Folder,
  Trash2,
  CornerUpLeft
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ContextMenu（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue ref + onMounted 监听 + watch(x,y) 重定位 → React useState + useEffect。
 * 通过 portal 挂到 body，挂载/坐标变化后用 useLayoutEffect 量取尺寸做边缘避让。
 * i-ph-* 图标改为 lucide-react；scoped @apply 样式内联为 Tailwind class。
 */
export type ContextMenuAction =
  | 'open'
  | 'openInUtoolsBrowser'
  | 'copy'
  | 'copyDescription'
  | 'edit'
  | 'pin'
  | 'locate'
  | 'remove'
  | 'restore'

export interface ContextMenuProps {
  x: number
  y: number
  isTrash?: boolean
  readonly?: boolean
  isUTools?: boolean
  hasDescription?: boolean
  onClose: () => void
  onAction: (action: ContextMenuAction) => void
}

const EDGE_GAP = 8

const ITEM_CLASS =
  'flex items-center gap-[9px] h-[30px] px-[10px] rounded-[7px] text-[13px] text-foreground text-left w-full transition-colors cursor-default select-none hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed'
const DANGER_ITEM_CLASS = 'text-destructive hover:bg-destructive/10'
const ICON_CLASS = 'w-4 shrink-0 size-[14px] text-muted-foreground'
const DANGER_ICON_CLASS = 'w-4 shrink-0 size-[14px] text-destructive'
const DIVIDER_CLASS = 'h-px bg-border my-[4px] mx-[6px]'

function MenuItem({
  icon: Icon,
  label,
  danger,
  disabled,
  onClick
}: {
  icon: LucideIcon
  label: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(ITEM_CLASS, danger && DANGER_ITEM_CLASS)}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className={danger ? DANGER_ICON_CLASS : ICON_CLASS} />
      <span>{label}</span>
    </button>
  )
}

export function ContextMenu({
  x,
  y,
  isTrash,
  readonly,
  isUTools,
  hasDescription,
  onClose,
  onAction
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isPositioned, setIsPositioned] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({
    top: 0,
    left: 0,
    visibility: 'hidden'
  })

  const updatePosition = useCallback(() => {
    const el = menuRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const viewWidth = window.innerWidth
    const viewHeight = window.innerHeight

    let left = x
    let top = y

    if (left + rect.width > viewWidth - EDGE_GAP) {
      left = viewWidth - rect.width - EDGE_GAP
    }
    if (top + rect.height > viewHeight - EDGE_GAP) {
      top = y - rect.height
    }

    left = Math.max(EDGE_GAP, left)
    top = Math.max(EDGE_GAP, top)

    setStyle({
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      visibility: 'visible'
    })
    setIsPositioned(true)
  }, [x, y])

  // 挂载 / 坐标变化后量取尺寸定位（等价旧版 nextTick + watch）
  useLayoutEffect(() => {
    setIsPositioned(false)
    updatePosition()
  }, [updatePosition])

  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleResize = () => updatePosition()

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('contextmenu', handleClickOutside)
    document.addEventListener('scroll', handleClickOutside, true)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
      document.removeEventListener('scroll', handleClickOutside, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [onClose, updatePosition])

  const handleAction = (action: ContextMenuAction) => {
    onAction(action)
    onClose()
  }

  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        'context-menu fixed z-[10000] w-[224px] bg-popover border border-border rounded-[11px] shadow-lg p-[5px] flex flex-col animate-[ctx-pop-in_0.12s_ease-out_forwards]',
        !isPositioned && 'pointer-events-none'
      )}
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!isTrash ? (
        <>
          <MenuItem icon={ExternalLink} label="打开链接" onClick={() => handleAction('open')} />

          {isUTools && (
            <MenuItem
              icon={Globe}
              label="使用 uTools 浏览器打开"
              onClick={() => handleAction('openInUtoolsBrowser')}
            />
          )}

          <MenuItem icon={Copy} label="复制链接" onClick={() => handleAction('copy')} />

          <MenuItem
            icon={FileText}
            label="复制描述"
            disabled={!hasDescription}
            onClick={() => handleAction('copyDescription')}
          />

          {!readonly && (
            <>
              <div className={DIVIDER_CLASS} />
              <MenuItem icon={Pencil} label="编辑" onClick={() => handleAction('edit')} />
              <MenuItem icon={Pin} label="置顶" onClick={() => handleAction('pin')} />
              <MenuItem icon={Folder} label="在分组中定位" onClick={() => handleAction('locate')} />
              <div className={DIVIDER_CLASS} />
              <MenuItem
                icon={Trash2}
                label="移到回收站"
                danger
                onClick={() => handleAction('remove')}
              />
            </>
          )}
        </>
      ) : (
        <>
          <MenuItem icon={CornerUpLeft} label="还原" onClick={() => handleAction('restore')} />
          <div className={DIVIDER_CLASS} />
          <MenuItem
            icon={Trash2}
            label="彻底删除"
            danger
            onClick={() => handleAction('remove')}
          />
        </>
      )}
    </div>,
    document.body
  )
}

export default ContextMenu
