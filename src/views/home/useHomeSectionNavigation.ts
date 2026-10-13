import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import { type HomeGroup } from './viewModel'
import { type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeSectionNavigation({
  homeGroups,
  setActiveSubId,
  centerSidebar,
  contentRef,
  isAnchorScrollingRef,
  anchorScrollTimer,
  anchorRaf
}: Pick<HomeScrollBindings, 'contentRef' | 'isAnchorScrollingRef' | 'anchorScrollTimer' | 'anchorRaf'> & {
  homeGroups: HomeGroup[]
  setActiveSubId: React.Dispatch<React.SetStateAction<string | null>>
  centerSidebar: () => void
}) {

  const syncSidebarForItem = useCallback(
    (itemId: string) => {
      for (const g of homeGroups) {
        for (const s of g.subs) {
          if (s.items.some((b) => b.id === itemId)) {
            // 键盘导航跨到新子分组时才居中（同一子分组内移动不触发，频率天然很低、不抖）
            setActiveSubId((prev) => {
              if (prev !== s.id) centerSidebar()
              return s.id
            })
            return
          }
        }
      }
    },
    [homeGroups, centerSidebar]
  )

  // ---- 侧栏 → 内容区锚点滚动：点击子分组滚到对应分组段 ----
  // setTimeout(0) 等 React 提交完成（清空搜索 / 从回收站切回后段落才存在），再做平滑滚动；
  // 滚动期间抑制 scroll-spy，避免高亮闪过中间分组。
  const scrollToSection = useCallback((groupId: string, subId: string) => {
    window.setTimeout(() => {
      const root = contentRef.current
      if (!root) return
      const el = root.querySelector<HTMLElement>(`[data-sec-id="sec-${groupId}-${subId}"]`)
      if (!el) return
      isAnchorScrollingRef.current = true
      if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
      cancelAnimationFrame(anchorRaf.current)
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
      root.scrollTo({ top: Math.max(0, top - 4), behavior: 'auto' })
      // 抑制 scroll-spy 直到 smooth 动画真正停下（连续若干帧 scrollTop 不变）。
      // 固定超时会在动画末尾解除，恰好放过最后一次 scroll 事件 → 触底兜底逻辑误把高亮改成末段。
      let last = -1
      let still = 0
      const release = () => { isAnchorScrollingRef.current = false }
      const settle = () => {
        const cur = Math.round(root.scrollTop)
        if (cur === last) {
          if (++still >= 3) { release(); return }
        } else {
          still = 0
          last = cur
        }
        anchorRaf.current = requestAnimationFrame(settle)
      }
      anchorRaf.current = requestAnimationFrame(settle)
      // 硬超时兜底：万一 rAF 被冻结（页面离屏等），1.2s 后强制解除抑制，避免 scroll-spy 永久失灵
      if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
      anchorScrollTimer.current = setTimeout(release, 1200)
    }, 0)
  }, [])
  useEffect(() => () => {
    if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
    cancelAnimationFrame(anchorRaf.current)
  }, [])

  return { syncSidebarForItem, scrollToSection }
}
