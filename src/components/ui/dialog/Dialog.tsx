import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import {
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Pressable,
} from 'react-aria-components'
import { X } from 'lucide-react'
import { useUIManager } from '@/hooks/useUIManager'
import { cn } from '@/lib/utils'

/**
 * Dialog 家族 —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * 保留旧版导出名与受控用法（应用内统一 <Dialog :open @update:open>）：
 *   <Dialog open onOpenChange>
 *     <DialogContent class="sm:max-w-md">
 *       <DialogHeader><DialogTitle/><DialogDescription/></DialogHeader>
 *       ...
 *       <DialogFooter>...</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * BaseDialog 行为整合到 Dialog root：弹窗「关闭」时调用 useUIManager.onDialogClose()
 * （隐藏所有 tooltip + 维护 openDialogCount），逻辑等价旧版 BaseDialog 的 watch。
 * 无埋点。
 */

interface DialogContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}
const DialogContext = createContext<DialogContextValue | null>(null)

function useDialogContext(component: string): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error(`<${component}> 必须用在 <Dialog> 内部`)
  }
  return ctx
}

// ============ Dialog（root，受控 + UIManager 集成） ============
export interface DialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

export function Dialog({ open: openProp, defaultOpen, onOpenChange, children }: DialogProps) {
  // 受控/非受控统一：受控时以 openProp 为准，未受控时仅靠回调由外部托管。
  const open = openProp ?? defaultOpen ?? false

  const onDialogOpen = useUIManager((s) => s.onDialogOpen)
  const onDialogClose = useUIManager((s) => s.onDialogClose)

  // 追踪上一次 open，等价旧版 BaseDialog 的 wasOpen：只在「关闭」时清理 tooltip。
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      onDialogOpen()
    } else if (!open && wasOpen.current) {
      onDialogClose()
    }
    wasOpen.current = open
  }, [open, onDialogOpen, onDialogClose])

  const setOpen = (next: boolean) => {
    onOpenChange?.(next)
  }

  return (
    <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
  )
}

// ============ DialogTrigger（替代 as-child） ============
export interface DialogTriggerProps {
  /** 单个可触发子元素（如 <Button>），等价 reka-ui 的 as-child。 */
  children: ComponentProps<typeof Pressable>['children']
}

export function DialogTrigger({ children }: DialogTriggerProps) {
  const { setOpen } = useDialogContext('DialogTrigger')
  return <Pressable onPress={() => setOpen(true)}>{children}</Pressable>
}

// ============ DialogClose ============
export type DialogCloseProps = ButtonHTMLAttributes<HTMLButtonElement>

export function DialogClose({ onClick, children, ...rest }: DialogCloseProps) {
  const { setOpen } = useDialogContext('DialogClose')
  return (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

// ============ 内部：Overlay + Modal 外壳 ============
interface DialogShellProps {
  children: ReactNode
  className?: string
  /** 是否内容可滚动（DialogScrollContent） */
  scroll?: boolean
}

function DialogShell({ children, className, scroll }: DialogShellProps) {
  const { open, setOpen } = useDialogContext('DialogContent')

  return (
    <AriaModalOverlay
      isOpen={open}
      onOpenChange={setOpen}
      isDismissable
      className={cn(
        'fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4 sm:p-6',
        'data-[entering]:animate-in data-[entering]:fade-in-0',
        'data-[exiting]:animate-out data-[exiting]:fade-out-0',
      )}
    >
      <AriaModal
        className={cn(
          'z-[3001]',
          'data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95',
          'data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95',
        )}
      >
        <AriaDialog
          className={cn(
            'pointer-events-auto relative grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg outline-none sm:rounded-lg',
            scroll && 'max-h-[85vh] overflow-y-auto',
            className,
          )}
        >
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 outline-none ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  )
}

// ============ DialogContent ============
export interface DialogContentProps {
  children?: ReactNode
  className?: string
}

export function DialogContent({ children, className }: DialogContentProps) {
  return <DialogShell className={className}>{children}</DialogShell>
}

// ============ DialogScrollContent ============
export function DialogScrollContent({ children, className }: DialogContentProps) {
  return (
    <DialogShell className={className} scroll>
      {children}
    </DialogShell>
  )
}

// ============ 结构性子组件 ============
export function DialogHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-y-1.5 text-center sm:text-left', className)}
      {...rest}
    />
  )
}

export function DialogFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-x-2', className)}
      {...rest}
    />
  )
}

export function DialogTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <AriaHeading
      slot="title"
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...rest}
    >
      {children}
    </AriaHeading>
  )
}

export function DialogDescription({
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...rest} />
}

// 旧版别名：BaseDialog 即 Dialog（行为已整合）。
export const BaseDialog = Dialog
