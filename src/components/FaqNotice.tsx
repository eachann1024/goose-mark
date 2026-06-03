import type { ComponentType } from 'react'
import { Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * FaqNotice（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 用 i-ph-* class 渲染图标；React 改用 lucide-react 图标组件。
 * 默认 Info 图标，可通过 icon prop 传入任意 lucide 图标组件覆盖。
 */
export interface FaqNoticeProps {
  title: string
  description: string
  icon?: LucideIcon | ComponentType<{ className?: string }>
  className?: string
}

export function FaqNotice({ title, description, icon: Icon = Info, className }: FaqNoticeProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-white p-4 text-sm text-muted-foreground dark:bg-[hsl(var(--card))]',
        className
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
        <Icon className="shrink-0 size-[1.125rem] text-muted-foreground" />
        <span>{title}</span>
      </div>
      <p className="leading-relaxed whitespace-pre-line">{description}</p>
    </div>
  )
}

export default FaqNotice
