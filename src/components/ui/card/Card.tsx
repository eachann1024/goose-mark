import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Card 家族 —— shadcn-vue → React 等价重写。
 * --------------------------------------------------------------------------
 * 纯样式容器（div/p/h3），token 与结构原样保留。导出名沿用 shadcn-vue。
 */

export type CardProps = HTMLAttributes<HTMLDivElement>

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border bg-card text-card-foreground shadow', className)}
      {...rest}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-y-1.5 p-6', className)} {...rest} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...rest }, ref) => (
    <h3
      ref={ref}
      className={cn('font-semibold leading-none tracking-tight', className)}
      {...rest}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...rest }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...rest} />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...rest} />
  ),
)
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...rest} />
  ),
)
CardFooter.displayName = 'CardFooter'
