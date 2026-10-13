import { useCallback, useEffect } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeScrollSpy({
  setActiveSubId,
  view,
  screen,
  contentRef,
  isAnchorScrollingRef
}: Pick<HomeNavigationBindings, 'setActiveSubId' | 'view' | 'screen'> &
  Pick<HomeScrollBindings, 'contentRef' | 'isAnchorScrollingRef'>) {

  // ---- SidebarNav：activeSubId 修复回调（删除/移动/提升后回退到首个子分组） ----
  const handleActiveSubIdFix = useCallback(
    (subId: string, groupId: string) => {
      setActiveSubId(subId)
      useBookmarkStore.getState().selectGroup(groupId, subId)
    },
    []
  )

  // ---- scroll-spy：列表 / 网格视图滚动时按视口位置反向高亮侧栏分组 ----
  useEffect(() => {
    if ((view !== 'list' && view !== 'grid') || screen === 'trash') return
    const root = contentRef.current
    if (!root) return
    let raf = 0
    const onScroll = () => {
      if (isAnchorScrollingRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const secs = Array.from(root.querySelectorAll<HTMLElement>('[data-sec-id]'))
        if (!secs.length) return
        const rootTop = root.getBoundingClientRect().top
        let current = secs[0]
        // 滚到底时直接取最后一段（短尾段永远到不了顶部阈值）
        if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
          current = secs[secs.length - 1]
        } else {
          for (const sec of secs) {
            if (sec.getBoundingClientRect().top - rootTop <= root.clientHeight / 3) current = sec
            else break
          }
        }
        const subId = current.dataset.subId
        if (subId) setActiveSubId((prev) => (prev === subId ? prev : subId))
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      root.removeEventListener('scroll', onScroll)
    }
  }, [view, screen])

  return { handleActiveSubIdFix }
}
