import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * BaseCard（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 仅是 `.card-base` + slot + $attrs 透传的薄封装。
 * React 等价：透传所有原生 div 属性，children 即 slot。
 */
export interface BaseCardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function BaseCard({ className, children, ...rest }: BaseCardProps) {
  return (
    <div className={cn('card-base', className)} {...rest}>
      {children}
    </div>
  )
}

export default BaseCard
