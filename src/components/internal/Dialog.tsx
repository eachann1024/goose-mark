import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 内部轻量 Dialog 原语（React 重写阶段）
 * --------------------------------------------------------------------------
 * 第 3 阶段顶层组件需要弹窗，但 React 版基础 UI 控件尚未落地，HeroUI v3 的
 * Modal 需要 state 机器、与旧版 `open` / `onOpenChange` 受控契约不一致。
 * 故提供一个零依赖的受控 Dialog：portal + 遮罩 + ESC + 点击遮罩关闭。
 * 仅供 components/ 内的弹窗类组件复用，保持对外 props 契约稳定，集成阶段
 * 若切换到统一 UI 层可整体替换实现而不动调用方。
 */
export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** 内容容器额外 class（控制宽度等） */
  contentClassName?: string
  /** 点击遮罩是否关闭，默认 true */
  dismissable?: boolean
}

export function Dialog({
  open,
  onOpenChange,
  children,
  contentClassName,
  dismissable = true
}: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismissable, onOpenChange])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[15000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => dismissable && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-md rounded-xl border border-border bg-popover p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150',
          contentClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-1.5 mb-4', className)}>{children}</div>
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold text-foreground', className)}>{children}</h2>
}

export function DialogDescription({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 mt-6', className)}>{children}</div>
  )
}

export default Dialog
