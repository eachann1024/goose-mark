import type * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { UTOOLS_PLUGIN_OUT_EVENT } from './homeRuntime'
import { HOME_CONTINUITY_KEY, readHomeScrollTop } from './homeContinuity'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomePanelRestoration({
  homeContinuityLatestRef,
  homeScrollTopRef,
  groupPanelMapRef,
  groupPanelDirtyRef,
  scheduleFlushGroupPanelMap,
  restoreScrollTokenRef,
  contentRef,
  panelContinuous,
  saveHomeContinuity,
  activeGroupId,
  activeSubId,
  selectedId,
  captureCurrentGroupPanel,
  groupPanelFlushTimerRef,
  screen,
  isSearching,
  isAnchorScrollingRef,
  updateGroupPanelMemory,
  view
}: Pick<HomeNavigationBindings, 'activeGroupId' | 'activeSubId' | 'selectedId' | 'screen' | 'view'> &
  Pick<HomeScrollBindings, 'homeScrollTopRef' | 'groupPanelMapRef' | 'contentRef' | 'captureCurrentGroupPanel' | 'isAnchorScrollingRef' | 'updateGroupPanelMemory'> & {
  homeContinuityLatestRef: React.RefObject<{ activeSubId: string | null; selectedId: string | null; activeGroupId: string; }>
  groupPanelDirtyRef: React.RefObject<boolean>
  scheduleFlushGroupPanelMap: () => void
  restoreScrollTokenRef: React.RefObject<number>
  panelContinuous: boolean
  saveHomeContinuity: () => void
  groupPanelFlushTimerRef: React.RefObject<number | undefined>
  isSearching: boolean
}) {

  /**
   * 把主列表滚回记录位置（或顶部）。
   * 多次重试：uTools 再次唤出时会 setExpendHeight，布局晚一拍，单次 rAF 写 scrollTop 常被冲掉。
   */
  const restoreHomeScroll = useCallback((mode: 'keep' | 'top', groupId?: string | null) => {
    const gid = groupId ?? (homeContinuityLatestRef.current.activeGroupId || useBookmarkStore.getState().activeGroupId)
    if (mode === 'top') {
      homeScrollTopRef.current = 0
      if (gid) {
        const prev = groupPanelMapRef.current[gid] || { scrollTop: 0, activeSubId: null, selectedId: null }
        if (prev.scrollTop !== 0 || !groupPanelMapRef.current[gid]) {
          groupPanelMapRef.current = { ...groupPanelMapRef.current, [gid]: { ...prev, scrollTop: 0 } }
          groupPanelDirtyRef.current = true
          scheduleFlushGroupPanelMap()
        }
      }
    } else if (gid) {
      const mapped = groupPanelMapRef.current[gid]?.scrollTop
      homeScrollTopRef.current = typeof mapped === 'number' ? mapped : readHomeScrollTop(gid)
    } else if (homeScrollTopRef.current <= 0) {
      homeScrollTopRef.current = readHomeScrollTop()
    }

    const target = mode === 'top' ? 0 : homeScrollTopRef.current
    const token = ++restoreScrollTokenRef.current
    const apply = () => {
      if (token !== restoreScrollTokenRef.current) return true
      const root = contentRef.current
      if (!root) return false
      // 面板已切到别的分组时不要误写
      if (gid && root.dataset.groupId && root.dataset.groupId !== gid) return false
      if (Math.abs(root.scrollTop - target) > 1) root.scrollTop = target
      return Math.abs(root.scrollTop - target) < 2 || root.scrollHeight <= root.clientHeight + 1
    }
    // 轻量重试：布局晚一拍时再钉，避免连写 storage
    requestAnimationFrame(() => {
      if (apply()) return
      requestAnimationFrame(() => {
        if (apply()) return
        window.setTimeout(apply, 50)
      })
    })
  }, [scheduleFlushGroupPanelMap])
  const restoreHomeScrollRef = useRef(restoreHomeScroll)
  restoreHomeScrollRef.current = restoreHomeScroll

  useEffect(() => {
    if (!panelContinuous) utoolsStorage.removeItem(HOME_CONTINUITY_KEY)
  }, [panelContinuous])

  useEffect(() => {
    if (!panelContinuous) return
    const timer = window.setTimeout(saveHomeContinuity, 250)
    return () => window.clearTimeout(timer)
  }, [activeGroupId, activeSubId, panelContinuous, saveHomeContinuity, selectedId])

  useEffect(() => {
    const captureScroll = () => {
      // 退出前尽量读一次当前主列表滚动（搜索面板时 contentRef 不是主列表，沿用 ref 旧值）
      captureCurrentGroupPanel()
      saveHomeContinuity()
    }
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') captureScroll()
    }
    // 退出时只持久化滚动/位置，不清搜索（清搜索会换 content 节点把滚动顶掉）
    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, captureScroll)
    window.addEventListener('pagehide', captureScroll)
    window.addEventListener('beforeunload', captureScroll)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      captureScroll()
      if (groupPanelFlushTimerRef.current != null) {
        window.clearTimeout(groupPanelFlushTimerRef.current)
        groupPanelFlushTimerRef.current = undefined
      }
      window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, captureScroll)
      window.removeEventListener('pagehide', captureScroll)
      window.removeEventListener('beforeunload', captureScroll)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  }, [saveHomeContinuity, captureCurrentGroupPanel])

  // 主列表滚动：按当前分组即时记入内存 map；落盘防抖。
  // cleanup 绝不能再读 root.scrollTop——切组后 DOM 内容已换，scrollTop 常被浏览器清 0。
  useEffect(() => {
    if (screen !== 'list' && screen !== 'grid') return
    if (isSearching) return
    const root = contentRef.current
    if (!root) return
    const groupIdForEffect = activeGroupId || useBookmarkStore.getState().activeGroupId
    if (!groupIdForEffect) return

    const mapped = groupPanelMapRef.current[groupIdForEffect]?.scrollTop
    if (typeof mapped === 'number') homeScrollTopRef.current = mapped
    if (Math.abs(root.scrollTop - homeScrollTopRef.current) > 1) {
      root.scrollTop = homeScrollTopRef.current
    }

    const onScroll = () => {
      if ((root.dataset.groupId || '') && root.dataset.groupId !== groupIdForEffect) return
      if (isAnchorScrollingRef.current) return
      const top = root.scrollTop
      homeScrollTopRef.current = top
      updateGroupPanelMemory(groupIdForEffect, {
        scrollTop: top,
        activeSubId: homeContinuityLatestRef.current.activeSubId,
        selectedId: homeContinuityLatestRef.current.selectedId,
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
    }
  }, [updateGroupPanelMemory, screen, isSearching, activeGroupId])

  // 切组后布局完成再钉一次目标分组滚动（轻量重试）
  useEffect(() => {
    if (screen !== 'list' && screen !== 'grid') return
    if (isSearching) return
    if (!activeGroupId) return
    restoreHomeScrollRef.current('keep', activeGroupId)
  }, [activeGroupId, screen, isSearching, view])

  return { restoreHomeScrollRef }
}
