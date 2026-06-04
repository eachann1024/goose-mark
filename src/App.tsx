import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { Bookmark, Group, SubGroup } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { useAppState } from '@/hooks/useAppState'
import { useUIManager } from '@/hooks/useUIManager'
import { useSync } from '@/hooks/useSync'
import { useAI } from '@/hooks/useAI'
import { useContextMenu } from '@/hooks/useContextMenu'
import { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import { useBookmarkForm } from '@/hooks/useBookmarkForm'
import { useUTools } from '@/hooks/useUTools'
import { useUToolsSubInputController } from '@/hooks/useUToolsSubInputController'
import { useLocalDataMirror } from '@/hooks/useLocalDataMirror'
import { useFeatureNoticeCenter } from '@/hooks/useFeatureNoticeCenter'
import { useCategoryEditor } from '@/hooks/useCategoryEditor'
import { useSearch } from '@/hooks/useSearch'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useUToolsMcpBridge } from '@/hooks/useUToolsMcpBridge'
import { parseHtmlBookmarks, isHtmlBookmarkFile } from '@/lib/htmlBookmarkParser'
import { resolveBookmarkLaunchUrl } from '@/lib/utils'
import { fetchPageMeta } from '@/services/iconCache'
import { parseJsonImportText, applyImportDataToStore } from '@/hooks/useImportExport'
import { createBookmarkStoreAdapter } from '@/views/settings/_bookmarkActions'
import { getAccentPreset } from '@/constants/accent'

import OnboardingBanner from '@/components/OnboardingBanner'
import QuickSaveDialog from '@/components/QuickSaveDialog'
import StarryBackground from '@/components/StarryBackground'
import TemplateSearch from '@/components/TemplateSearch'
import ContextMenu, { type ContextMenuAction } from '@/components/ContextMenu'
import ResultToast from '@/components/ResultToast'
import FeatureNoticeCenter from '@/components/FeatureNoticeCenter'
import MirrorDirectoryDecisionDialog from '@/components/MirrorDirectoryDecisionDialog'
import AppSidebar from '@/components/AppSidebar'
import BookmarksList from '@/components/bookmarks/BookmarksList'
import BookmarksGrid from '@/components/bookmarks/BookmarksGrid'
import BookmarkPreview from '@/components/bookmarks/BookmarkPreview'
import BookmarkFormDialog from '@/components/bookmarks/BookmarkFormDialog'
import SearchOverlay, { type SearchOverlayHandle } from '@/components/bookmarks/SearchOverlay'
import BookmarkListHeader, { type ListSort, type TagFilterOption } from '@/components/bookmarks/BookmarkListHeader'
import SettingsLayout from '@/views/settings/SettingsLayout'

/**
 * App 主壳（React 版，等价旧版 App.vue 2116 行的布局/状态编排/事件逻辑）
 * --------------------------------------------------------------------------
 * 职责：三栏布局（AppSidebar 分组导航 + 书签列表/网格 + BookmarkPreview 详情）
 * + 顶部工具栏（搜索/视图切换/新建/设置/明暗）+ 命令面板键盘导航 + Toast
 * + 模板搜索 + uTools subInput 控制 + 插件进入/退出事件 + IntersectionObserver
 * active-section + 本地镜像同步 + 快速保存。
 *
 * 全部 trackEvent 上报已移除（仅保留 statsStore 本地业务统计）。uTools 契约不变。
 */

const UTOOLS_PLUGIN_ENTER_EVENT = 'goose-marks:plugin-enter'
const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
const UTOOLS_SEARCH_INPUT_EVENT = 'goose-marks:utools-search'
const UTOOLS_SEARCH_SYNC_EVENT = 'goose-marks:utools-search-sync'
const UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT = 'goose-marks:restore-default-search-input'
const SCROLL_POS_KEY = 'goose-marks:scroll-position'
const RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS = 1000
const UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE = /^[\s/|:：\-—–]+/

type SettingsTab = 'general' | 'list' | 'card' | 'ai' | 'categories' | 'data' | 'local-mode' | 'about'
type ViewMode = 'list' | 'grid' | 'cards'

type PendingMirrorDecision = {
  directoryPath: string
  filePath: string
  canRead: boolean
}

type UToolsPluginEnterPayload = {
  code?: unknown
  payload?: unknown
  from?: unknown
  type?: unknown
}

type UniversalBookmarkMatch = {
  bookmark: Bookmark
  query: string
  exact: boolean
}

const isValidUrl = (text: string): boolean => {
  if (!text || text.trim().length === 0) return false
  try {
    let urlStr = text.trim()
    if (!urlStr.match(/^https?:\/\//i)) urlStr = `https://${urlStr}`
    const url = new URL(urlStr)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const getLatestUpdatedAt = (data: { groups?: Group[]; bookmarks?: Bookmark[] }) => {
  let max = 0
  const groups = data.groups || []
  const bookmarks = data.bookmarks || []
  groups.forEach((group) => {
    max = Math.max(max, group.updatedAt || group.createdAt || 0)
    group.children?.forEach((sub: SubGroup) => {
      max = Math.max(max, sub.updatedAt || sub.createdAt || 0)
    })
  })
  bookmarks.forEach((bookmark) => {
    max = Math.max(max, bookmark.updatedAt || bookmark.createdAt || 0)
  })
  return max
}

const getUToolsPluginEnterParams = (input: unknown): UToolsPluginEnterPayload => {
  if (!input || typeof input !== 'object') return {}
  const detail = input as UToolsPluginEnterPayload & { params?: unknown }
  if (detail.params && typeof detail.params === 'object') {
    return detail.params as UToolsPluginEnterPayload
  }
  return detail
}

function App() {
  // ---- Stores ----
  const groups = useBookmarkStore((s) => s.groups)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const storeSearch = useBookmarkStore((s) => s.search)
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const activeSubGroupId = useBookmarkStore((s) => s.activeSubGroupId)
  const activeView = useBookmarkStore((s) => s.activeView)

  const settings = useSettingsStore()
  const recordUse = useStatsStore((s) => s.recordUse)

  // ---- UI manager ----
  const toastState = useUIManager((s) => s.toastState)
  const closeToast = useUIManager((s) => s.closeToast)
  const showToast = useUIManager((s) => s.showToast)
  const onMainViewSwitch = useUIManager((s) => s.onMainViewSwitch)

  // ---- App state ----
  const { tab, setTab, isDark, toggleDark, isUTools, isMac } = useAppState()

  // useSync 订阅（保留 isSyncing/syncError 以维持同步生命周期，不直接渲染）
  useSync((s) => s.isSyncing)

  const { generateMetadata, checkAiAvailable, aiError } = useAI()
  const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu()
  const {
    openBookmarkLink: originalOpenBookmarkLink,
    openUrl,
    openUrlInUtoolsBrowser,
    copyBookmarkUrl,
    copyBookmarkDescription,
    handleRemove,
    emptyTrash,
    handleReorder,
    getTemplateLabel
  } = useBookmarkOperations()

  const { showAdd, openAdd, openEdit, set: setForm } = useBookmarkForm()

  const { AI_QUICK_SAVE_FEATURE_CODE, syncFeatures, getEnterText, isDetachedWindowNow, FEATURE_PREFIX, setExpendHeight } =
    useUTools()

  const {
    canUseLocalMirror,
    canPickMirrorDirectory,
    pickMirrorDirectory,
    inspectMirrorDirectory,
    activateMirrorDirectory,
    hydrateMirrorDirectoryForDevice,
    shouldPromptMirrorDirectorySelection
  } = useLocalDataMirror()

  const activeFeatureNotice = useFeatureNoticeCenter((s) => s.activeNotice())
  const isLocalModeIntroPending = useFeatureNoticeCenter((s) => s.isLocalModeIntroPending())
  const ensureLocalModeIntroNotice = useFeatureNoticeCenter((s) => s.ensureLocalModeIntroNotice)
  const ensureLocalModeDevicePathNotice = useFeatureNoticeCenter((s) => s.ensureLocalModeDevicePathNotice)
  const markLocalModeIntroViewed = useFeatureNoticeCenter((s) => s.markLocalModeIntroViewed)
  const markLocalModeIntroIgnored = useFeatureNoticeCenter((s) => s.markLocalModeIntroIgnored)
  const markDevicePathConfigured = useFeatureNoticeCenter((s) => s.markDevicePathConfigured)
  const markDevicePathIgnored = useFeatureNoticeCenter((s) => s.markDevicePathIgnored)
  const markLocalModeSettingsVisited = useFeatureNoticeCenter((s) => s.markLocalModeSettingsVisited)

  const openCategoryEditor = useCategoryEditor((s) => s.openCategoryEditor)

  // uTools MCP 工具桥接：让 plugin.json 声明的工具能从 React 端读写书签数据
  useUToolsMcpBridge()

  // ---- Local UI state ----
  const [settingsActiveTab, setSettingsActiveTab] = useState<SettingsTab>('general')
  const [showMirrorDecisionDialog, setShowMirrorDecisionDialog] = useState(false)
  const [mirrorDecisionLoading, setMirrorDecisionLoading] = useState(false)
  const [pendingMirrorDecision, setPendingMirrorDecision] = useState<PendingMirrorDecision | null>(null)

  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [viewMode, setViewMode] = useState<ViewMode>(settings.homeViewMode)
  // 标签筛选（会话级，不持久化）：选中的 tag 作为「任一匹配 OR」过滤条件，叠加在当前视图列表上
  const [tagFilter, setTagFilter] = useState<string[]>([])
  // 列表面板排序：持久化到 settings.listSort，默认「最近使用」，仅作用于虚拟视图的扁平列表。
  const listSort = settings.listSort as ListSort
  const setListSort = useCallback((value: ListSort) => useSettingsStore.getState().setListSort(value), [])
  const [isLoading, setIsLoading] = useState(true)
  const [activeAnchorId, setActiveAnchorId] = useState('')
  const [highlightedBookmarkId, setHighlightedBookmarkId] = useState<string | null>(null)
  const [showQuickSaveDialog, setShowQuickSaveDialog] = useState(false)
  const [activeTemplateBookmark, setActiveTemplateBookmark] = useState<Bookmark | null>(null)
  const [templateQuery, setTemplateQuery] = useState('')
  const [previewPanelWidthLive, setPreviewPanelWidthLive] = useState(settings.previewPanelWidth)
  const [suppressSearchOverlay, setSuppressSearchOverlay] = useState(false)

  const previewPanelCollapsed = settings.previewPanelCollapsed

  // ---- Refs（同步读取最新值 / 不触发渲染） ----
  const isSyncPausedRef = useRef(false)
  const skipSearchCloseRefocusRef = useRef(false)
  const activeTemplateBookmarkRef = useRef<Bookmark | null>(null)
  activeTemplateBookmarkRef.current = activeTemplateBookmark
  const templateQueryRef = useRef('')
  templateQueryRef.current = templateQuery
  const suppressSearchOverlayRef = useRef(false)
  suppressSearchOverlayRef.current = suppressSearchOverlay
  const recentDynamicTemplateEnterAtRef = useRef(0)
  const lastHandledPluginEnterRef = useRef(false)

  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const sectionObserverRef = useRef<IntersectionObserver | null>(null)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchOverlayRef = useRef<SearchOverlayHandle | null>(null)
  const viewModePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- 派生值 ----
  const visibleGroups = useMemo(() => groups.filter((g) => g.id !== TRASH_GROUP_ID), [groups])
  const isTrashActive = activeGroupId === TRASH_GROUP_ID
  const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId), [groups, activeGroupId])
  const activeSubGroups = activeGroup?.children ?? []
  const shouldShowSubs = activeSubGroups.length > 1
  const currentSubGroup = useMemo(
    () => activeSubGroups.find((s) => s.id === activeSubGroupId),
    [activeSubGroups, activeSubGroupId]
  )

  // currentBookmarks（网格模式用当前子分组）
  const currentBookmarks = useMemo<Bookmark[]>(() => {
    if (!currentSubGroup) return []
    return currentSubGroup.bookmarkIds
      .map((id) => bookmarks.find((b) => b.id === id))
      .filter((b): b is Bookmark => !!b && !b.isDeleted)
  }, [currentSubGroup, bookmarks])

  // ---- uTools subInput 控制 ----
  const canUseSubInput = useCallback(() => {
    if (!isUTools) return false
    try {
      return !isDetachedWindowNow()
    } catch {
      return false
    }
  }, [isUTools, isDetachedWindowNow])

  const syncDefaultSearchInputValue = useCallback(
    (text: string) => {
      if (!canUseSubInput() || activeTemplateBookmarkRef.current) return false
      window.dispatchEvent(
        new CustomEvent(UTOOLS_SEARCH_SYNC_EVENT, { detail: { text: typeof text === 'string' ? text : '' } })
      )
      return true
    },
    [canUseSubInput]
  )

  const focusUToolsNativeInput = useCallback(() => {
    if (!isUTools) return
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        window.utools?.subInputFocus?.()
        window.setTimeout(() => window.utools?.subInputFocus?.(), 80)
        window.setTimeout(() => window.utools?.subInputFocus?.(), 220)
      })
    })
  }, [isUTools])

  const focusDefaultSearchInput = useCallback(
    (forceRemount = false) => {
      if (!canUseSubInput()) return false
      if (forceRemount) {
        if (canUseSubInput() && !activeTemplateBookmarkRef.current) {
          window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
          syncDefaultSearchInputValue(useBookmarkStore.getState().search)
        }
      }
      focusUToolsNativeInput()
      return true
    },
    [canUseSubInput, syncDefaultSearchInputValue, focusUToolsNativeInput]
  )

  const syncSearchInputText = useCallback((text: string) => {
    const nextText = typeof text === 'string' ? text : ''
    if (nextText.length > 0) setSuppressSearchOverlay(false)
    useBookmarkStore.getState().setSearch(nextText)
  }, [])

  const handleSearchSubInput = useCallback(
    ({ text }: { text: string }) => syncSearchInputText(text),
    [syncSearchInputText]
  )

  const { clearSubInput, activateTemplateSubInput } = useUToolsSubInputController({
    isUTools: () => isUTools,
    canUseSubInput,
    getDefaultValue: () => useBookmarkStore.getState().search,
    onDefaultInput: handleSearchSubInput
  })

  // ---- Search ----
  const {
    localSearchInputRef,
    searchViewOpen,
    searchValue,
    setSearchValue,
    searchResults,
    activeBookmarks,
    searchAutoExitText,
    openSearchView,
    closeSearchView
  } = useSearch(tab, setTab, selectedIndex, setSelectedIndex, {
    canUseSubInput,
    focusSubInput: focusDefaultSearchInput,
    syncSubInputValue: syncDefaultSearchInputValue,
    suppressAutoOpenOverlay: () => suppressSearchOverlayRef.current
  })

  const searchViewOpenRef = useRef(false)
  searchViewOpenRef.current = searchViewOpen

  // 虚拟视图（all/pinned/recent）的扁平列表是否启用排序：非搜索、非分组视图
  const sortApplies = !searchViewOpen && activeView !== 'group'

  // 按 listSort 排序：仅用于虚拟视图扁平列表，不改变分组视图的手动顺序
  const applyListSort = useCallback(
    (list: Bookmark[]): Bookmark[] => {
      if (!sortApplies) return list
      const sorted = [...list]
      switch (listSort) {
        case 'recent':
          sorted.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
          break
        case 'created':
          sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          break
        case 'name':
          sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN'))
          break
        case 'visits':
          sorted.sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0))
          break
      }
      return sorted
    },
    [sortApplies, listSort]
  )

  // View-aware bookmarks（过滤前）：列表用全部（按排序），网格用当前子分组
  const baseVisibleBookmarks = useMemo<Bookmark[]>(() => {
    if (viewMode === 'grid' && tab === 'bookmarks' && !searchViewOpen) return currentBookmarks
    return applyListSort(activeBookmarks)
  }, [viewMode, tab, searchViewOpen, currentBookmarks, activeBookmarks, applyListSort])

  // 当前视图（过滤前）出现过的全部 tag + 计数，去重并按计数降序、同计数按名称
  const tagOptions = useMemo<TagFilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const b of baseVisibleBookmarks) {
      for (const raw of b.tags ?? []) {
        const tag = raw.trim()
        if (!tag) continue
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hans-CN')
    )
  }, [baseVisibleBookmarks])

  // 选中的 tag 中仍存在于当前视图的部分（视图切换后自动剔除失效项），作为实际生效的过滤条件
  const effectiveTagFilter = useMemo(() => {
    if (tagFilter.length === 0) return tagFilter
    const available = new Set(tagOptions.map((o) => o.tag))
    return tagFilter.filter((t) => available.has(t))
  }, [tagFilter, tagOptions])

  // 应用 tag 过滤（任一匹配 OR），叠加在当前视图列表上 —— 复用同一 visibleBookmarks 管道
  const visibleBookmarks = useMemo<Bookmark[]>(() => {
    if (effectiveTagFilter.length === 0) return baseVisibleBookmarks
    const wanted = new Set(effectiveTagFilter)
    return baseVisibleBookmarks.filter((b) => (b.tags ?? []).some((t) => wanted.has(t.trim())))
  }, [baseVisibleBookmarks, effectiveTagFilter])
  const visibleBookmarksRef = useRef(visibleBookmarks)
  visibleBookmarksRef.current = visibleBookmarks

  const toggleTagFilter = useCallback((tag: string) => {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])
  const clearTagFilter = useCallback(() => setTagFilter([]), [])

  const selectedBookmark = useMemo(() => {
    if (selectedIndex < 0 || selectedIndex >= visibleBookmarks.length) return null
    return visibleBookmarks[selectedIndex]
  }, [selectedIndex, visibleBookmarks])

  // ---- openBookmarkLink（模板拦截）----
  const enterTemplateMode = useCallback(
    (bookmark: Bookmark) => {
      // 退出旧模板态（不恢复输入，紧接着会重挂）
      window.removeEventListener('keydown', handleTemplateKeydownRef.current)
      setActiveTemplateBookmark(bookmark)
      activeTemplateBookmarkRef.current = bookmark
      setTemplateQuery('')
      isSyncPausedRef.current = true

      if (searchViewOpenRef.current) closeSearchView({ restoreFocus: false })
      setForm({ showAdd: false })

      const label = getTemplateLabel(bookmark.url)
      const mounted = activateTemplateSubInput({
        onChange: ({ text }) => setTemplateQuery(text),
        placeholder: `搜索 ${bookmark.title}${label ? ` (${label})` : ''}，回车打开`,
        focus: true
      })
      if (!mounted && isUTools) return
      window.addEventListener('keydown', handleTemplateKeydownRef.current)
    },
    [activateTemplateSubInput, closeSearchView, getTemplateLabel, isUTools, setForm]
  )

  const openBookmarkLink = useCallback(
    (bookmark: Bookmark, options?: { source?: string; openMethod?: 'keyboard' | 'click' | 'command' | 'plugin' }) => {
      if (/{[^}]+}/.test(bookmark.url) && !options?.source?.startsWith('template')) {
        enterTemplateMode(bookmark)
        return
      }
      originalOpenBookmarkLink(bookmark, {
        useUiQuery: false,
        source: options?.source,
        openMethod: options?.openMethod ?? 'click'
      })
    },
    [enterTemplateMode, originalOpenBookmarkLink]
  )

  const exitTemplateMode = useCallback(
    (opts: { restoreInput?: boolean } = {}) => {
      window.removeEventListener('keydown', handleTemplateKeydownRef.current)
      setActiveTemplateBookmark(null)
      activeTemplateBookmarkRef.current = null
      setTemplateQuery('')
      isSyncPausedRef.current = false
      if (opts.restoreInput !== false && canUseSubInput()) {
        window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
        syncDefaultSearchInputValue(useBookmarkStore.getState().search)
      }
    },
    [canUseSubInput, syncDefaultSearchInputValue]
  )

  const executeTemplateSearch = useCallback(() => {
    const bookmark = activeTemplateBookmarkRef.current
    if (!bookmark) return
    const query = templateQueryRef.current.trim()
    if (!query) return
    let url = bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query))
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
    openUrl(url, { source: 'template_search', openMethod: 'keyboard', bookmarkId: bookmark.id, hasTemplate: true })
    if (useSettingsStore.getState().autoCloseWindow && isDetachedWindowNow()) {
      window.utools?.outPlugin()
    } else {
      window.utools?.hideMainWindow?.()
      exitTemplateMode()
    }
  }, [exitTemplateMode, isDetachedWindowNow, openUrl, showToast])

  const handleTemplateKeydownRef = useRef<(e: KeyboardEvent) => void>(() => {})
  handleTemplateKeydownRef.current = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && activeTemplateBookmarkRef.current) {
      e.preventDefault()
      executeTemplateSearch()
    }
  }

  // ---- Keyboard ----
  const { setBookmarkGridRef, showCmdHints, hintKeyById, hideCmdHints, handleLocalSearchKey } = useKeyboard({
    selectedIndex,
    setSelectedIndex,
    activeBookmarks: visibleBookmarks,
    searchViewOpen,
    isMac,
    showAdd,
    showIconSelector: false,
    showDeleteConfirm: false,
    tab,
    openBookmarkLink
  })

  // ---- 分组事件 ----
  const handleSelectGroup = useCallback(
    (groupId: string) => {
      useBookmarkStore.getState().selectGroup(groupId)
      setTab('bookmarks')
    },
    [setTab]
  )

  const openGroupEditor = useCallback(
    (groupId: string) => {
      if (!groupId || groupId === TRASH_GROUP_ID) return
      setTab('settings')
      setSettingsActiveTab('categories')
      openCategoryEditor(groupId)
    },
    [openCategoryEditor, setTab]
  )

  const openLocalModeSettings = useCallback(() => {
    setTab('settings')
    setSettingsActiveTab('local-mode')
    markLocalModeSettingsVisited()
  }, [markLocalModeSettingsVisited, setTab])

  // ---- Section observer / scroll ----
  const bookmarkSections = useMemo(() => {
    const sections: Array<{
      groupId: string
      groupName: string
      subGroupId: string
      subGroupName: string
      bookmarks: Bookmark[]
      anchorId: string
    }> = []
    const targetGroups = isTrashActive
      ? groups.filter((g) => g.id === TRASH_GROUP_ID)
      : groups.filter((g) => g.id !== TRASH_GROUP_ID)
    targetGroups.forEach((group) => {
      group.children.forEach((sub) => {
        const subBookmarks = sub.bookmarkIds
          .map((id) => bookmarks.find((b) => b.id === id))
          .filter((b): b is Bookmark => !!b && !b.isDeleted)
        if (subBookmarks.length > 0) {
          sections.push({
            groupId: group.id,
            groupName: group.name,
            subGroupId: sub.id,
            subGroupName: sub.name,
            bookmarks: subBookmarks,
            anchorId: `section-${group.id}-${sub.id}`
          })
        }
      })
    })
    return sections
  }, [groups, bookmarks, isTrashActive])

  const setupSectionObserver = useCallback(() => {
    if (sectionObserverRef.current) {
      sectionObserverRef.current.disconnect()
      sectionObserverRef.current = null
    }
    if (!contentScrollRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveAnchorId(visible[0].target.id)
      },
      { root: contentScrollRef.current, threshold: 0, rootMargin: '-10% 0px -80% 0px' }
    )
    contentScrollRef.current.querySelectorAll('[id^="section-"]').forEach((h) => observer.observe(h))
    sectionObserverRef.current = observer
  }, [])

  const scrollToSection = useCallback((anchorId: string) => {
    if (!contentScrollRef.current) return
    const el = contentScrollRef.current.querySelector(`[id="${anchorId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const debouncedSaveScroll = useCallback(() => {
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
    scrollSaveTimerRef.current = setTimeout(() => {
      if (!contentScrollRef.current) return
      try {
        localStorage.setItem(SCROLL_POS_KEY, String(contentScrollRef.current.scrollTop))
      } catch {
        // ignore
      }
    }, 200)
  }, [])

  const restoreScrollPosition = useCallback(() => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (!contentScrollRef.current) return
        try {
          const saved = localStorage.getItem(SCROLL_POS_KEY)
          if (saved) contentScrollRef.current.scrollTop = Number(saved)
        } catch {
          // ignore
        }
      })
    })
  }, [])

  // ---- 焦点 / 搜索激活 ----
  const focusMainSearchInput = useCallback(
    (forceRemount = false) => {
      if (tab !== 'bookmarks') return
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          if (canUseSubInput()) {
            if (activeTemplateBookmarkRef.current) return
            if (forceRemount) {
              window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
              syncDefaultSearchInputValue(useBookmarkStore.getState().search)
            }
            focusDefaultSearchInput()
            return
          }
          if (isUTools) focusUToolsNativeInput()
        })
      })
    },
    [tab, canUseSubInput, syncDefaultSearchInputValue, focusDefaultSearchInput, isUTools, focusUToolsNativeInput]
  )

  const activateSearchInputOnly = useCallback(
    (forceRemount = false) => {
      if (activeTemplateBookmarkRef.current) return
      setSuppressSearchOverlay(true)
      suppressSearchOverlayRef.current = true
      if (forceRemount && canUseSubInput()) focusDefaultSearchInput(true)
    },
    [canUseSubInput, focusDefaultSearchInput]
  )

  // ---- 书签交互 ----
  const handleBookmarkSelect = useCallback(
    (index: number) => {
      const bookmark = visibleBookmarksRef.current[index]
      if (!bookmark) return
      if (useSettingsStore.getState().previewPanelCollapsed) {
        openBookmarkLink(bookmark)
        return
      }
      setSelectedIndex(index)
    },
    [openBookmarkLink]
  )

  const handleContextMenuWrapper = useCallback(
    (e: React.MouseEvent, bookmark: Bookmark) => {
      e.preventDefault()
      e.stopPropagation()
      handleContextMenu(e, bookmark)
    },
    [handleContextMenu]
  )

  const handleLocate = useCallback(
    async (bookmark: Bookmark) => {
      if (bookmark.locations && bookmark.locations.length > 0) {
        const loc = bookmark.locations[0]
        if (searchViewOpenRef.current) {
          closeSearchView()
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
        const store = useBookmarkStore.getState()
        store.selectGroup(loc.groupId)
        if (loc.subGroupId) store.selectSubGroup(loc.subGroupId)
        setTab('bookmarks')
        setHighlightedBookmarkId(bookmark.id)
        setTimeout(() => setHighlightedBookmarkId(null), 4000)
      } else {
        showToast({ title: '无法定位', description: '该书签没有关联的位置信息', variant: 'error' })
      }
    },
    [closeSearchView, setTab, showToast]
  )

  const updateBookmarkDesc = useCallback((bookmark: Bookmark, desc: string) => {
    useBookmarkStore.getState().updateBookmark(bookmark.id, { desc })
  }, [])

  const handleContextMenuAction = useCallback(
    (action: ContextMenuAction) => {
      const bookmark = contextMenu.target
      if (!bookmark) return
      switch (action) {
        case 'open':
          openBookmarkLink(bookmark)
          break
        case 'openInUtoolsBrowser': {
          const url = resolveBookmarkLaunchUrl(bookmark.url)
          if (!url) return
          openUrlInUtoolsBrowser(url)
          break
        }
        case 'copy':
          copyBookmarkUrl(bookmark)
          break
        case 'copyDescription':
          copyBookmarkDescription(bookmark)
          break
        case 'edit':
          openEdit(bookmark)
          break
        case 'remove':
          handleRemove(bookmark)
          break
        case 'restore':
          if (useBookmarkStore.getState().restoreBookmarkFromTrash(bookmark.id)) {
            showToast({ title: '书签已还原', variant: 'success', duration: 1500 })
          } else {
            showToast({ title: '还原失败', variant: 'error' })
          }
          break
        default:
          break
      }
    },
    [
      contextMenu.target,
      openBookmarkLink,
      openUrlInUtoolsBrowser,
      copyBookmarkUrl,
      copyBookmarkDescription,
      openEdit,
      handleRemove,
      showToast
    ]
  )

  // ---- 导入 / 导出 ----
  const exportData = useCallback(() => {
    const store = useBookmarkStore.getState()
    const json = JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), groups: store.groups, bookmarks: store.bookmarks },
      null,
      2
    )
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `goose-marks-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast({ title: '备份已导出', description: '文件已开始下载（JSON）', variant: 'success' })
  }, [showToast])

  const handleOnboardingImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const store = useBookmarkStore.getState()
        if (isHtmlBookmarkFile(text)) {
          const result = parseHtmlBookmarks(text)
          if (result.stats.totalBookmarks === 0) {
            showToast({ title: '导入失败', description: '未在文件中找到有效书签', variant: 'error' })
            return
          }
          const now = Date.now()
          const uid = () => crypto.randomUUID()
          const nextGroups: Group[] = [...store.groups]
          const nextBookmarks: Bookmark[] = [...store.bookmarks]
          let addedGroups = 0
          let addedBookmarks = 0

          const insertGroup = (group: Group) => {
            const trashIdx = nextGroups.findIndex((g) => g.id === TRASH_GROUP_ID)
            if (trashIdx !== -1) nextGroups.splice(trashIdx, 0, group)
            else nextGroups.push(group)
          }

          const rootBookmarks = result.flatBookmarks.filter((b) => b.folderPath.length === 0)
          if (rootBookmarks.length > 0) {
            const newGroupId = uid()
            const subId = uid()
            const created: Bookmark[] = rootBookmarks.map((b) => ({
              id: uid(),
              title: b.title,
              url: b.url,
              desc: '',
              tags: [],
              createdAt: b.addDate || now,
              updatedAt: now,
              locations: [{ groupId: newGroupId, subGroupId: subId }]
            }))
            insertGroup({
              id: newGroupId,
              name: '导入书签',
              createdAt: now,
              updatedAt: now,
              children: [{ id: subId, name: '未分类', bookmarkIds: created.map((b) => b.id), createdAt: now, updatedAt: now }]
            })
            nextBookmarks.push(...created)
            addedGroups++
            addedBookmarks += created.length
          }

          result.folders.forEach((folder) => {
            const newGroupId = uid()
            const created: Bookmark[] = []
            const children: SubGroup[] = []

            if (folder.bookmarks.length > 0) {
              const subId = uid()
              folder.bookmarks.forEach((b) => {
                const bookmark: Bookmark = {
                  id: uid(),
                  title: b.title,
                  url: b.url,
                  desc: '',
                  tags: [],
                  createdAt: b.addDate || now,
                  updatedAt: now,
                  locations: [{ groupId: newGroupId, subGroupId: subId }]
                }
                created.push(bookmark)
              })
              children.push({ id: subId, name: '未分类', bookmarkIds: created.map((b) => b.id), createdAt: now, updatedAt: now })
            }

            const flattenFolder = (f: (typeof result.folders)[number], prefix: string): void => {
              const name = prefix ? `${prefix}/${f.name}` : f.name
              if (f.bookmarks.length > 0) {
                const subId = uid()
                f.bookmarks.forEach((b) => {
                  created.push({
                    id: uid(),
                    title: b.title,
                    url: b.url,
                    desc: '',
                    tags: [],
                    createdAt: b.addDate || now,
                    updatedAt: now,
                    locations: [{ groupId: newGroupId, subGroupId: subId }]
                  })
                })
                children.push({
                  id: subId,
                  name,
                  bookmarkIds: created.slice(-f.bookmarks.length).map((b) => b.id),
                  createdAt: now,
                  updatedAt: now
                })
              }
              f.children.forEach((child) => flattenFolder(child, name))
            }
            folder.children.forEach((child) => flattenFolder(child, ''))

            if (children.length === 0) {
              children.push({ id: uid(), name: '未分类', bookmarkIds: [], createdAt: now, updatedAt: now })
            }
            insertGroup({ id: newGroupId, name: folder.name, createdAt: now, updatedAt: now, children })
            nextBookmarks.push(...created)
            addedGroups++
            addedBookmarks += created.length
          })

          store.setData({ groups: nextGroups, bookmarks: nextBookmarks })
          showToast({
            title: '导入成功',
            description: `新增 ${addedGroups} 个分组、${addedBookmarks} 个书签`,
            variant: 'success'
          })
          useSettingsStore.getState().dismissOnboarding()
          void store.refreshMissingIcons()
        } else {
          const parsed = parseJsonImportText(text)
          if (!parsed.ok) {
            showToast({ title: '导入失败', description: parsed.message, variant: 'error' })
            return
          }
          const mode = parsed.source === 'goose-marks' ? 'overwrite' : 'merge'
          const { adapter, commit } = createBookmarkStoreAdapter()
          const summary = applyImportDataToStore(adapter, parsed.data, mode)
          commit()
          const skippedText = parsed.stats.skipped > 0 ? `，跳过 ${parsed.stats.skipped} 条无效数据` : ''
          if (mode === 'overwrite') {
            showToast({
              title: '导入成功',
              description: `${parsed.sourceLabel}：分组 ${summary.after.groups} / 书签 ${summary.after.bookmarks}${skippedText}`,
              variant: 'success'
            })
          } else {
            showToast({
              title: '导入成功',
              description: `${parsed.sourceLabel}：新增分组 ${summary.added.groups} / 新增书签 ${summary.added.bookmarks}${skippedText}`,
              variant: 'success'
            })
          }
          if (parsed.warnings.length > 0) console.warn('[App] Import warnings:', parsed.warnings)
          useSettingsStore.getState().dismissOnboarding()
          void store.refreshMissingIcons()
        }
      } catch (e) {
        console.error('[App] Import failed:', e)
        showToast({ title: '文件解析失败', variant: 'error' })
      }
    },
    [showToast]
  )

  // ---- 快速保存 ----
  const syncUToolsFeatures = useCallback(() => {
    syncFeatures(useBookmarkStore.getState().bookmarks, { aiQuickSaveEnabled: checkAiAvailable().available })
  }, [syncFeatures, checkAiAvailable])

  const handleQuickSave = useCallback(
    async (from: string, payload: unknown, options?: { forceAi?: boolean }) => {
      let urlToSave = ''
      let nextTitle = ''
      let nextDesc = ''
      let usedAi = false
      let saveToastTitle = ''

      if (typeof payload === 'string') urlToSave = payload
      else if (payload && typeof payload === 'object' && 'text' in payload) urlToSave = String((payload as { text: unknown }).text)

      if (!urlToSave) {
        try {
          const utoolsApi = window.utools as unknown as { readCurrentBrowserUrl?: () => Promise<string> } | undefined
          if (typeof utoolsApi?.readCurrentBrowserUrl === 'function') urlToSave = await utoolsApi.readCurrentBrowserUrl()
        } catch (e) {
          console.warn('[quick_save] 获取浏览器 URL 失败:', e)
        }
      }
      urlToSave = urlToSave.trim()

      if (urlToSave && isValidUrl(urlToSave)) {
        const meta = await fetchPageMeta(urlToSave)
        nextTitle = meta.title || ''
        nextDesc = meta.description || ''

        if (options?.forceAi) {
          const availability = checkAiAvailable()
          if (availability.available) {
            const aiResult = await generateMetadata({ url: urlToSave, title: nextTitle, desc: nextDesc })
            if (aiResult) {
              nextTitle = aiResult.title || nextTitle
              nextDesc = aiResult.desc || nextDesc
              usedAi = true
            } else if (aiError) {
              saveToastTitle = 'AI 暂时不可用，已按普通快速保存处理'
            }
          } else {
            saveToastTitle = 'AI 未就绪，已按普通快速保存处理'
          }
        }

        const bookmark = useBookmarkStore.getState().quickSaveBookmark(urlToSave, nextTitle, nextDesc)
        const isNew = bookmark.title === urlToSave
        showToast({
          title: usedAi ? '已 AI 快速保存' : saveToastTitle || (isNew ? '已保存' : '已添加到快速收集'),
          description: bookmark.title,
          variant: 'success'
        })
        window.utools?.outPlugin()
        return
      }
      console.warn('[quick_save] 无效 URL:', { payload, urlToSave, from })
      showToast({ title: '未检测到有效链接', variant: 'warning' })
    },
    [aiError, checkAiAvailable, generateMetadata, showToast]
  )

  const quickSaveBookmarkFromDialog = useCallback((url: string) => handleQuickSave('dialog', url), [handleQuickSave])

  // ---- 镜像目录决策 ----
  const closeMirrorDecisionDialog = useCallback(
    (force = false) => {
      if (mirrorDecisionLoading && !force) return
      setShowMirrorDecisionDialog(false)
      setPendingMirrorDecision(null)
    },
    [mirrorDecisionLoading]
  )

  const handleMirrorDirectoryActivation = useCallback(
    (directoryPath: string, action: 'overwrite' | 'read') => {
      const result = activateMirrorDirectory(directoryPath, action)
      if (!result.ok) {
        showToast({
          title: action === 'read' ? '读取失败' : '覆盖失败',
          description:
            action === 'read' ? '现有 snapshot.json 无法读取，请改用覆盖。' : '旧文件备份失败，未覆盖原文件。',
          variant: 'error'
        })
        return false
      }
      markDevicePathConfigured()
      showToast({
        title: action === 'read' ? '已读取现有快照' : '已设置同步文件夹',
        description: action === 'overwrite' && result.backupPath ? `已备份旧文件：${result.backupPath}` : directoryPath,
        variant: 'success'
      })
      return true
    },
    [activateMirrorDirectory, markDevicePathConfigured, showToast]
  )

  const confirmMirrorDecision = useCallback(
    (action: 'overwrite' | 'read') => {
      const pending = pendingMirrorDecision
      if (!pending) return
      setMirrorDecisionLoading(true)
      try {
        if (handleMirrorDirectoryActivation(pending.directoryPath, action)) closeMirrorDecisionDialog(true)
      } finally {
        setMirrorDecisionLoading(false)
      }
    },
    [pendingMirrorDecision, handleMirrorDirectoryActivation, closeMirrorDecisionDialog]
  )

  const refreshLocalModePathNotice = useCallback(
    (firstOpenOnly = false) => {
      const required = shouldPromptMirrorDirectorySelection()
      if (firstOpenOnly) {
        ensureLocalModeDevicePathNotice(required && isLocalModeIntroPending)
        return
      }
      ensureLocalModeDevicePathNotice(required)
    },
    [shouldPromptMirrorDirectorySelection, ensureLocalModeDevicePathNotice, isLocalModeIntroPending]
  )

  const handleFeatureNoticeView = useCallback(async () => {
    const notice = activeFeatureNotice
    if (!notice) return
    if (notice.id === 'local-mode-intro') {
      markLocalModeIntroViewed()
      openLocalModeSettings()
      return
    }
    if (!canUseLocalMirror()) {
      showToast({ title: '当前环境不支持浏览器拓展数据', variant: 'warning' })
      markDevicePathIgnored()
      return
    }
    if (!canPickMirrorDirectory()) {
      showToast({
        title: '当前环境不支持直接选择目录',
        description: '请在设置 > 浏览器拓展中手动配置路径',
        variant: 'warning'
      })
      markDevicePathIgnored()
      openLocalModeSettings()
      return
    }
    const selected = await pickMirrorDirectory()
    if (!selected) {
      markDevicePathIgnored()
      return
    }
    const inspection = inspectMirrorDirectory(selected)
    if (inspection.hasExistingFile) {
      setPendingMirrorDecision({
        directoryPath: selected,
        filePath: inspection.filePath,
        canRead: inspection.canReadExistingFile
      })
      setShowMirrorDecisionDialog(true)
      return
    }
    handleMirrorDirectoryActivation(selected, 'overwrite')
  }, [
    activeFeatureNotice,
    markLocalModeIntroViewed,
    openLocalModeSettings,
    canUseLocalMirror,
    canPickMirrorDirectory,
    pickMirrorDirectory,
    inspectMirrorDirectory,
    handleMirrorDirectoryActivation,
    markDevicePathIgnored,
    showToast
  ])

  const handleFeatureNoticeIgnore = useCallback(() => {
    const notice = activeFeatureNotice
    if (!notice) return
    if (notice.id === 'local-mode-intro') {
      markLocalModeIntroIgnored()
      return
    }
    markDevicePathIgnored()
  }, [activeFeatureNotice, markLocalModeIntroIgnored, markDevicePathIgnored])

  // ---- 预览栏 resize ----
  const startResizePreview = useCallback(
    (e: React.MouseEvent) => {
      if (previewPanelCollapsed) return
      e.preventDefault()
      const resizeStartX = e.clientX
      const resizeStartWidth = previewPanelWidthLive
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      let nextWidth = resizeStartWidth
      const onMove = (ev: MouseEvent) => {
        const delta = resizeStartX - ev.clientX
        nextWidth = Math.min(400, Math.max(200, Math.round(resizeStartWidth + delta)))
        setPreviewPanelWidthLive(nextWidth)
      }
      const onUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        useSettingsStore.getState().setPreviewPanelWidth(nextWidth)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [previewPanelCollapsed, previewPanelWidthLive]
  )

  // ==================================================================
  // 副作用区
  // ==================================================================

  // viewMode 持久化到 settings
  useEffect(() => {
    if (viewModePersistTimerRef.current) clearTimeout(viewModePersistTimerRef.current)
    viewModePersistTimerRef.current = setTimeout(() => {
      if (useSettingsStore.getState().homeViewMode !== viewMode) {
        useSettingsStore.getState().setHomeViewMode(viewMode)
      }
    }, 0)
  }, [viewMode])

  // 切换视图模式时重置选中索引
  useEffect(() => {
    setSelectedIndex(visibleBookmarksRef.current.length > 0 ? 0 : -1)
  }, [viewMode])

  // 标签过滤变化时重置选中索引，避免过滤后索引越界导致键盘导航/预览错位
  useEffect(() => {
    setSelectedIndex(visibleBookmarksRef.current.length > 0 ? 0 : -1)
  }, [effectiveTagFilter])

  // 选中分组变化：重置选中、隐藏命令提示、更新标题
  useEffect(() => {
    setSelectedIndex(visibleBookmarksRef.current.length > 0 ? 0 : -1)
    hideCmdHints()
  }, [activeGroupId, activeSubGroupId, hideCmdHints])

  // 同步预览栏宽度
  useEffect(() => {
    setPreviewPanelWidthLive(settings.previewPanelWidth)
  }, [settings.previewPanelWidth])

  // 信息密度同步到 <html data-density>
  useEffect(() => {
    document.documentElement.setAttribute('data-density', settings.density)
  }, [settings.density])

  // 自定义强调色覆盖 --primary / --ring
  useEffect(() => {
    const preset = getAccentPreset(settings.accentColor)
    const root = document.documentElement
    if (preset.id === 'coral') {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--ring')
      return
    }
    const value = isDark ? preset.dark : preset.light
    root.style.setProperty('--primary', value)
    root.style.setProperty('--ring', value)
  }, [settings.accentColor, isDark])

  // 背景类名同步
  const showStarryBackground = isDark && settings.easterEggEnabled && !settings.useSolidBackground
  useEffect(() => {
    const body = document.body
    body.classList.remove('easter-egg-active', 'solid-background', 'light-white-background', 'light-utools-background')
    if (!isDark) {
      body.classList.add(settings.lightBackgroundStyle === 'utools' ? 'light-utools-background' : 'light-white-background')
      return
    }
    if (settings.useSolidBackground) {
      body.classList.add('solid-background')
      return
    }
    if (showStarryBackground) body.classList.add('easter-egg-active')
  }, [isDark, settings.useSolidBackground, settings.lightBackgroundStyle, showStarryBackground])

  // 页面标题
  useEffect(() => {
    const baseTitle = '鹅的书签'
    const parts: string[] = []
    if (tab === 'settings') {
      parts.push('设置')
    } else if (isTrashActive) {
      parts.push('回收站')
    } else {
      if (currentSubGroup && shouldShowSubs) parts.push(currentSubGroup.name)
      if (activeGroup && activeGroup.id !== TRASH_GROUP_ID) parts.push(activeGroup.name)
    }
    document.title = parts.length > 0 ? `${parts.join(' - ')} - ${baseTitle}` : baseTitle
  }, [tab, isTrashActive, currentSubGroup, shouldShowSubs, activeGroup])

  // tab 切换协调：隐藏提示 / 关闭浮层 / 清空搜索 / 聚焦
  const prevTabRef = useRef(tab)
  useEffect(() => {
    const prevTab = prevTabRef.current
    prevTabRef.current = tab
    if (prevTab === tab) return
    hideCmdHints()
    onMainViewSwitch()
    if (tab !== 'bookmarks' && prevTab === 'bookmarks' && !searchViewOpenRef.current) {
      useBookmarkStore.getState().setSearch('')
      syncDefaultSearchInputValue('')
    }
    if (tab === 'bookmarks' && prevTab !== 'bookmarks' && !searchViewOpenRef.current) {
      focusMainSearchInput(true)
    }
  }, [tab, hideCmdHints, onMainViewSwitch, syncDefaultSearchInputValue, focusMainSearchInput])

  // store.search 变化时隐藏命令提示
  useEffect(() => {
    hideCmdHints()
  }, [storeSearch, hideCmdHints])

  // searchViewOpen 切换 → 聚焦/重挂
  const prevSearchViewOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = prevSearchViewOpenRef.current
    prevSearchViewOpenRef.current = searchViewOpen
    if (!searchViewOpen) {
      setSuppressSearchOverlay(false)
      suppressSearchOverlayRef.current = false
      if (skipSearchCloseRefocusRef.current) {
        skipSearchCloseRefocusRef.current = false
        return
      }
      if (wasOpen) focusMainSearchInput(true)
      return
    }
    if (canUseSubInput() || isUTools) {
      focusMainSearchInput(true)
      return
    }
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const overlay = searchOverlayRef.current
        if (overlay && typeof overlay.focus === 'function') overlay.focus()
      })
    })
  }, [searchViewOpen, canUseSubInput, isUTools, focusMainSearchInput])

  // 书签数据变化 → 同步 uTools 特性
  useEffect(() => {
    if (!window.utools || isSyncPausedRef.current) return
    syncUToolsFeatures()
  }, [bookmarks, syncUToolsFeatures])

  // AI 设置变化 → 同步 uTools 特性
  const aiSettingsKey = useSettingsStore((s) => `${s.aiEnabled}|${s.aiUseCustomProvider}|${s.aiSelectedModelId}`)
  useEffect(() => {
    if (!window.utools || isSyncPausedRef.current) return
    syncUToolsFeatures()
  }, [aiSettingsKey, syncUToolsFeatures])

  // section observer 跟随书签数据
  useEffect(() => {
    if (isLoading) return
    queueMicrotask(() => setupSectionObserver())
  }, [bookmarkSections, isLoading, setupSectionObserver])

  // 设置 tab 进入时高度适配（uTools）
  useEffect(() => {
    if (!isUTools) return
    try {
      setExpendHeight(tab === 'settings' ? 600 : 550)
    } catch {
      // ignore
    }
  }, [tab, isUTools, setExpendHeight])

  // ---- uTools 事件处理 ----
  const findUniversalBookmarkMatch = useCallback((payloadText: string): UniversalBookmarkMatch | null => {
    const store = useBookmarkStore.getState()
    const candidates = store.bookmarks
      .filter(
        (bookmark): bookmark is Bookmark =>
          bookmark.allowUniversal === true &&
          !store.isBookmarkInTrash(bookmark) &&
          typeof bookmark.title === 'string' &&
          !!bookmark.title.trim()
      )
      .sort((left, right) => right.title.trim().length - left.title.trim().length)
    for (const bookmark of candidates) {
      const title = bookmark.title.trim()
      if (!title) continue
      if (payloadText === title) return { bookmark, query: '', exact: true }
      if (!payloadText.startsWith(title)) continue
      const suffix = payloadText.slice(title.length)
      if (!suffix || !UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE.test(suffix)) continue
      const query = suffix.replace(UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE, '').trim()
      return { bookmark, query, exact: query.length === 0 }
    }
    return null
  }, [])

  const openResolvedUrl = useCallback(
    (url: string) => {
      showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
      openUrl(url, { source: 'plugin', openMethod: 'plugin' })
      if (useSettingsStore.getState().autoCloseWindow && isDetachedWindowNow()) {
        window.utools?.outPlugin()
        return
      }
      if (!isDetachedWindowNow()) window.utools?.hideMainWindow?.()
    },
    [showToast, openUrl, isDetachedWindowNow]
  )

  const syncTheme = useCallback(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', !!isDark)
  }, [isDark])

  const handleUToolsPluginEnterEvent = useCallback(
    (event: Event) => {
      try {
        const params = getUToolsPluginEnterParams((event as CustomEvent<UToolsPluginEnterPayload>).detail)
        const code = params?.code
        const isTemplateFeature = typeof code === 'string' && code.startsWith(FEATURE_PREFIX)
        const enterType = typeof params?.type === 'string' ? params.type : ''
        const payloadText = getEnterText(params?.payload).trim()
        if (isUTools) {
          try {
            setExpendHeight(tab === 'settings' ? 600 : 550)
          } catch {
            // ignore
          }
        }

        if (code === 'quick_save' || code === AI_QUICK_SAVE_FEATURE_CODE) {
          const from = (params as { from?: unknown })?.from || 'main'
          const payload = params?.payload
          const payloadHasUrl = (() => {
            if (typeof payload === 'string') return isValidUrl(payload.trim())
            if (payload && typeof payload === 'object' && 'text' in payload) {
              return isValidUrl(String((payload as { text: unknown }).text).trim())
            }
            return false
          })()
          if (code === 'quick_save' && !payloadHasUrl) {
            onMainViewSwitch()
            setShowQuickSaveDialog(true)
            return
          }
          handleQuickSave(String(from), payload, { forceAi: code === AI_QUICK_SAVE_FEATURE_CODE })
          return
        }

        const store = useBookmarkStore.getState()

        if (!isTemplateFeature) {
          if (code === 'bookmarks' && payloadText) {
            const match = findUniversalBookmarkMatch(payloadText)
            if (match) {
              recentDynamicTemplateEnterAtRef.current = Date.now()
              if (match.exact && /{[^}]+}/.test(match.bookmark.url)) {
                enterTemplateMode(match.bookmark)
                return
              }
              const resolvedUrl = resolveBookmarkLaunchUrl(match.bookmark.url, match.query)
              if (resolvedUrl) {
                openResolvedUrl(resolvedUrl)
                return
              }
              showToast({ title: '未检测到有效链接', variant: 'warning' })
              return
            }
          }
          if (
            code === 'bookmarks' &&
            recentDynamicTemplateEnterAtRef.current > 0 &&
            Date.now() - recentDynamicTemplateEnterAtRef.current <= RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS
          ) {
            recentDynamicTemplateEnterAtRef.current = 0
            return
          }
          onMainViewSwitch()
          setActiveTemplateBookmark(null)
          activeTemplateBookmarkRef.current = null
          syncTheme()
          syncUToolsFeatures()
          skipSearchCloseRefocusRef.current = true
          closeSearchView({ restoreFocus: false })
          store.setSearch('')
          activateSearchInputOnly()
          return
        }

        syncTheme()
        const id = (code as string).slice(FEATURE_PREFIX.length)
        const bookmark = store.bookmarks.find((b) => b.id === id)
        if (!bookmark) {
          window.utools?.outPlugin()
          return
        }
        const hasTemplate = /{[^}]+}/.test(bookmark.url)
        const isInTemplateMode = activeTemplateBookmarkRef.current?.id === id
        const payloadQuery = getEnterText(params?.payload).trim()
        const query = isInTemplateMode ? templateQueryRef.current.trim() : payloadQuery

        if (hasTemplate) {
          const shouldEnterTemplateMode =
            enterType === 'over'
              ? !payloadQuery && !isInTemplateMode
              : (!payloadQuery || payloadQuery === bookmark.title) && !isInTemplateMode
          if (shouldEnterTemplateMode) {
            recentDynamicTemplateEnterAtRef.current = Date.now()
            enterTemplateMode(bookmark)
            return
          }
        }

        let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url
        showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
        openUrl(url, { source: 'plugin', openMethod: 'plugin', bookmarkId: bookmark.id, hasTemplate })

        if (useSettingsStore.getState().autoCloseWindow && isDetachedWindowNow()) {
          window.utools?.outPlugin()
        } else {
          if (!isDetachedWindowNow()) window.utools?.hideMainWindow?.()
          if (activeTemplateBookmarkRef.current) exitTemplateMode()
        }
        recentDynamicTemplateEnterAtRef.current = Date.now()
      } finally {
        lastHandledPluginEnterRef.current = true
      }
    },
    [
      FEATURE_PREFIX,
      AI_QUICK_SAVE_FEATURE_CODE,
      isUTools,
      tab,
      setExpendHeight,
      getEnterText,
      onMainViewSwitch,
      handleQuickSave,
      findUniversalBookmarkMatch,
      enterTemplateMode,
      openResolvedUrl,
      showToast,
      syncTheme,
      syncUToolsFeatures,
      closeSearchView,
      activateSearchInputOnly,
      openUrl,
      isDetachedWindowNow,
      exitTemplateMode
    ]
  )

  // 把最新 handler 存到 ref，使长生命周期监听器始终调用最新逻辑
  const pluginEnterHandlerRef = useRef(handleUToolsPluginEnterEvent)
  pluginEnterHandlerRef.current = handleUToolsPluginEnterEvent

  const handleStorageSync = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: string }>).detail
      const { key, value } = detail || {}
      if (!value) return
      try {
        const data = JSON.parse(value)
        const settingsStore = useSettingsStore.getState()
        const store = useBookmarkStore.getState()
        if (key === 'settings' && data && typeof data === 'object') {
          const localMirrorDirectory = settingsStore.localMirrorDirectory
          const nextSettings = { ...(data as Record<string, unknown>) }
          delete nextSettings.localMirrorDirectory
          // 等价旧版 settingsStore.$patch(nextSettings)：Zustand setState 浅合并外部同步的设置字段。
          useSettingsStore.setState(nextSettings as Partial<typeof settingsStore>)
          settingsStore.setLocalMirrorDirectory(localMirrorDirectory)
          hydrateMirrorDirectoryForDevice()
          refreshLocalModePathNotice(true)
        }
        if (key === 'bookmark') {
          const incomingStamp = getLatestUpdatedAt(data)
          const localStamp = getLatestUpdatedAt({ groups: store.groups, bookmarks: store.bookmarks })
          if (incomingStamp >= localStamp) {
            const preferredGroupId = store.activeGroupId
            const preferredSubGroupId = store.activeSubGroupId
            const nextGroups = Array.isArray((data as { groups?: unknown }).groups)
              ? (data as { groups: Group[] }).groups
              : store.groups
            const nextBookmarks = Array.isArray((data as { bookmarks?: unknown }).bookmarks)
              ? (data as { bookmarks: Bookmark[] }).bookmarks
              : store.bookmarks
            store.setData({ groups: nextGroups, bookmarks: nextBookmarks })
            store.ensureValidSelection(preferredGroupId, preferredSubGroupId)
          }
        }
      } catch {
        // ignore
      }
    },
    [hydrateMirrorDirectoryForDevice, refreshLocalModePathNotice]
  )
  const storageSyncHandlerRef = useRef(handleStorageSync)
  storageSyncHandlerRef.current = handleStorageSync

  const handleUToolsSearchInputEvent = useCallback(
    (event: Event) => {
      if (activeTemplateBookmarkRef.current) return
      const detail = (event as CustomEvent<{ text?: string }>).detail
      syncSearchInputText(typeof detail?.text === 'string' ? detail.text : '')
    },
    [syncSearchInputText]
  )
  const searchInputHandlerRef = useRef(handleUToolsSearchInputEvent)
  searchInputHandlerRef.current = handleUToolsSearchInputEvent

  const handleUToolsPluginOutEvent = useCallback(() => {
    skipSearchCloseRefocusRef.current = true
    setSuppressSearchOverlay(false)
    suppressSearchOverlayRef.current = false
    closeSearchView({ restoreFocus: false })
    clearSubInput()
  }, [closeSearchView, clearSubInput])
  const pluginOutHandlerRef = useRef(handleUToolsPluginOutEvent)
  pluginOutHandlerRef.current = handleUToolsPluginOutEvent

  // ---- 挂载生命周期 ----
  useEffect(() => {
    if (activeBookmarks.length > 0) setSelectedIndex(0)
    const loadingTimer = setTimeout(() => {
      setIsLoading(false)
      queueMicrotask(() => {
        restoreScrollPosition()
        setupSectionObserver()
      })
    }, 400)

    hydrateMirrorDirectoryForDevice()
    ensureLocalModeIntroNotice()
    refreshLocalModePathNotice(true)

    const preventContextMenu = (e: MouseEvent) => e.preventDefault()
    window.addEventListener('contextmenu', preventContextMenu, true)

    const updatePopstateTitle = () => {
      /* 标题由 effect 维护，这里仅占位以保持与旧版一致的监听 */
    }
    window.addEventListener('popstate', updatePopstateTitle)

    recordUse('open')

    const onPluginEnter = (e: Event) => pluginEnterHandlerRef.current(e)
    const onStorageSync = (e: Event) => storageSyncHandlerRef.current(e)
    const onSearchInput = (e: Event) => searchInputHandlerRef.current(e)
    const onPluginOut = () => pluginOutHandlerRef.current()

    if (window.utools) {
      syncUToolsFeatures()
      window.addEventListener('storage-sync', onStorageSync)
      window.addEventListener(UTOOLS_SEARCH_INPUT_EVENT, onSearchInput)
      window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, onPluginEnter)
      window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, onPluginOut)

      // replay pending plugin-enter（uTools preload 在 React 挂载前缓存的事件）
      const pendingEvents = (window as unknown as { __gooseMarksPendingPluginEnterEvents?: Array<{ params: UToolsPluginEnterPayload }> })
        .__gooseMarksPendingPluginEnterEvents || []
      if (pendingEvents.length > 0) {
        const selectedEvent =
          [...pendingEvents]
            .reverse()
            .find((entry) => {
              const c = entry?.params?.code
              return typeof c === 'string' && c.startsWith(FEATURE_PREFIX)
            }) ?? pendingEvents[pendingEvents.length - 1]
        if (selectedEvent) {
          pluginEnterHandlerRef.current({ detail: selectedEvent.params } as unknown as Event)
        }
        ;(window as unknown as { __gooseMarksPendingPluginEnterEvents?: unknown[] }).__gooseMarksPendingPluginEnterEvents = []
      }
    }

    // 种子书签图标批量匹配
    queueMicrotask(() => {
      void useBookmarkStore.getState().refreshMissingIcons()
    })

    return () => {
      clearTimeout(loadingTimer)
      window.removeEventListener('contextmenu', preventContextMenu, true)
      window.removeEventListener('popstate', updatePopstateTitle)
      if (window.utools) {
        window.removeEventListener('storage-sync', onStorageSync)
        window.removeEventListener(UTOOLS_SEARCH_INPUT_EVENT, onSearchInput)
        window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, onPluginEnter)
        window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, onPluginOut)
      }
      clearSubInput()
      if (viewModePersistTimerRef.current) clearTimeout(viewModePersistTimerRef.current)
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
      sectionObserverRef.current?.disconnect()
      document.body.classList.remove(
        'easter-egg-active',
        'solid-background',
        'light-white-background',
        'light-utools-background'
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 把 useSearch 的本地 input ref 提供给 overlay focus 逻辑（确保引用一致）
  useEffect(() => {
    const overlay = searchOverlayRef.current
    void overlay
    void localSearchInputRef
  }, [searchViewOpen, localSearchInputRef])

  // ---- 列表面板头：当前视图标题 ----
  const currentViewTitle = useMemo(() => {
    if (searchViewOpen) return '搜索结果'
    if (isTrashActive && activeView === 'group') return '回收站'
    switch (activeView) {
      case 'all':
        return '全部书签'
      case 'pinned':
        return '置顶'
      case 'recent':
        return '最近使用'
      case 'group':
      default:
        if (shouldShowSubs && currentSubGroup) {
          return `${activeGroup?.name ?? ''} / ${currentSubGroup.name}`
        }
        return activeGroup?.name ?? '全部书签'
    }
  }, [searchViewOpen, isTrashActive, activeView, shouldShowSubs, currentSubGroup, activeGroup])

  // 列表面板头项数：与底部状态栏 current 口径一致（当前实际展示项数，含标签过滤）
  const listHeaderCount = visibleBookmarks.length

  // ==================================================================
  // 渲染
  // ==================================================================

  // 模板搜索全屏 / 新建编辑全屏（互斥占据主区域）
  if (activeTemplateBookmark) {
    return (
      <>
        {showStarryBackground && <StarryBackground />}
        <TemplateSearch
          bookmark={activeTemplateBookmark}
          query={templateQuery}
          onQueryChange={setTemplateQuery}
          onSubmit={executeTemplateSearch}
        />
        <FeatureNoticeCenter notice={activeFeatureNotice} onView={handleFeatureNoticeView} onIgnore={handleFeatureNoticeIgnore} />
        <ResultToast
          open={toastState.visible}
          title={toastState.title}
          description={toastState.description}
          variant={toastState.variant}
          actionLabel={toastState.actionLabel}
          origin={toastState.origin}
          onClose={closeToast}
          onAction={() => toastState.onAction?.()}
        />
      </>
    )
  }

  if (showAdd) {
    return (
      <>
        {showStarryBackground && <StarryBackground />}
        <BookmarkFormDialog onClose={() => setForm({ showAdd: false })} />
        <FeatureNoticeCenter notice={activeFeatureNotice} onView={handleFeatureNoticeView} onIgnore={handleFeatureNoticeIgnore} />
        <ResultToast
          open={toastState.visible}
          title={toastState.title}
          description={toastState.description}
          variant={toastState.variant}
          actionLabel={toastState.actionLabel}
          origin={toastState.origin}
          onClose={closeToast}
          onAction={() => toastState.onAction?.()}
        />
      </>
    )
  }

  return (
    <>
      {showStarryBackground && <StarryBackground />}

      <div
        className="app-container relative z-10 min-h-screen h-screen flex flex-col overflow-hidden bg-background text-foreground transition-all duration-500"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 搜索浮层 */}
        <SearchOverlay
          ref={searchOverlayRef}
          open={searchViewOpen && !suppressSearchOverlay}
          isUTools={isUTools}
          searchValue={searchValue}
          activeBookmarks={activeBookmarks}
          selectedIndex={selectedIndex}
          enableSubInput={canUseSubInput()}
          storeSearch={storeSearch}
          searchAutoExitText={searchAutoExitText}
          showCmdHints={showCmdHints}
          hintKeyById={hintKeyById}
          gridColumns={settings.gridColumns}
          setGridRef={setBookmarkGridRef}
          onSearchValueChange={setSearchValue}
          onSelectedIndexChange={setSelectedIndex}
          onClose={() => closeSearchView()}
          onRefocus={() => focusMainSearchInput(true)}
          onKeydown={handleLocalSearchKey}
          onEdit={(b) => openEdit(b)}
          onOpen={openBookmarkLink}
          onCopyUrl={copyBookmarkUrl}
          onRemove={handleRemove}
          onContextMenu={handleContextMenuWrapper}
          onReorder={handleReorder}
          onLocate={handleLocate}
        />

        {/* 主内容 */}
        {tab === 'bookmarks' ? (
          <main className="flex-1 min-h-0 flex overflow-hidden select-none">
            <AppSidebar
              activeAnchorId={activeAnchorId}
              isUTools={isUTools}
              isSettings={false}
              onScrollTo={scrollToSection}
              onEditGroup={openGroupEditor}
              onFocusSearch={() => focusMainSearchInput(true)}
              onOpenSettings={() => setTab('settings')}
              isDark={isDark}
              onToggleDark={toggleDark}
            />

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* 列表面板头：视图名 + 项数 + 筛选/排序/视图切换/新建 */}
              <BookmarkListHeader
                title={currentViewTitle}
                count={listHeaderCount}
                viewMode={viewMode}
                sort={listSort}
                sortEnabled={sortApplies}
                tagOptions={tagOptions}
                selectedTags={effectiveTagFilter}
                onToggleTag={toggleTagFilter}
                onClearTags={clearTagFilter}
                onSortChange={setListSort}
                onViewModeChange={(mode) => {
                  setViewMode(mode)
                  setTab('bookmarks')
                }}
                onCreate={() => openAdd()}
              />
              <div
                ref={contentScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-2 py-2 custom-scroll"
                onScroll={debouncedSaveScroll}
              >
                {!isTrashActive && !storeSearch && (
                  <OnboardingBanner onImport={handleOnboardingImport} onExport={exportData} />
                )}

                {viewMode === 'list' || viewMode === 'cards' ? (
                  <BookmarksList
                    variant={viewMode === 'cards' ? 'cards' : 'list'}
                    bookmarks={visibleBookmarks}
                    selectedIndex={selectedIndex}
                    isTrashActive={isTrashActive}
                    showCommandHints={showCmdHints}
                    hintKeyById={hintKeyById}
                    highlightedId={highlightedBookmarkId}
                    sections={
                      searchViewOpen || isTrashActive || activeView !== 'group' ? undefined : bookmarkSections
                    }
                    loading={isLoading}
                    clickableIcon={!previewPanelCollapsed && viewMode === 'list'}
                    onSelect={handleBookmarkSelect}
                    onRemove={handleRemove}
                    onEdit={openEdit}
                    onOpen={openBookmarkLink}
                    onIconClick={openBookmarkLink}
                    onContextMenu={handleContextMenuWrapper}
                    onReorder={handleReorder}
                    onLocate={handleLocate}
                    onScrollToSection={scrollToSection}
                  />
                ) : (
                  <BookmarksGrid
                    bookmarks={visibleBookmarks}
                    selectedIndex={selectedIndex}
                    isTrashActive={isTrashActive}
                    columns={settings.gridColumns}
                    setGridRef={setBookmarkGridRef}
                    showCommandHints={showCmdHints}
                    hintKeyById={hintKeyById}
                    highlightedId={highlightedBookmarkId}
                    onRemove={handleRemove}
                    onEdit={openEdit}
                    onOpen={openBookmarkLink}
                    onContextMenu={handleContextMenuWrapper}
                    onReorder={handleReorder}
                    onAdd={() => openAdd()}
                    onEmptyTrash={emptyTrash}
                    onLocate={handleLocate}
                  />
                )}
              </div>
            </div>

            {/* 右侧预览栏（仅列表模式、非回收站） */}
            {!isUTools && !isTrashActive && viewMode === 'list' && (
              <>
                {!previewPanelCollapsed && (
                  <div
                    className="w-1 shrink-0 cursor-col-resize hover:bg-primary/20 transition-colors"
                    title="拖动调整宽度"
                    onMouseDown={startResizePreview}
                  />
                )}
                {!previewPanelCollapsed ? (
                  <BookmarkPreview
                    bookmark={selectedBookmark}
                    isTrashActive={isTrashActive}
                    width={previewPanelWidthLive}
                    onOpen={openBookmarkLink}
                    onEdit={openEdit}
                    onRemove={handleRemove}
                    onCopyUrl={copyBookmarkUrl}
                    onLocate={handleLocate}
                    onToggleCollapse={() => useSettingsStore.getState().setPreviewPanelCollapsed(true)}
                    onUpdateDesc={updateBookmarkDesc}
                  />
                ) : (
                  <div
                    className="w-8 shrink-0 flex flex-col items-center border-l border-border/50 bg-card/30 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    title="展开详情"
                    onClick={() => useSettingsStore.getState().setPreviewPanelCollapsed(false)}
                  >
                    <ChevronLeft className="text-muted-foreground text-lg" />
                  </div>
                )}
              </>
            )}
          </main>
        ) : (
          <main className="flex-1 min-h-0 overflow-hidden">
            <SettingsLayout />
          </main>
        )}

        {/* 右键菜单 */}
        {contextMenu.show && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            isTrash={isTrashActive}
            isUTools={isUTools}
            hasDescription={Boolean(contextMenu.target?.desc?.trim())}
            onClose={closeContextMenu}
            onAction={handleContextMenuAction}
          />
        )}

        {/* 快速保存弹窗 */}
        <QuickSaveDialog open={showQuickSaveDialog} onOpenChange={setShowQuickSaveDialog} onSave={quickSaveBookmarkFromDialog} />
      </div>

      {/* 全局浮层（脱离 app-container，避免被彩蛋透明样式影响） */}
      <FeatureNoticeCenter notice={activeFeatureNotice} onView={handleFeatureNoticeView} onIgnore={handleFeatureNoticeIgnore} />

      <MirrorDirectoryDecisionDialog
        open={showMirrorDecisionDialog}
        directoryPath={pendingMirrorDecision?.directoryPath || ''}
        filePath={pendingMirrorDecision?.filePath || ''}
        canRead={pendingMirrorDecision?.canRead ?? false}
        loading={mirrorDecisionLoading}
        onOpenChange={(value) => !value && closeMirrorDecisionDialog()}
        onRead={() => confirmMirrorDecision('read')}
        onOverwrite={() => confirmMirrorDecision('overwrite')}
      />

      <ResultToast
        open={toastState.visible}
        title={toastState.title}
        description={toastState.description}
        variant={toastState.variant}
        actionLabel={toastState.actionLabel}
        origin={toastState.origin}
        onClose={closeToast}
        onAction={() => toastState.onAction?.()}
      />
    </>
  )
}

export default App
