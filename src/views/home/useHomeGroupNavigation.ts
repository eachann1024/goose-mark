import type * as React from 'react'
import { useCallback } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { type HomeGroup } from './viewModel'
import { type CtxMode, type CtxState } from './homeTypes'
import { sanitizeScrollTop } from './homeContinuity'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeGroupNavigation({
  setCtx,
  setCtxMode,
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
  updateGroupPanelMemory,
  setActiveGroup
}: Pick<HomeNavigationBindings, 'screen' | 'setScreen' | 'view' | 'activeGroupId' | 'setActiveSubId' | 'setSelectedId'> &
  Pick<HomeScrollBindings, 'smoothRafRef' | 'suppressScrollIntoViewRef' | 'isAnchorScrollingRef' | 'captureCurrentGroupPanel' | 'restoreHomeScrollRef' | 'anchorScrollTimer' | 'anchorRaf' | 'groupPanelMapRef' | 'homeScrollTopRef' | 'updateGroupPanelMemory'> & {
  setCtx: React.Dispatch<React.SetStateAction<CtxState>>
  setCtxMode: React.Dispatch<React.SetStateAction<CtxMode>>
  homeGroups: HomeGroup[]
  setActiveGroup: (groupId: string) => void
}) {

  // ---- 一级分组 Tab：切换当前分组（同步 store；按分组恢复滚动/选中，不共用一个位置）----
  const changeActiveGroup = useCallback((groupId: string) => {
    setCtx((c) => (c.open ? { ...c, open: false } : c))
    setCtxMode('menu')
    if (screen === 'trash' || screen === 'settings') setScreen(view)

    const prevGroupId = activeGroupId || useBookmarkStore.getState().activeGroupId

    if (prevGroupId === groupId) {
      // 点当前 Tab：回到该组顶部（明确意图）
      if (smoothRafRef.current != null) {
        cancelAnimationFrame(smoothRafRef.current)
        smoothRafRef.current = null
      }
      suppressScrollIntoViewRef.current = true
      isAnchorScrollingRef.current = true
      captureCurrentGroupPanel(prevGroupId)
      restoreHomeScrollRef.current('top', groupId)
      window.setTimeout(() => { isAnchorScrollingRef.current = false }, 80)
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
    if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
    cancelAnimationFrame(anchorRaf.current)

    const nextGroup = homeGroups.find((g) => g.id === groupId)
    const saved = groupPanelMapRef.current[groupId]
    const nextSub =
      (saved?.activeSubId && nextGroup?.subs.find((s) => s.id === saved.activeSubId)) ||
      nextGroup?.subs[0]
    const nextSelected =
      (saved?.selectedId &&
        nextGroup?.subs.some((s) => s.items.some((item) => item.id === saved.selectedId)) &&
        saved.selectedId) ||
      nextSub?.items[0]?.id ||
      null

    if (nextSub) setActiveSubId(nextSub.id)
    if (nextSelected) setSelectedId(nextSelected)

    homeScrollTopRef.current = sanitizeScrollTop(saved?.scrollTop)
    // 只写内存，不在切组路径同步落盘
    updateGroupPanelMemory(groupId, {
      scrollTop: homeScrollTopRef.current,
      activeSubId: nextSub?.id ?? null,
      selectedId: nextSelected,
    })
    setActiveGroup(groupId)
    // activeGroupId effect 会 restore；这里不重复狂刷
    window.setTimeout(() => {
      isAnchorScrollingRef.current = false
    }, 120)
  }, [screen, view, setActiveGroup, homeGroups, activeGroupId, captureCurrentGroupPanel, updateGroupPanelMemory])

  return { changeActiveGroup }
}
