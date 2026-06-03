import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AnimationOrigin } from '@/hooks/useUIManager'
import { cn } from '@/lib/utils'

/**
 * ResultToast（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue Teleport + hidden + @starting-style 生长动画 → React createPortal +
 * hidden 属性 + .toast-container 样式（已迁移到 index.css）。i-ph-* 图标改用
 * lucide-react；origin 通过 --origin-x/--origin-y CSS 变量传入控制生长锚点。
 * 自定义 action 区域通过 actionSlot 传入（等价旧版具名插槽）。
 */
type Variant = 'success' | 'info' | 'warning' | 'error'

export interface ResultToastProps {
  open: boolean
  title: string
  description?: string
  variant?: Variant
  /** 可选的自定义图标组件，覆盖按 variant 推导的默认图标 */
  icon?: LucideIcon
  actionLabel?: string
  origin?: AnimationOrigin
  onClose: () => void
  onAction?: () => void
  /** 等价旧版具名插槽 #action，渲染在内置 actionLabel 按钮左侧 */
  actionSlot?: ReactNode
}

const MAX_TITLE_LEN = 50
const MAX_DESC_LEN = 300

const VARIANT_ICON: Record<Variant, { Icon: LucideIcon; color: string }> = {
  success: { Icon: CheckCircle2, color: 'text-primary' },
  info: { Icon: Info, color: 'text-muted-foreground' },
  warning: { Icon: AlertTriangle, color: 'text-yellow-500' },
  error: { Icon: XCircle, color: 'text-destructive' }
}

export function ResultToast({
  open,
  title,
  description,
  variant = 'info',
  icon,
  actionLabel,
  origin,
  onClose,
  onAction,
  actionSlot
}: ResultToastProps) {
  const { Icon, color } = VARIANT_ICON[variant]
  const ResolvedIcon = icon ?? Icon

  const sanitizedTitle = useMemo(() => {
    const t = title || ''
    return t.length > MAX_TITLE_LEN ? `${t.slice(0, MAX_TITLE_LEN)}…` : t
  }, [title])

  const sanitizedDescription = useMemo(() => {
    const d = description || ''
    return d.length > MAX_DESC_LEN ? `${d.slice(0, MAX_DESC_LEN)}…` : d
  }, [description])

  const originStyle = useMemo<CSSProperties>(() => {
    if (!origin) return {}
    return {
      ['--origin-x' as string]: origin.x,
      ['--origin-y' as string]: origin.y
    }
  }, [origin])

  return createPortal(
    <div
      className="toast-container top-20 right-4"
      style={originStyle}
      hidden={!open || undefined}
    >
      <div className={cn('flex gap-3', description ? 'items-start' : 'items-center')}>
        <ResolvedIcon className={cn('text-lg shrink-0 size-[18px]', icon ? '' : color, description && 'mt-0.5')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground leading-tight">{sanitizedTitle}</p>
          {sanitizedDescription && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">
              {sanitizedDescription}
            </p>
          )}
        </div>
        <button
          type="button"
          title="关闭"
          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
          onClick={onClose}
        >
          <X className="size-[14px]" />
        </button>
      </div>

      {(actionLabel || actionSlot) && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {actionSlot}
          {actionLabel && (
            <button
              type="button"
              className="h-7 px-3 text-xs inline-flex items-center justify-center rounded-md border border-input bg-muted/35 text-foreground shadow-sm hover:bg-muted/60 transition-colors"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}

export default ResultToast
