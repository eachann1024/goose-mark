import type * as React from 'react'
import type { Bookmark, BookmarkLocation } from '@/types/bookmark'
import type { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import type { HomeGroup, HomeItem } from './viewModel'
import { type Screen, type ViewMode, type ToastTone, type ToastAction } from './homeTypes'
import { type GroupPanelState, type GroupPanelMap } from './homeContinuity'
import type { SearchViewMode } from '@/stores/settings'

export type HomeToastHandler = (title?: string, options?: { description?: string; jump?: BookmarkLocation | null; duration?: number; tone?: ToastTone; action?: ToastAction; }) => void

export type HomeAggressivePanelOpener = (url?: string, options?: { autoStart?: boolean; clearFailure?: boolean; }) => void

export type HomePanelMemoryUpdater = (groupId: string | null | undefined, patch: Partial<GroupPanelState>) => void

export type HomePanelCapture = (forceGroupId?: string | null) => void

export type HomeScrollRestorer = (mode: 'keep' | 'top', groupId?: string | null) => void

export interface HomeNavigationBindings {
  view: ViewMode
  setScreen: React.Dispatch<React.SetStateAction<Screen>>
  screen: Screen
  selectedId: string | null
  activeSubId: string | null
  activeGroupId: string
  setActiveSubId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>
}

export interface HomeScrollBindings {
  suppressScrollIntoViewRef: React.RefObject<boolean>
  contentRef: React.RefObject<HTMLDivElement | null>
  homeScrollTopRef: React.RefObject<number>
  updateGroupPanelMemory: HomePanelMemoryUpdater
  groupPanelMapRef: React.RefObject<GroupPanelMap>
  captureCurrentGroupPanel: HomePanelCapture
  isAnchorScrollingRef: React.RefObject<boolean>
  smoothRafRef: React.RefObject<number | null>
  restoreHomeScrollRef: React.RefObject<HomeScrollRestorer>
  anchorScrollTimer: React.RefObject<ReturnType<typeof setTimeout> | null>
  anchorRaf: React.RefObject<number>
}

export interface HomeSearchBindings {
  searchVal: string
  isSearching: boolean
  clearSearch: () => void
  focusSearchInput: () => void
  searchViewMode: SearchViewMode
  applySearchValRef: React.RefObject<(text: string, fromSubInput?: boolean) => void>
  applySearchVal: (text: string, fromSubInput?: boolean) => void
}

export interface HomeBookmarkBindings {
  homeGroups: HomeGroup[]
  bookmarks: Bookmark[]
  openBookmarkLink: ReturnType<typeof useBookmarkOperations>['openBookmarkLink']
  fireToast: HomeToastHandler
  setFormEditItem: React.Dispatch<React.SetStateAction<HomeItem | null>>
  setFormKey: React.Dispatch<React.SetStateAction<number>>
  openHomeItem: (item: HomeItem) => void
}
