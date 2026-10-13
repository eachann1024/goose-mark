import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeSmoothScrolling({
  smoothRafRef
}: {
  smoothRafRef: React.RefObject<number | null>
}) {
  const smoothScrollTo = useCallback((root: HTMLElement, target: number) => {
    if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current)
    const max = root.scrollHeight - root.clientHeight
    const to = Math.max(0, Math.min(target, max))
    const from = root.scrollTop
    const dist = to - from
    if (Math.abs(dist) < 1) {
      root.scrollTop = to
      return
    }
    // 距离越短动画越短（每步小移动 ~120ms），缓动用 easeOutCubic，跟手且不拖沓
    const dur = Math.min(180, 90 + Math.abs(dist) * 0.18)
    const startTs = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      root.scrollTop = from + dist * eased
      if (t < 1) {
        smoothRafRef.current = requestAnimationFrame(step)
      } else {
        smoothRafRef.current = null
      }
    }
    smoothRafRef.current = requestAnimationFrame(step)
  }, [])

  return { smoothScrollTo }
}

export function useHomeSelectionScroll({
  screen,
  selectedId,
  suppressScrollIntoViewRef,
  contentRef,
  keyboardNavRef,
  smoothScrollTo,
  view
}: Pick<HomeNavigationBindings, 'screen' | 'selectedId' | 'view'> &
  Pick<HomeScrollBindings, 'suppressScrollIntoViewRef' | 'contentRef'> & {
  keyboardNavRef: React.RefObject<boolean>
  smoothScrollTo: (root: HTMLElement, target: number) => void
}) {

  // 选中项变化时滚入可视区域
  useEffect(() => {
    if (screen !== 'list' && screen !== 'grid') return
    if (!selectedId) return
    if (suppressScrollIntoViewRef.current) {
      suppressScrollIntoViewRef.current = false
      return
    }
    const root = contentRef.current
    if (!root) return
    const sel = root.querySelector<HTMLElement>(`[data-item-id="${selectedId}"]`)
    if (!sel) return
    // 全局搜索命令条：在条内滚动容器里就近露出，不要滚整个 content
    const stripList = sel.closest('.usearch-list') as HTMLElement | null
    if (stripList) {
      const fromKbd = keyboardNavRef.current
      keyboardNavRef.current = false
      sel.scrollIntoView({ block: 'nearest', behavior: fromKbd ? 'auto' : 'smooth' })
      return
    }
    if (keyboardNavRef.current) {
      // 键盘方向键导航：把选中项滚到容器正中。
      // 用 rAF 自写缓动平滑跟随——长按连续触发时每次取消上一段动画、从当前 scrollTop 重新缓动到新目标，
      // 既不会像原生 smooth 那样相互打断卡顿，也不像瞬时 auto 那样硬跳，整体连贯流畅。
      keyboardNavRef.current = false
      const rRect = root.getBoundingClientRect()
      const sRect = sel.getBoundingClientRect()
      const delta = (sRect.top - rRect.top) - (root.clientHeight - sRect.height) / 2
      smoothScrollTo(root, root.scrollTop + delta)
    } else {
      // 鼠标点击等其他来源：就近滚入即可（避免页面跳动）
      sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedId, screen, view, smoothScrollTo])
}
