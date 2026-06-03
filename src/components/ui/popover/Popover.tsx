import type { ComponentProps, ReactNode } from 'react'
import {
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
  Dialog as AriaDialog,
  Pressable,
} from 'react-aria-components'
import type { Placement } from 'react-aria-components'
import { cn } from '@/lib/utils'

/**
 * Popover 家族 —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * 保留旧版编译式结构与导出名：
 *   <Popover open onOpenChange>
 *     <PopoverTrigger>{Button}</PopoverTrigger>
 *     <PopoverContent side align sideOffset className>...</PopoverContent>
 *   </Popover>
 * 映射：
 *   - Popover        → react-aria DialogTrigger（管理开合）。
 *   - PopoverTrigger → Pressable（替代 reka-ui as-child，把子按钮接入触发体系）。
 *   - PopoverContent → react-aria Popover + Dialog（带 token 样式与方位映射）。
 * reka-ui 的 side+align 组合映射为 react-aria 单一 placement。
 */

// reka-ui (side, align) → react-aria placement
type Side = 'top' | 'bottom' | 'left' | 'right'
type Align = 'start' | 'center' | 'end'

function toPlacement(side: Side, align: Align): Placement {
  if (align === 'center') return side
  return `${side} ${align}` as Placement
}

// ============ Popover（root） ============
export interface PopoverProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

export function Popover({ open, defaultOpen, onOpenChange, children }: PopoverProps) {
  return (
    <AriaDialogTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {children}
    </AriaDialogTrigger>
  )
}

// ============ PopoverTrigger（替代 as-child） ============
export interface PopoverTriggerProps {
  /** 单个可触发子元素（如 <Button>），等价 reka-ui 的 as-child。 */
  children: ComponentProps<typeof Pressable>['children']
}

export function PopoverTrigger({ children }: PopoverTriggerProps) {
  // Pressable 把任意子元素接入 react-aria 的 press/焦点体系，
  // 等价 reka-ui 的 <PopoverTrigger as-child>。
  return <Pressable>{children}</Pressable>
}

// ============ PopoverContent ============
export interface PopoverContentProps {
  children?: ReactNode
  className?: string
  side?: Side
  align?: Align
  sideOffset?: number
  crossOffset?: number
}

export function PopoverContent({
  children,
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 4,
  crossOffset,
}: PopoverContentProps) {
  return (
    <AriaPopover
      placement={toPlacement(side, align)}
      offset={sideOffset}
      crossOffset={crossOffset}
      className={cn(
        'z-[3100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
        'data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95',
        'data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95',
        'data-[placement=bottom]:slide-in-from-top-2 data-[placement=top]:slide-in-from-bottom-2',
        'data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2',
        className,
      )}
    >
      <AriaDialog className="outline-none">{children}</AriaDialog>
    </AriaPopover>
  )
}
