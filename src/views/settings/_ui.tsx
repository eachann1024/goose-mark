import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  Info as InfoIcon,
  AlertTriangle,
  XCircle,
  X as XIcon
} from 'lucide-react'

/**
 * settings 模块通用基础控件（React）
 * --------------------------------------------------------------------------
 * 第 3 阶段尚未交付 React 版基础控件（src/components/ui 仍为 .vue），HeroUI v3
 * 的复合原语 API 与本项目 Tailwind token 体系对齐成本高且本地缺文档。这里用
 * 项目自身 CSS token（.settings-block / hsl(var(--*))）实现一组轻量、类型安全、
 * 与旧 Vue 设置页视觉等价的原子控件，供 8 个设置页复用。
 *
 * 精细设计对齐留到统一设计阶段，本阶段以功能等价为目标。
 */

/* ----------------------------- Button ----------------------------------- */

type SettingsButtonVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
type SettingsButtonSize = 'sm' | 'md' | 'icon'

export interface SettingsButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SettingsButtonVariant
  size?: SettingsButtonSize
}

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

const buttonVariants: Record<SettingsButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline:
    'border border-input bg-transparent hover:bg-muted/60 text-foreground',
  ghost: 'hover:bg-muted/60 text-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
}

const buttonSizes: Record<SettingsButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4',
  icon: 'h-9 w-9 p-0'
}

export const Button = forwardRef<HTMLButtonElement, SettingsButtonProps>(
  ({ variant = 'default', size = 'md', className = '', type, ...rest }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...rest}
    />
  )
)
Button.displayName = 'SettingsButton'

/* ----------------------------- Input ------------------------------------ */

export type SettingsInputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, SettingsInputProps>(
  ({ className = '', type = 'text', ...rest }, ref) => (
    <input
      ref={ref}
      type={type}
      className={`flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
)
Input.displayName = 'SettingsInput'

/* ----------------------------- Switch ----------------------------------- */

export interface SettingsSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

export function Switch({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel
}: SettingsSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[1.4rem] w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none block h-[1.05rem] w-[1.05rem] rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[1.15rem]' : 'translate-x-[0.15rem]'
        }`}
      />
    </button>
  )
}

/* ----------------------------- Modal ------------------------------------ */

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** 点击遮罩/Esc 是否允许关闭，默认 true */
  dismissable?: boolean
  className?: string
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  dismissable = true,
  className = '',
  children
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissable, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={() => dismissable && onClose()}
      />
      <div
        className={`relative z-10 w-full max-w-md rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95 ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export function ModalHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-1.5">{children}</div>
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-semibold leading-none tracking-tight text-foreground">
      {children}
    </h2>
  )
}

export function ModalDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function ModalFooter({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`mt-6 flex items-center justify-end gap-3 ${className}`}>
      {children}
    </div>
  )
}

/* --------------------------- Settings block ----------------------------- */

export function SettingsBlock({
  title,
  desc,
  className = '',
  style,
  children
}: {
  title?: ReactNode
  desc?: ReactNode
  className?: string
  style?: React.CSSProperties
  children?: ReactNode
}) {
  return (
    <div className={`settings-block ${className}`} style={style}>
      {(title || desc) && (
        <div className="settings-block__head">
          {title && <h3 className="settings-block__title">{title}</h3>}
          {desc && <p className="settings-block__desc">{desc}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

export function SettingsRow({
  label,
  hint,
  children,
  alignTop = false
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  alignTop?: boolean
}) {
  return (
    <div className={`settings-row ${alignTop ? 'settings-row--top' : ''}`}>
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/* ----------------------------- ResultToast ------------------------------ */

export type ResultToastVariant = 'success' | 'info' | 'warning' | 'error'

export interface ResultToastState {
  visible: boolean
  variant: ResultToastVariant
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

const toastIcon: Record<ResultToastVariant, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-emerald-500" />,
  info: <InfoIcon className="size-5 text-sky-500" />,
  warning: <AlertTriangle className="size-5 text-amber-500" />,
  error: <XCircle className="size-5 text-destructive" />
}

export interface ResultToastProps {
  open: boolean
  variant?: ResultToastVariant
  title: string
  description?: string
  actionLabel?: string
  onClose: () => void
  onAction?: () => void
}

export function ResultToast({
  open,
  variant = 'info',
  title,
  description,
  actionLabel,
  onClose,
  onAction
}: ResultToastProps) {
  if (!open) return null
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex max-w-sm items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4">
      <span className="mt-0.5 shrink-0">{toastIcon[variant]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && (
          <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actionLabel && onAction && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-3 text-xs"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
      <button
        type="button"
        className="ml-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={onClose}
        aria-label="关闭"
      >
        <XIcon className="size-4" />
      </button>
    </div>,
    document.body
  )
}

/**
 * useResultToast：复刻旧 Vue 设置页里的 showResultToast/closeResultToast 计时逻辑。
 */
export function createResultToastController(
  setState: (next: ResultToastState) => void,
  getState: () => ResultToastState
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const close = () => {
    if (timer) clearTimeout(timer)
    timer = null
    setState({ ...getState(), visible: false, onAction: undefined })
  }
  const show = (
    payload: Omit<ResultToastState, 'visible'>,
    timeoutMs = 4500
  ) => {
    if (timer) clearTimeout(timer)
    setState({ ...payload, visible: true })
    timer = setTimeout(close, timeoutMs)
  }
  return { show, close }
}
