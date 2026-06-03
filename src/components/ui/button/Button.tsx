import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { buttonVariants, type ButtonVariants } from './index'

/**
 * Button —— shadcn-vue → React 等价重写。
 * --------------------------------------------------------------------------
 * 保留 shadcn 的 variant/size 命名与 token 化样式（应用内 ~60 处调用方零迁移成本）。
 * 原生 <button>，标准 React 事件（onClick/disabled/type…）。无埋点。
 *
 * 注意：旧版 Vue 用 reka-ui `Primitive` 支持 as/asChild，但全应用没有调用方在
 * Button 上用 asChild，故此处只保留原生按钮语义；如需「触发器套元素」交给
 * Tooltip/Popover/Dialog 的 Trigger 处理。
 */
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariants {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, type = 'button', children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
