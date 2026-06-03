import type { ReactElement, ReactNode } from 'react'
import { Tooltip as HeroTooltip } from '@heroui/react'

/**
 * BookmarkTooltip —— 书签模块内部的轻量 Tooltip 包装。
 * --------------------------------------------------------------------------
 * 基于 HeroUI v3（react-aria）的复合 Tooltip API 封装，对外暴露与旧版 Vue
 * `<Tooltip :disabled><TooltipTrigger as-child/><TooltipContent side/>` 一致
 * 的简化接口，避免每个组件重复写复合结构。
 *
 * 注：HeroUI v3 Tooltip 的 Trigger 要求子元素可聚焦（button / a 等）。本模块内
 * 的触发器均为 <button>/<Button>，满足要求。无埋点。
 */
export interface BookmarkTooltipProps {
  content: ReactNode
  children: ReactElement
  disabled?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  offset?: number
}

export function BookmarkTooltip({
  content,
  children,
  disabled = false,
  side = 'top',
  offset
}: BookmarkTooltipProps) {
  if (disabled) return children
  return (
    <HeroTooltip.Root delay={300}>
      <HeroTooltip.Trigger>{children}</HeroTooltip.Trigger>
      <HeroTooltip.Content placement={side} offset={offset}>
        {content}
      </HeroTooltip.Content>
    </HeroTooltip.Root>
  )
}

export default BookmarkTooltip
