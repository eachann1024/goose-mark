import type * as React from 'react'
import { useCallback, useRef } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { HOME_CONTINUITY_KEY, type HomeContinuityState, type GroupPanelState, type GroupPanelMap, sanitizeScrollTop, readGroupPanelMap, writeGroupPanelMap, readHomeScrollTop, writeHomeScrollTop } from './homeContinuity'
import { type HomeNavigationBindings } from './homeInteractionTypes'

export function useHomePanelPersistence({
  initialContinuityRef,
  activeSubId,
  selectedId,
  activeGroupId,
  isSearchingRef,
  contentRef
}: Pick<HomeNavigationBindings, 'activeSubId' | 'selectedId' | 'activeGroupId'> & {
  initialContinuityRef: React.RefObject<HomeContinuityState | null>
  isSearchingRef: React.RefObject<boolean>
  contentRef: React.RefObject<HTMLDivElement | null>
}) {
  // 滚动默认持久化：按一级分组分别记住；兼容旧的全局 scroll key / 连贯快照
  const groupPanelMapRef = useRef<GroupPanelMap>(readGroupPanelMap())
  const homeScrollTopRef = useRef(
    readHomeScrollTop(initialContinuityRef.current?.activeGroupId || useBookmarkStore.getState().activeGroupId)
    || initialContinuityRef.current?.scrollTop
    || 0
  )
  const homeContinuityLatestRef = useRef({
    activeSubId,
    selectedId,
    activeGroupId
  })
  homeContinuityLatestRef.current = { activeSubId, selectedId, activeGroupId }

  // 分组面板状态：内存优先，落盘防抖。切组时绝不同步连写 uTools db（会卡死）。
  const groupPanelFlushTimerRef = useRef<number | undefined>(undefined)
  const groupPanelDirtyRef = useRef(false)
  const restoreScrollTokenRef = useRef(0)

  const flushGroupPanelMap = useCallback((alsoScrollKey = true) => {
    if (groupPanelFlushTimerRef.current != null) {
      window.clearTimeout(groupPanelFlushTimerRef.current)
      groupPanelFlushTimerRef.current = undefined
    }
    const dirty = groupPanelDirtyRef.current
    if (!dirty && !alsoScrollKey) return
    groupPanelDirtyRef.current = false
    try {
      if (dirty) writeGroupPanelMap(groupPanelMapRef.current)
      if (alsoScrollKey) {
        const gid = homeContinuityLatestRef.current.activeGroupId || useBookmarkStore.getState().activeGroupId
        const top = gid
          ? (groupPanelMapRef.current[gid]?.scrollTop ?? homeScrollTopRef.current)
          : homeScrollTopRef.current
        writeHomeScrollTop(top)
      }
    } catch {
      // 持久化失败不阻塞 UI
    }
  }, [])

  const scheduleFlushGroupPanelMap = useCallback(() => {
    groupPanelDirtyRef.current = true
    if (groupPanelFlushTimerRef.current != null) return
    groupPanelFlushTimerRef.current = window.setTimeout(() => {
      groupPanelFlushTimerRef.current = undefined
      flushGroupPanelMap(true)
    }, 400)
  }, [flushGroupPanelMap])

  const updateGroupPanelMemory = useCallback((
    groupId: string | null | undefined,
    patch: Partial<GroupPanelState>
  ) => {
    if (!groupId) return
    const prev = groupPanelMapRef.current[groupId] || {
      scrollTop: 0,
      activeSubId: null,
      selectedId: null,
    }
    const next: GroupPanelState = {
      scrollTop: patch.scrollTop !== undefined ? sanitizeScrollTop(patch.scrollTop) : prev.scrollTop,
      activeSubId: patch.activeSubId !== undefined ? patch.activeSubId : prev.activeSubId,
      selectedId: patch.selectedId !== undefined ? patch.selectedId : prev.selectedId,
    }
    if (
      next.scrollTop === prev.scrollTop &&
      next.activeSubId === prev.activeSubId &&
      next.selectedId === prev.selectedId &&
      groupPanelMapRef.current[groupId]
    ) {
      return
    }
    groupPanelMapRef.current = { ...groupPanelMapRef.current, [groupId]: next }
    if (patch.scrollTop !== undefined) homeScrollTopRef.current = next.scrollTop
    scheduleFlushGroupPanelMap()
  }, [scheduleFlushGroupPanelMap])

  const captureCurrentGroupPanel = useCallback((forceGroupId?: string | null) => {
    const groupId = forceGroupId || homeContinuityLatestRef.current.activeGroupId || useBookmarkStore.getState().activeGroupId
    if (!groupId) return
    // 只有内容面板仍挂着该分组时，才信任 DOM scrollTop
    if (!isSearchingRef.current) {
      const root = contentRef.current
      const panelGroupId = root?.dataset.groupId || ''
      if (root && (!panelGroupId || panelGroupId === groupId)) {
        homeScrollTopRef.current = root.scrollTop
      }
    }
    updateGroupPanelMemory(groupId, {
      scrollTop: homeScrollTopRef.current,
      activeSubId: homeContinuityLatestRef.current.activeSubId,
      selectedId: homeContinuityLatestRef.current.selectedId,
    })
  }, [updateGroupPanelMemory])

  const saveHomeContinuity = useCallback(() => {
    flushGroupPanelMap(true)
    if (!useSettingsStore.getState().panelContinuous) {
      utoolsStorage.removeItem(HOME_CONTINUITY_KEY)
      return
    }

    const latest = homeContinuityLatestRef.current
    const store = useBookmarkStore.getState()
    const gid = latest.activeGroupId || store.activeGroupId
    const scrollTop = gid
      ? (groupPanelMapRef.current[gid]?.scrollTop ?? homeScrollTopRef.current)
      : homeScrollTopRef.current
    const payload: HomeContinuityState = {
      activeGroupId: gid,
      activeSubId: latest.activeSubId || store.activeSubGroupId || null,
      selectedId: latest.selectedId,
      scrollTop,
      updatedAt: Date.now()
    }
    try {
      utoolsStorage.setItem(HOME_CONTINUITY_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }, [flushGroupPanelMap])

  return { groupPanelMapRef, homeScrollTopRef, homeContinuityLatestRef, groupPanelFlushTimerRef, groupPanelDirtyRef, restoreScrollTokenRef, scheduleFlushGroupPanelMap, updateGroupPanelMemory, captureCurrentGroupPanel, saveHomeContinuity }
}
