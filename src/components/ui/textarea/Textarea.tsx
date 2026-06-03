import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Textarea —— shadcn-vue → React 等价重写。
 * --------------------------------------------------------------------------
 * 旧版 Vue v-model → React 受控 value + onChange（或非受控 defaultValue）。
 * 样式 token 完全沿用。
 */
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-muted/35 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    )
  },
)

Textarea.displayName = 'Textarea'
