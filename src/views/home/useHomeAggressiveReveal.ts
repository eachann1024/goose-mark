import type * as React from 'react'
import { useCallback } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { type AggressiveAiSaveResult } from '@/services/aggressiveAiSave'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeAggressiveReveal({
  applySearchVal,
  setScreen,
  view,
  setActiveSubId,
  contentRef,
  aggressiveSaveRevealTimersRef,
  smoothRafRef,
  isAnchorScrollingRef,
  setSelectedId
}: Pick<HomeNavigationBindings, 'setScreen' | 'view' | 'setActiveSubId' | 'setSelectedId'> &
  Pick<HomeScrollBindings, 'contentRef' | 'smoothRafRef' | 'isAnchorScrollingRef'> & {
  applySearchVal: (text: string, fromSubInput?: boolean) => void
  aggressiveSaveRevealTimersRef: React.RefObject<Set<number>>
}) {

  const jumpToAggressiveSaveResult = useCallback(
    (result: AggressiveAiSaveResult) => {
      const jump = result.locations[0]
      if (!jump) return
      applySearchVal('')
      setScreen(view)
      setActiveSubId(jump.subGroupId)
      useBookmarkStore.getState().selectGroup(jump.groupId, jump.subGroupId)

      let attempts = 0
      const locateBookmark = () => {
        const root = contentRef.current
        const target = root
          ? Array.from(root.querySelectorAll<HTMLElement>('[data-item-id]')).find((item) =>
              item.dataset.itemId === result.bookmark.id &&
              item.dataset.groupId === jump.groupId &&
              item.dataset.subId === jump.subGroupId
            )
          : null

        if (!root || !target) {
          if (attempts++ < 12) {
            const timer = window.setTimeout(() => {
              aggressiveSaveRevealTimersRef.current.delete(timer)
              locateBookmark()
            }, 40)
            aggressiveSaveRevealTimersRef.current.add(timer)
          }
          return
        }

        const rootRect = root.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        const desiredTop = root.scrollTop + targetRect.top - rootRect.top - (root.clientHeight - targetRect.height) / 2
        const maxTop = Math.max(0, root.scrollHeight - root.clientHeight)
        const from = root.scrollTop
        const to = Math.max(0, Math.min(desiredTop, maxTop))
        const distance = to - from
        const duration = Math.min(1100, 720 + Math.abs(distance) * 0.12)
        const startedAt = performance.now()

        if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current)
        isAnchorScrollingRef.current = true
        const finishReveal = () => {
          smoothRafRef.current = null
          isAnchorScrollingRef.current = false
          setSelectedId(result.bookmark.id)
          target.classList.remove('is-ai-save-target')
          void target.offsetWidth
          target.classList.add('is-ai-save-target')
          const timer = window.setTimeout(() => {
            aggressiveSaveRevealTimersRef.current.delete(timer)
            target.classList.remove('is-ai-save-target')
          }, 3500)
          aggressiveSaveRevealTimersRef.current.add(timer)
        }

        if (Math.abs(distance) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          root.scrollTop = to
          finishReveal()
          return
        }

        // ease-in cubic：先慢后快，让用户能看清页面从当前位置流转到新书签。
        const step = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / duration)
          const eased = progress * progress * progress
          root.scrollTop = from + distance * eased
          if (progress < 1) smoothRafRef.current = requestAnimationFrame(step)
          else finishReveal()
        }
        smoothRafRef.current = requestAnimationFrame(step)
      }

      requestAnimationFrame(() => requestAnimationFrame(locateBookmark))
    },
    [applySearchVal, view]
  )

  return { jumpToAggressiveSaveResult }
}
