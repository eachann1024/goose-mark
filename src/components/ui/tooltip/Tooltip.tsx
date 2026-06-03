import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react'
import {
  TooltipTrigger as AriaTooltipTrigger,
  Tooltip as AriaTooltip,
  Focusable,
  OverlayArrow,
} from 'react-aria-components'
import { useUIManager } from '@/hooks/useUIManager'
import { cn } from '@/lib/utils'

/**
 * Tooltip 家族 —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * 保留旧版编译式结构与导出名（应用内大量 <Tooltip><TooltipTrigger as-child>
 * <TooltipContent>...）：
 *   - TooltipProvider → 提供默认 delayDuration（react-aria 无独立 Provider，
 *     用 Context 下发默认 delay，等价旧版 :delay-duration）。
 *   - Tooltip        → react-aria TooltipTrigger（stately 包装，管理开合/延时）。
 *   - TooltipTrigger → Focusable（替代 reka-ui 的 as-child：把触发器子元素接入
 *     react-aria 的焦点/悬停体系）。
 *   - TooltipContent → 样式化 Tooltip，受 useUIManager.isTooltipEnabled 全局门控
 *     （弹窗关闭时统一隐藏，逻辑等价旧版）。
 */

// ============ Provider（默认延时下发） ============
interface TooltipProviderValue {
  delayDuration: number
  skipDelayDuration: number
}
const TooltipProviderContext = createContext<TooltipProviderValue>({
  delayDuration: 700,
  skipDelayDuration: 300,
})

export interface TooltipProviderProps {
  /** 显示前延时（ms），等价旧版 delay-duration */
  delayDuration?: number
  skipDelayDuration?: number
  children?: ReactNode
}

export function TooltipProvider({
  delayDuration = 700,
  skipDelayDuration = 300,
  children,
}: TooltipProviderProps) {
  return (
    <TooltipProviderContext.Provider value={{ delayDuration, skipDelayDuration }}>
      {children}
    </TooltipProviderContext.Provider>
  )
}

// ============ Tooltip（root，对应 TooltipTrigger 状态机） ============
export interface TooltipProps {
  children?: ReactNode
  /** 受控开合 */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** 显示延时（ms），覆盖 Provider 默认值 */
  delayDuration?: number
  closeDelay?: number
  disabled?: boolean
}

export function Tooltip({
  children,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
  closeDelay = 0,
  disabled,
}: TooltipProps) {
  const provider = useContext(TooltipProviderContext)
  const delay = delayDuration ?? provider.delayDuration

  return (
    <AriaTooltipTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delay={delay}
      closeDelay={closeDelay}
      isDisabled={disabled}
    >
      {children}
    </AriaTooltipTrigger>
  )
}

// ============ TooltipTrigger（替代 as-child） ============
export interface TooltipTriggerProps {
  /** 单个可聚焦子元素（如 <Button>），等价 reka-ui 的 as-child。 */
  children: ComponentProps<typeof Focusable>['children']
}

export function TooltipTrigger({ children }: TooltipTriggerProps) {
  // Focusable 把任意可聚焦子元素接入 react-aria 焦点/悬停体系，
  // 等价 reka-ui 的 <TooltipTrigger as-child>。
  return <Focusable>{children}</Focusable>
}

// ============ TooltipContent（样式化 + 全局门控） ============
export interface TooltipContentProps {
  children?: ReactNode
  className?: string
  /** 放置方位，等价 reka-ui side */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** 主轴偏移，等价 reka-ui side-offset */
  sideOffset?: number
  showArrow?: boolean
}

export function TooltipContent({
  children,
  className,
  side = 'top',
  sideOffset = 4,
  showArrow = false,
}: TooltipContentProps) {
  const isTooltipEnabled = useUIManager((s) => s.isTooltipEnabled)

  // 全局门控：弹窗关闭时统一隐藏所有 tooltip（逻辑等价旧版 isTooltipEnabled）。
  if (!isTooltipEnabled) return null

  return (
    <AriaTooltip
      placement={side}
      offset={sideOffset}
      className={cn(
        'tooltip-content z-[100] overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md',
        'data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95',
        'data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95',
        className,
      )}
    >
      {showArrow && (
        <OverlayArrow>
          <svg width={8} height={8} viewBox="0 0 8 8" className="fill-primary">
            <path d="M0 0 L4 4 L8 0" />
          </svg>
        </OverlayArrow>
      )}
      {children}
    </AriaTooltip>
  )
}
