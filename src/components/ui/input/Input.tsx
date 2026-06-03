import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Input —— shadcn-vue → React 等价重写。
 * --------------------------------------------------------------------------
 * 旧版 Vue 用 v-model（modelValue/update:modelValue），React 等价为受控
 * value + onChange（或非受控 defaultValue）。样式 token 完全沿用。
 */
export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...rest }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-muted/35 px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    )
  },
)

Input.displayName = 'Input'
