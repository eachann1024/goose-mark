import type * as React from 'react'
import { useCallback } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { getHomeGroupIndex, type HomeGroup } from './viewModel'
import { type CtxState } from './homeTypes'
import { sanitizeScrollTop } from './homeContinuity'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeGroupNavigation({
  setCtx,
  screen,
  setScreen,
  view,
  activeGroupId,
  smoothRafRef,
  suppressScrollIntoViewRef,
  isAnchorScrollingRef,
  captureCurrentGroupPanel,
  restoreHomeScrollRef,
  anchorScrollTimer,
  anchorRaf,
  homeGroups,
  groupPanelMapRef,
  setActiveSubId,
  setSelectedId,
  homeScrollTopRef,
  updateGroupPanelMemory
}: Pick<HomeNavigationBindings, 'screen' | 'setScreen' | 'view' | 'activeGroupId' | 'setActiveSubId' | 'setSelectedId'> &
  Pick<HomeScrollBindings, 'smoothRafRef' | 'suppressScrollIntoViewRef' | 'isAnchorScrollingRef' | 'captureCurrentGroupPanel' | 'restoreHomeScrollRef' | 'anchorScrollTimer' | 'anchorRaf' | 'groupPanelMapRef' | 'homeScrollTopRef' | 'updateGroupPanelMemory'> & {
  setCtx: React.Dispatch<React.SetStateAction<CtxState>>
  homeGroups: HomeGroup[]
  setActiveGroup: (groupId: string) => void
}) {

  // ---- 一级分组 Tab：切换当前分组（同步 store；按分组恢复滚动/选中，不共用一个位置）----
  const changeActiveGroup = useCallback((groupId: string) => {
    const nextGroup = homeGroups.find((g) => g.id === groupId)
    if (!nextGroup || !useBookmarkStore.getState().groups.some((g) => g.id === groupId && !g.isDeleted)) return
    setCtx((c) => (c.open ? { ...c, open: false } : c))
    if (screen === 'trash' || screen === 'settings') setScreen(view)

    const prevGroupId = useBookmarkStore.getState().activeGroupId || activeGroupId
    if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
    cancelAnimationFrame(anchorRaf.current)

    if (prevGroupId === groupId) {
      // 点当前 Tab：回到该组顶部（明确意图）
      if (smoothRafRef.current != null) {
        cancelAnimationFrame(smoothRafRef.current)
        smoothRafRef.current = null
      }
      suppressScrollIntoViewRef.current = true
      isAnchorScrollingRef.current = true
      captureCurrentGroupPanel(prevGroupId)
      const firstSubId = nextGroup.subs[0]?.id ?? null
      setActiveSubId(firstSubId)
      useBookmarkStore.getState().selectGroup(groupId, firstSubId ?? undefined)
      updateGroupPanelMemory(groupId, { activeSubId: firstSubId })
      restoreHomeScrollRef.current('top', groupId)
      anchorScrollTimer.current = setTimeout(() => { isAnchorScrollingRef.current = false }, 80)
      return
    }

    // 先把当前分组位置写入内存 map（此时 DOM 仍是旧分组内容）
    if (prevGroupId) captureCurrentGroupPanel(prevGroupId)

    if (smoothRafRef.current != null) {
      cancelAnimationFrame(smoothRafRef.current)
      smoothRafRef.current = null
    }
    suppressScrollIntoViewRef.current = true
    isAnchorScrollingRef.current = true
    const saved = groupPanelMapRef.current[groupId]
    const savedSubValid = !saved?.activeSubId || nextGroup.subs.some((s) => s.id === saved.activeSubId)
    const nextSub =
      (saved?.activeSubId && nextGroup?.subs.find((s) => s.id === saved.activeSubId)) ||
      nextGroup?.subs[0]
    const nextSelected =
      (saved?.selectedId &&
        getHomeGroupIndex(nextGroup).byItemId.has(saved.selectedId) &&
        saved.selectedId) ||
      nextSub?.items[0]?.id ||
      null

    setActiveSubId(nextSub?.id ?? null)
    setSelectedId(nextSelected)

    homeScrollTopRef.current = savedSubValid ? sanitizeScrollTop(saved?.scrollTop) : 0
    // 只写内存，不在切组路径同步落盘
    updateGroupPanelMemory(groupId, {
      scrollTop: homeScrollTopRef.current,
      activeSubId: nextSub?.id ?? null,
      selectedId: nextSelected,
    })
    useBookmarkStore.getState().selectGroup(groupId, nextSub?.id)
    // activeGroupId effect 会 restore；这里不重复狂刷
    anchorScrollTimer.current = setTimeout(() => {
      isAnchorScrollingRef.current = false
    }, 120)
  }, [screen, view, setScreen, homeGroups, activeGroupId, captureCurrentGroupPanel, updateGroupPanelMemory])

  return { changeActiveGroup }
}
