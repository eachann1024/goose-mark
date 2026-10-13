import type * as React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { type HomeGroup } from './viewModel'
import { type HomeContinuityState } from './homeContinuity'
import { type HomeNavigationBindings, type HomeScrollBindings } from './homeInteractionTypes'

export function useHomeInitialSelection({
  activeGroupId,
  homeGroups,
  activeSubGroupId,
  setActiveSubId,
  activeSubId,
  selectedId,
  setSelectedId,
  panelContinuous,
  initialContinuityRef,
  homeScrollTopRef,
  updateGroupPanelMemory,
  screen,
  isSearching,
  getRestoreHomeScrollRef
}: Pick<HomeNavigationBindings, 'activeGroupId' | 'setActiveSubId' | 'activeSubId' | 'selectedId' | 'setSelectedId' | 'screen'> &
  Pick<HomeScrollBindings, 'homeScrollTopRef' | 'updateGroupPanelMemory'> & {
  homeGroups: HomeGroup[]
  activeSubGroupId: string
  panelContinuous: boolean
  initialContinuityRef: React.RefObject<HomeContinuityState | null>
  isSearching: boolean
  getRestoreHomeScrollRef: () => React.RefObject<(mode: 'keep' | 'top', groupId?: string | null) => void>
}) {

  const activeHomeGroup = useMemo(
    () => (activeGroupId ? homeGroups.find((g) => g.id === activeGroupId) : null) ?? homeGroups[0],
    [activeGroupId, homeGroups]
  )
  const defaultActiveSub = useMemo(
    () => activeHomeGroup?.subs.find((s) => s.id === activeSubGroupId) ?? activeHomeGroup?.subs[0],
    [activeHomeGroup, activeSubGroupId]
  )
  useEffect(() => {
    if (!defaultActiveSub) return
    setActiveSubId((prev) => {
      const prevStillVisible = !!prev && !!activeHomeGroup?.subs.some((sub) => sub.id === prev)
      return prevStillVisible ? prev : defaultActiveSub.id
    })
  }, [activeHomeGroup, defaultActiveSub])
  useEffect(() => {
    const currentSub = activeHomeGroup?.subs.find((sub) => sub.id === activeSubId) ?? defaultActiveSub
    if (!selectedId && currentSub?.items[0]) setSelectedId(currentSub.items[0].id)
  }, [activeHomeGroup, activeSubId, defaultActiveSub, selectedId])

  const continuityRestoredRef = useRef(false)
  const homeScrollRestoredOnMountRef = useRef(false)
  useEffect(() => {
    if (continuityRestoredRef.current || !panelContinuous || homeGroups.length === 0) return
    continuityRestoredRef.current = true

    const saved = initialContinuityRef.current
    if (!saved) return

    const savedGroup = homeGroups.find((group) => group.id === saved.activeGroupId)
    const savedSub = savedGroup?.subs.find((sub) => sub.id === saved.activeSubId)
    if (savedGroup && savedSub) {
      useBookmarkStore.getState().selectGroup(savedGroup.id, savedSub.id)
      setActiveSubId(savedSub.id)
    }

    if (saved.selectedId && homeGroups.some((group) => group.subs.some((sub) => sub.items.some((item) => item.id === saved.selectedId)))) {
      setSelectedId(saved.selectedId)
    }

    if (Number.isFinite(saved.scrollTop) && saved.scrollTop > 0) {
      homeScrollTopRef.current = saved.scrollTop
      if (saved.activeGroupId) {
        updateGroupPanelMemory(saved.activeGroupId, {
          scrollTop: saved.scrollTop,
          activeSubId: saved.activeSubId,
          selectedId: saved.selectedId,
        })
      }
    }
  }, [homeGroups, panelContinuous, updateGroupPanelMemory])

  // 首屏主列表就绪后还原滚动（与连贯模式无关）
  useEffect(() => {
    if (homeScrollRestoredOnMountRef.current) return
    if (homeGroups.length === 0) return
    if (screen !== 'list' && screen !== 'grid') return
    if (isSearching) return
    homeScrollRestoredOnMountRef.current = true
    getRestoreHomeScrollRef().current('keep')
  }, [homeGroups.length, screen, isSearching])
}
