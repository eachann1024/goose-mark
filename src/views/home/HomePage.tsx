import { useCallback, useMemo, useRef, useState } from 'react'
import type { Bookmark, BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import { useUToolsMcpBridge } from '@/hooks/useUToolsMcpBridge'
import { useUTools } from '@/hooks/useUTools'
import AggressiveAiSavePanel from './AggressiveAiSavePanel'
import { buildHomeGroups, trashCount, type HomeGroup, type HomeItem } from './viewModel'
import AddBookmarkWizard from './AddBookmarkWizard'
import GroupManagePage from './GroupManagePage'
import AvatarMenu from './AvatarMenu'
import HelpAboutDialog from './HelpAboutDialog'
import StarryBackground from '@/components/StarryBackground'
import BlackHole from '@/components/BlackHole'
import './home.css'
import { type CtxMode, type CtxState, type AggressiveSaveJob, type AggressiveSaveSuccess, type AggressiveSaveFailure, type ToastTone, type ToastAction } from './homeTypes'
import { RUNTIME_PLATFORM, IS_WINDOWS_UTOOLS, getSearchSurface } from './homeRuntime'
import { type HomeContinuityState, readHomeContinuityState } from './homeContinuity'
import { useHomeThemeState, useHomeThemeEffects, useHomeViewPreferences } from './useHomeTheme'
import { useHomeSmoothScrolling, useHomeSelectionScroll } from './useHomeSelectionScroll'
import { useHomeTemplateState, useHomeTemplates } from './useHomeTemplates'
import { useHomePanelPersistence } from './useHomePanelPersistence'
import { useHomeInitialSelection } from './useHomeInitialSelection'
import { useHomeSearchFocus, useHomeSearchResults, useHomeSearchActions, useHomeUniversalMatch, useHomeSubInputSync } from './useHomeSearch'
import { useHomePanelRestoration } from './useHomePanelRestoration'
import { useHomeGroupNavigation } from './useHomeGroupNavigation'
import { useHomeGroupTabs } from './useHomeGroupTabs'
import { useHomeContextActions, useHomePointerInteractions } from './useHomeContextActions'
import { useHomeToast, useHomeUIToastBridge } from './useHomeToast'
import { useHomeBookmarkDrag } from './useHomeBookmarkDrag'
import { useHomeSectionNavigation } from './useHomeSectionNavigation'
import { useHomeAggressivePanel, useHomeAggressiveQueue, useHomeAiAvailability } from './useHomeAggressiveSave'
import { useHomeAggressiveReveal } from './useHomeAggressiveReveal'
import { useHomeScrollSpy } from './useHomeScrollSpy'
import { useHomeKeyboard } from './useHomeKeyboard'
import { useHomeLifecycle, useHomeDetachedWindow, useHomeStorageSync, useHomeFeatures } from './homeHostLifecycle'
import { useHomePluginEnter } from './useHomePluginEnter'
import { useHomeSettingsNavigation } from './useHomeSettingsNavigation'
import { HomeHeader } from './HomeHeader'
import { HomeTabMenu } from './HomeTabMenu'
import { HomeTemplatePage } from './HomeTemplatePage'
import { HomeBookmarkPanels } from './HomeBookmarkPanels'
import { HomeSettingsPage } from './SettingsContent'
import { HomeAggressiveNotices } from './HomeAggressiveNotices'
import { HomeContextMenu } from './HomeContextMenu'
import { HomeToast } from './HomeToast'

export default function HomePage() {
  const groups = useBookmarkStore((s) => s.groups)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const activeSubGroupId = useBookmarkStore((s) => s.activeSubGroupId)
  const setActiveGroup = useBookmarkStore((s) => s.setActiveGroup)
  const reorderGroups = useBookmarkStore((s) => s.reorderGroups)
  const reorderSubGroups = useBookmarkStore((s) => s.reorderSubGroups)
  const reorderInSub = useBookmarkStore((s) => s.reorderInSub)
  const moveBookmarkToSubGroup = useBookmarkStore((s) => s.moveBookmarkToSubGroup)
  const updateGroup = useBookmarkStore((s) => s.updateGroup)
  const removeGroup = useBookmarkStore((s) => s.removeGroup)
  const addGroup = useBookmarkStore((s) => s.addGroup)

  // 1.【致命】uTools MCP 桥接：让 plugin.json 声明的工具能从 React 端读写书签数据
  useUToolsMcpBridge()

  // uTools 特性注册 / 进入文本解析
  const {
    AI_AGGRESSIVE_SAVE_FEATURE_CODE,
    FEATURE_PREFIX,
    syncFeatures,
    getEnterText
  } = useUTools()
  const searchSurface = getSearchSurface()

  // 业务操作 hook
  const {
    openBookmarkLink: openBookmarkLinkBase,
    openUrlInUtoolsBrowser,
    openUrlInDefaultBrowser,
    copyBookmarkUrl,
    handleRemove,
    openUrl
  } = useBookmarkOperations()

  // uTools 下点击模板书签（URL 含 {query}）进入模板输入态而非直开根地址（对齐 App.tsx:442-446）。
  // enterTemplateMode / clearSearch 声明在后方，用 ref 间接引用避免 TDZ。
  const enterTemplateModeFnRef = useRef<(b: Bookmark) => void>(() => {})
  const clearSearchFnRef = useRef<() => void>(() => {})
  const openBookmarkLink = useCallback(
    (bookmark: Bookmark, options?: Parameters<typeof openBookmarkLinkBase>[1]) => {
      if (window.utools && /{[^}]+}/.test(bookmark.url) && !options?.source?.startsWith('template')) {
        enterTemplateModeFnRef.current(bookmark)
        return
      }
      openBookmarkLinkBase(bookmark, options)
      // 直开链接后默认退出搜索态（与「搜索框为空即非搜索面板」一致，无单独选项）
      clearSearchFnRef.current()
    },
    [openBookmarkLinkBase]
  )

  // settings store
  const homeViewMode = useSettingsStore((s) => s.homeViewMode)
  const setHomeViewMode = useSettingsStore((s) => s.setHomeViewMode)
  const searchViewMode = useSettingsStore((s) => s.searchViewMode)
  const setSearchViewMode = useSettingsStore((s) => s.setSearchViewMode)
  const useUtoolsBrowser = useSettingsStore((s) => s.useUtoolsBrowser)
  const gridColumns = useSettingsStore((s) => s.gridColumns)
  const density = useSettingsStore((s) => s.density)
  const uiScale = useSettingsStore((s) => s.uiScale)
  const setUiScale = useSettingsStore((s) => s.setUiScale)
  const easterEggEnabled = useSettingsStore((s) => s.easterEggEnabled)
  const easterEggVariant = useSettingsStore((s) => s.easterEggVariant)
  const panelContinuous = useSettingsStore((s) => s.panelContinuous)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const aiAggressiveSaveEnabled = useSettingsStore((s) => s.aiAggressiveSaveEnabled)
  // AI 设置变化键（与 App.tsx 对齐），用于触发 syncFeatures 重跑
  const aiSettingsKey = useSettingsStore(
    (s) =>
      `${s.aiEnabled}|${s.aiAllowLegacyUTools}|${s.aiUseCustomProvider}|${s.aiProtocol}|${s.aiSelectedModelId}|${s.aiCustomBaseURL}|${s.aiCustomApiKey}|${s.aiAggressiveSaveEnabled}`
  )

  const homeGroups: HomeGroup[] = useMemo(
    () => buildHomeGroups(groups, bookmarks),
    [groups, bookmarks]
  )
  const trashN = useMemo(() => trashCount(groups), [groups])
  const initialContinuityRef = useRef<HomeContinuityState | null>(
    useSettingsStore.getState().panelContinuous ? readHomeContinuityState() : null
  )

  const { themePref, setThemePref, theme, setTheme, view, setView, screen, setScreen } = useHomeThemeState({
    homeViewMode
  })
  const [selectedId, setSelectedId] = useState<string | null>(() => initialContinuityRef.current?.selectedId ?? null)
  // 搜索词仅跟当前会话的搜索框同步；退出插件后 subInput 会被清空，再次唤出不得残留搜索态
  // 书签拖拽中的项（用于 DragOverlay 跟手预览）
  const [activeDragItem, setActiveDragItem] = useState<HomeItem | null>(null)
  // 标记本次 selectedId 变更来自键盘方向键（决定滚入时居中 vs 就近，避免鼠标点击触发跳动）
  const keyboardNavRef = useRef(false)
  // 方向键节流：长按时系统 keydown repeat 频率过高会导致滚动飞快，限制每步最小间隔放慢节奏
  const lastArrowAtRef = useRef(0)
  // 平滑滚动动画句柄：长按时复用同一段缓动，新目标到来即接管，不打断
  const smoothRafRef = useRef<number | null>(null)

  const { smoothScrollTo } = useHomeSmoothScrolling({
    smoothRafRef
  })
  const [activeSubId, setActiveSubId] = useState<string | null>(() => initialContinuityRef.current?.activeSubId ?? null)
  // 侧栏主动定位信号：点击侧栏 / 键盘导航时自增，让侧栏把高亮项居中（被动滚动跟随不动它）
  const [sidebarCenterSignal, setSidebarCenterSignal] = useState(0)
  const centerSidebar = useCallback(() => setSidebarCenterSignal((n) => n + 1), [])
  const [setNavIdx, setSetNavIdx] = useState(0)
  const setMainRef = useRef<HTMLDivElement>(null)
  const isSetScrollingRef = useRef(false)
  const setScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ctx, setCtx] = useState<CtxState>({ open: false, x: 0, y: 0 })
  const [ctxMode, setCtxMode] = useState<CtxMode>('menu')
  // 当前被右键点击的书签项（用于右键菜单操作）
  const [ctxItem, setCtxItem] = useState<HomeItem | null>(null)
  // 右键点击处的精确位置（用于多分类书签删除正确分类）
  const [ctxLocation, setCtxLocation] = useState<{ groupId: string; subGroupId: string } | null>(null)
  // 表单编辑态：null = 新增，非空 = 编辑
  const [formEditItem, setFormEditItem] = useState<HomeItem | null>(null)
  // formKey：每次点新增时递增，强制 AddBookmarkWizard 重挂载
  const [formKey, setFormKey] = useState(0)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastTitle, setToastTitle] = useState('')
  const [toastDesc, setToastDesc] = useState('')
  const [toastJump, setToastJump] = useState<BookmarkLocation | null>(null)
  const [toastTone, setToastTone] = useState<ToastTone>('success')
  const [toastAction, setToastAction] = useState<ToastAction>(null)
  const [toastKey, setToastKey] = useState(0)
  /** AI 保存面板的预填 URL（uTools 特性带入） */
  const [aggressiveSaveUrl, setAggressiveSaveUrl] = useState('')
  const [aggressiveSaveAutoStart, setAggressiveSaveAutoStart] = useState(false)
  const [aggressiveSaveJobs, setAggressiveSaveJobs] = useState<AggressiveSaveJob[]>([])
  const [aggressiveSaveSuccesses, setAggressiveSaveSuccesses] = useState<AggressiveSaveSuccess[]>([])
  const [aggressiveSaveFailure, setAggressiveSaveFailure] = useState<AggressiveSaveFailure | null>(null)
  const [searchVal, setSearchVal] = useState('')
  // 必须在任何依赖它的 useEffect 之前声明，否则 const TDZ 会在首屏渲染炸掉
  const isSearching = searchVal.trim().length > 0
  const isSearchingRef = useRef(isSearching)
  isSearchingRef.current = isSearching
  const searchValRef = useRef(searchVal)
  searchValRef.current = searchVal
  // ---- 个人菜单 + 帮助弹窗 ----
  const [paOpen, setPaOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const { activeTemplateBookmark, setActiveTemplateBookmark, templateQuery, setTemplateQuery, templateQueryRef, recentDynamicTemplateEnterAtRef } = useHomeTemplateState({
    FEATURE_PREFIX,
    getEnterText
  })

  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const headerSearchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const aggressiveSaveJobSeqRef = useRef(0)
  const aggressiveSaveQueueRef = useRef<Array<{ id: number; url: string }>>([])
  const aggressiveSaveRunnerRef = useRef(false)
  const aggressiveSaveMountedRef = useRef(true)
  const aggressiveSaveSuccessTimersRef = useRef<Map<number, number>>(new Map())
  const aggressiveSaveRevealTimersRef = useRef<Set<number>>(new Set())
  const pumpAggressiveSaveQueueRef = useRef<() => void>(() => {})
  // 侧栏点击触发的程序化滚动期间抑制 scroll-spy，避免高亮闪过中间分组
  const isAnchorScrollingRef = useRef(false)
  const anchorScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRaf = useRef(0)

  const { groupPanelMapRef, homeScrollTopRef, homeContinuityLatestRef, groupPanelFlushTimerRef, groupPanelDirtyRef, restoreScrollTokenRef, scheduleFlushGroupPanelMap, updateGroupPanelMemory, captureCurrentGroupPanel, saveHomeContinuity } = useHomePanelPersistence({
    initialContinuityRef,
    activeSubId,
    selectedId,
    activeGroupId,
    isSearchingRef,
    contentRef
  })

  /** 网格列数：接 settings.gridColumns，键盘跳格与 CSS 列数始终一致 */
  const GRID_COLS = gridColumns

  useHomeInitialSelection({
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
    getRestoreHomeScrollRef: () => restoreHomeScrollRef
  })

  const { focusSearchInput } = useHomeSearchFocus({
    searchSurface,
    headerSearchRef
  })

  const { keptGroups, searchResultItems, universalFallbackItems, isUniversalFallback, navigableItems, openHomeItem, suppressScrollIntoViewRef } = useHomeSearchResults({
    activeGroupId,
    homeGroups,
    searchVal,
    isSearching,
    bookmarks,
    openBookmarkLinkBase,
    clearSearchFnRef,
    openBookmarkLink,
    selectedId,
    setSelectedId
  })

  useHomeThemeEffects({
    themePref,
    setTheme,
    theme,
    easterEggEnabled
  })

  const { applySearchVal, clearSearch } = useHomeSearchActions({
    setSearchVal,
    searchSurface,
    searchVal,
    suppressScrollIntoViewRef,
    clearSearchFnRef
  })

  const { restoreHomeScrollRef } = useHomePanelRestoration({
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
  })

  const { changeActiveGroup } = useHomeGroupNavigation({
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
  })

  const { tabSensors, dndSensors, handleTabDragEnd, tabCtx, tabRenaming, setTabRenaming, tabRenameVal, setTabRenameVal, tabMenuRef, tabRenameRef, tabAdding, setTabAdding, tabAddVal, setTabAddVal, tabAddRef, startTabAdd, commitTabAdd, openTabCtx, startTabRename, commitTabRename, deleteTabGroup } = useHomeGroupTabs({
    homeGroups,
    reorderGroups,
    addGroup,
    screen,
    setScreen,
    view,
    isSearching,
    clearSearch,
    updateGroup,
    removeGroup
  })

  const { applyThemePref, changeView } = useHomeViewPreferences({
    setThemePref,
    setTheme,
    setView,
    setHomeViewMode,
    setScreen,
    focusSearchInput
  })

  const { openCtx, closeCtx, requestCtxDelete, confirmCtxDelete } = useHomeContextActions({
    rootRef,
    homeGroups,
    setCtxItem,
    setCtxLocation,
    ctxMenuRef,
    setCtxMode,
    setCtx,
    ctxItem,
    bookmarks,
    handleRemove,
    ctxLocation
  })

  const { fireToastRef, fireToast } = useHomeToast({
    closeCtx,
    setToastTitle,
    setToastDesc,
    setToastJump,
    setToastTone,
    setToastAction,
    setToastKey,
    setToastOpen,
    toastTimer
  })

  const { handleDndDragStart, handleDndDragEnd } = useHomeBookmarkDrag({
    setActiveDragItem,
    homeGroups,
    reorderSubGroups,
    reorderInSub,
    moveBookmarkToSubGroup,
    fireToast
  })

  useHomeSelectionScroll({
    screen,
    selectedId,
    suppressScrollIntoViewRef,
    contentRef,
    keyboardNavRef,
    smoothScrollTo,
    view
  })

  const { syncSidebarForItem, scrollToSection } = useHomeSectionNavigation({
    homeGroups,
    setActiveSubId,
    centerSidebar,
    contentRef,
    isAnchorScrollingRef,
    anchorScrollTimer,
    anchorRaf
  })

  // ---- 工具：返回书签列表视图（供新增/编辑页返回用） ----
  // jump 非空（保存成功）时跳到书签落地的分组/子分组：store.selectGroup 已切一级分组，
  // 这里再同步本地 activeSubId（侧栏高亮）并滚动到对应分组段。
  const backToList = useCallback((jump?: BookmarkLocation) => {
    setScreen(view)
    if (jump) {
      setActiveSubId(jump.subGroupId)
      if (view === 'list' || view === 'grid') scrollToSection(jump.groupId, jump.subGroupId)
    }
  }, [view, scrollToSection])

  const { openAggressiveSavePanel, clearAggressiveSaveSuccessTimer, dismissAggressiveSaveSuccess, scheduleAggressiveSaveSuccessDismiss } = useHomeAggressivePanel({
    setFormEditItem,
    setFormKey,
    setScreen,
    setAggressiveSaveUrl,
    setAggressiveSaveAutoStart,
    setAggressiveSaveFailure,
    aggressiveSaveSuccessTimersRef,
    setAggressiveSaveSuccesses
  })

  const { jumpToAggressiveSaveResult } = useHomeAggressiveReveal({
    applySearchVal,
    setScreen,
    view,
    setActiveSubId,
    contentRef,
    aggressiveSaveRevealTimersRef,
    smoothRafRef,
    isAnchorScrollingRef,
    setSelectedId
  })

  /** 从主面板进入新建：先把 UI 当前选中（含 scroll-spy 的 activeSubId）写入 store，再开表单 */
  const openNewBookmarkForm = useCallback(() => {
    const store = useBookmarkStore.getState()
    const groupId = activeGroupId || store.activeGroupId
    const subGroupId = activeSubId || store.activeSubGroupId || undefined
    if (groupId) {
      store.selectGroup(groupId, subGroupId)
    }
    setFormEditItem(null)
    setFormKey((k) => k + 1)
    setScreen('add')
  }, [activeGroupId, activeSubId])

  const { takeOverAggressiveSave, undoAggressiveSave, enqueueAggressiveSave } = useHomeAggressiveQueue({
    dismissAggressiveSaveSuccess,
    fireToast,
    setFormEditItem,
    setFormKey,
    setScreen,
    aggressiveSaveRunnerRef,
    aggressiveSaveQueueRef,
    setAggressiveSaveJobs,
    aggressiveSaveMountedRef,
    setAggressiveSaveFailure,
    setAggressiveSaveUrl,
    setAggressiveSaveAutoStart,
    setAggressiveSaveSuccesses,
    jumpToAggressiveSaveResult,
    scheduleAggressiveSaveSuccessDismiss,
    getScreenRef: () => screenRef,
    pumpAggressiveSaveQueueRef,
    aggressiveSaveJobSeqRef,
    applySearchVal,
    view
  })

  const { handleActiveSubIdFix } = useHomeScrollSpy({
    setActiveSubId,
    view,
    screen,
    contentRef,
    isAnchorScrollingRef
  })

  useHomeKeyboard({
    screen,
    setScreen,
    view,
    closeCtx,
    searchVal,
    clearSearch,
    headerSearchRef,
    focusSearchInput,
    ctx,
    navigableItems,
    selectedId,
    openHomeItem,
    getApplySearchValRef: () => applySearchValRef,
    isSearching,
    searchViewMode,
    isUniversalFallback,
    GRID_COLS,
    lastArrowAtRef,
    rootRef,
    keyboardNavRef,
    setSelectedId,
    syncSidebarForItem
  })

  useHomePointerInteractions({
    closeCtx,
    rootRef
  })

  useHomeLifecycle({
    toastTimer,
    aggressiveSaveMountedRef,
    aggressiveSaveSuccessTimersRef,
    aggressiveSaveRevealTimersRef,
    setScrollTimeout,
    smoothRafRef
  })

  // 供长生命周期 handler 读取最新 setter/状态（避免闭包捕获初始值）
  const setScreenRef = useRef(setScreen)
  setScreenRef.current = setScreen
  const setSearchValRef = useRef(setSearchVal)
  setSearchValRef.current = setSearchVal
  const applySearchValRef = useRef(applySearchVal)
  applySearchValRef.current = applySearchVal
  const viewRef = useRef(view)
  viewRef.current = view
  const screenRef = useRef(screen)
  screenRef.current = screen
  // activeTemplateBookmarkRef：供 plugin-enter handler 读取最新模板书签
  const activeTemplateBookmarkRef = useRef<Bookmark | null>(null)
  activeTemplateBookmarkRef.current = activeTemplateBookmark

  const { enterTemplateMode, exitTemplateModeRef, templateInputRef } = useHomeTemplates({
    setActiveTemplateBookmark,
    activeTemplateBookmarkRef,
    setTemplateQuery,
    templateQueryRef,
    applySearchVal,
    setScreen,
    view,
    enterTemplateModeFnRef,
    fireToastRef,
    openUrl,
    activeTemplateBookmark
  })

  const { findUniversalBookmarkMatch } = useHomeUniversalMatch()

  const { lastWindowFocusAtRef, saveDetachedWindowPosition } = useHomeDetachedWindow()

  useHomePluginEnter({
    getEnterText,
    FEATURE_PREFIX,
    AI_AGGRESSIVE_SAVE_FEATURE_CODE,
    openNewBookmarkForm,
    openAggressiveSavePanel,
    fireToastRef,
    activeTemplateBookmarkRef,
    recentDynamicTemplateEnterAtRef,
    templateQueryRef,
    enterTemplateMode,
    openUrl,
    exitTemplateModeRef,
    findUniversalBookmarkMatch,
    lastWindowFocusAtRef,
    saveDetachedWindowPosition,
    searchValRef,
    suppressScrollIntoViewRef,
    applySearchValRef,
    focusSearchInput,
    setScreenRef,
    view,
    restoreHomeScrollRef
  })

  useHomeSubInputSync({
    activeTemplateBookmarkRef,
    screenRef,
    setScreenRef,
    viewRef,
    applySearchValRef
  })

  useHomeUIToastBridge({
    fireToastRef
  })

  useHomeStorageSync()

  useHomeFeatures({
    syncFeatures,
    bookmarks,
    aiSettingsKey
  })

  useHomeAiAvailability({
    screen,
    aiEnabled,
    setFormEditItem,
    setFormKey,
    setScreen
  })

  const { scrollToSetSection } = useHomeSettingsNavigation({
    screen,
    setMainRef,
    isSetScrollingRef,
    setSetNavIdx,
    setScrollTimeout
  })

  // 当前选中书签（供右键「复制」Toast 副标题展示书签名，对齐设计稿）
  const selectedItem = useMemo<HomeItem | null>(() => {
    if (!selectedId) return null
    for (const g of homeGroups) for (const s of g.subs) {
      const hit = s.items.find((b) => b.id === selectedId)
      if (hit) return hit
    }
    return null
  }, [homeGroups, selectedId])

  const activeAggressiveSaveJob =
    aggressiveSaveJobs.find((job) => job.status === 'running') ??
    aggressiveSaveJobs.find((job) => job.status === 'queued')
  const aggressiveSaveWaitingCount = Math.max(0, aggressiveSaveJobs.length - (activeAggressiveSaveJob ? 1 : 0))

  const rootCls = [
    'goose-home',
    toastOpen ? 'toast-open' : '',
    // 彩蛋激活时加 egg-on，让 CSS 透出底层 canvas
    theme === 'dark' && easterEggEnabled ? 'egg-on' : '',
    isSearching ? 'is-searching' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={rootCls} data-theme={theme} data-screen={screen} data-density={density} data-ui-scale={uiScale} data-platform={RUNTIME_PLATFORM} data-search-surface={searchSurface}>
      {theme === 'dark' && easterEggEnabled && easterEggVariant === 'starry' && <StarryBackground />}
      {theme === 'dark' && easterEggEnabled && easterEggVariant === 'blackhole' && (
        <div
          className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none"
          style={{ backgroundColor: '#262624' }}
        >
          <BlackHole
            brightness={0.75}
            speed={0.9}
            quality={IS_WINDOWS_UTOOLS ? 'low' : 'auto'}
            resolutionScale={IS_WINDOWS_UTOOLS ? 0.35 : undefined}
            maxFps={IS_WINDOWS_UTOOLS ? 24 : undefined}
          />
        </div>
      )}
      {/* zIndex 让窗口盖在彩蛋 canvas 上；position 必须保留 CSS 的 absolute+inset:0，否则高度约束链断裂导致设置页无法滚动 */}
      <div className="window" style={{ zIndex: 1 }}>
        {/* ---------- Header ---------- */}
        <HomeHeader
            tabSensors={tabSensors}
            handleTabDragEnd={handleTabDragEnd}
            homeGroups={homeGroups}
            tabRenaming={tabRenaming}
            tabRenameRef={tabRenameRef}
            tabRenameVal={tabRenameVal}
            setTabRenameVal={setTabRenameVal}
            commitTabRename={commitTabRename}
            setTabRenaming={setTabRenaming}
            isSearching={isSearching}
            screen={screen}
            activeGroupId={activeGroupId}
            clearSearch={clearSearch}
            changeActiveGroup={changeActiveGroup}
            openTabCtx={openTabCtx}
            tabAdding={tabAdding}
            tabAddRef={tabAddRef}
            tabAddVal={tabAddVal}
            setTabAddVal={setTabAddVal}
            commitTabAdd={commitTabAdd}
            setTabAdding={setTabAdding}
            startTabAdd={startTabAdd}
            searchSurface={searchSurface}
            headerSearchRef={headerSearchRef}
            searchVal={searchVal}
            applySearchVal={applySearchVal}
            aiAggressiveSaveEnabled={aiAggressiveSaveEnabled}
            aiEnabled={aiEnabled}
            openAggressiveSavePanel={openAggressiveSavePanel}
            openNewBookmarkForm={openNewBookmarkForm}
            avatarRef={avatarRef}
            paOpen={paOpen}
            setPaOpen={setPaOpen}
          />

        {/* 一级 Tab 右键菜单 */}
        <HomeTabMenu
            tabCtx={tabCtx}
            tabMenuRef={tabMenuRef}
            startTabRename={startTabRename}
            deleteTabGroup={deleteTabGroup}
          />

        {/* 个人菜单 */}
        <AvatarMenu
          open={paOpen}
          theme={theme}
          themePref={themePref}
          view={view}
          uiScale={uiScale}
          trashN={trashN}
          onClose={() => setPaOpen(false)}
          onThemePrefChange={applyThemePref}
          onViewChange={changeView}
          onUiScaleChange={setUiScale}
          onOpenSettings={() => { setPaOpen(false); setScreen('settings') }}
          onOpenTrash={() => { setPaOpen(false); setScreen('trash') }}
          onOpenHelp={() => { setPaOpen(false); setHelpOpen(true) }}
        />
        {/* 帮助与关于弹窗 */}
        <HelpAboutDialog open={helpOpen} onClose={() => setHelpOpen(false)} onToast={fireToast} />

        {/* 模板输入页：整页接管，大 logo + 宽输入，Enter 打开 / Esc 退出 */}
        <HomeTemplatePage
            activeTemplateBookmark={activeTemplateBookmark}
            templateInputRef={templateInputRef}
            templateQuery={templateQuery}
            setTemplateQuery={setTemplateQuery}
          />

        {/* ---------- Main ---------- */}
        <HomeBookmarkPanels
            isSearching={isSearching}
            dndSensors={dndSensors}
            handleDndDragStart={handleDndDragStart}
            handleDndDragEnd={handleDndDragEnd}
            homeGroups={homeGroups}
            activeGroupId={activeGroupId}
            activeSubId={activeSubId}
            screen={screen}
            setActiveSubId={setActiveSubId}
            centerSidebar={centerSidebar}
            setScreen={setScreen}
            view={view}
            scrollToSection={scrollToSection}
            fireToast={fireToast}
            handleActiveSubIdFix={handleActiveSubIdFix}
            sidebarCenterSignal={sidebarCenterSignal}
            groups={groups}
            contentRef={contentRef}
            searchViewMode={searchViewMode}
            openCtx={openCtx}
            searchVal={searchVal}
            searchResultItems={searchResultItems}
            gridColumns={gridColumns}
            selectedId={selectedId}
            universalFallbackItems={universalFallbackItems}
            setSearchViewMode={setSearchViewMode}
            setSelectedId={setSelectedId}
            openHomeItem={openHomeItem}
            clearSearch={clearSearch}
            keptGroups={keptGroups}
            activeDragItem={activeDragItem}
          />

        {/* ---------- Settings ---------- */}
        <HomeSettingsPage
            setNavIdx={setNavIdx}
            scrollToSetSection={scrollToSetSection}
            fireToast={fireToast}
            setMainRef={setMainRef}
            theme={theme}
            themePref={themePref}
            view={view}
            applyThemePref={applyThemePref}
            setScreen={setScreen}
          />

        {/* ---------- Add/Edit wizard (沉浸式三步) ---------- */}
        {screen === 'add' && <AddBookmarkWizard key={`wiz-${formKey}`} editItem={formEditItem} onBack={backToList} />}

        {/* ---------- AI 保存（仅网址） ---------- */}
        {screen === 'ai-aggressive-save' && aiEnabled && (
          <AggressiveAiSavePanel
            key={`ag-save-${aggressiveSaveUrl || 'empty'}`}
            initialUrl={aggressiveSaveUrl}
            autoStart={aggressiveSaveAutoStart}
            job={activeAggressiveSaveJob}
            failure={aggressiveSaveFailure}
            onBack={() => setScreen(view)}
            onSubmit={enqueueAggressiveSave}
            onClearFailure={() => setAggressiveSaveFailure(null)}
            onOpenSettings={() => setScreen('settings')}
          />
        )}

        {/* ---------- Group manage page ---------- */}
        {screen === 'groups' && <GroupManagePage onBack={() => setScreen('settings')} />}

        {/* ---------- AI 保存：右上角后台进度 + S1 成功卡 ---------- */}
        <HomeAggressiveNotices
            activeAggressiveSaveJob={activeAggressiveSaveJob}
            aggressiveSaveSuccesses={aggressiveSaveSuccesses}
            aggressiveSaveFailure={aggressiveSaveFailure}
            screen={screen}
            aggressiveSaveWaitingCount={aggressiveSaveWaitingCount}
            clearAggressiveSaveSuccessTimer={clearAggressiveSaveSuccessTimer}
            scheduleAggressiveSaveSuccessDismiss={scheduleAggressiveSaveSuccessDismiss}
            dismissAggressiveSaveSuccess={dismissAggressiveSaveSuccess}
            jumpToAggressiveSaveResult={jumpToAggressiveSaveResult}
            undoAggressiveSave={undoAggressiveSave}
            takeOverAggressiveSave={takeOverAggressiveSave}
            setAggressiveSaveFailure={setAggressiveSaveFailure}
            openAggressiveSavePanel={openAggressiveSavePanel}
            enqueueAggressiveSave={enqueueAggressiveSave}
            setScreen={setScreen}
          />

        {/* ---------- Context menu ---------- */}
        <HomeContextMenu
            ctxMenuRef={ctxMenuRef}
            ctx={ctx}
            ctxMode={ctxMode}
            ctxItem={ctxItem}
            confirmCtxDelete={confirmCtxDelete}
            closeCtx={closeCtx}
            bookmarks={bookmarks}
            openBookmarkLink={openBookmarkLink}
            useUtoolsBrowser={useUtoolsBrowser}
            openUrlInDefaultBrowser={openUrlInDefaultBrowser}
            openUrlInUtoolsBrowser={openUrlInUtoolsBrowser}
            copyBookmarkUrl={copyBookmarkUrl}
            setFormEditItem={setFormEditItem}
            setScreen={setScreen}
            requestCtxDelete={requestCtxDelete}
          />

        {/* ---------- Toast ---------- */}
        {/* 通用 toast：支持成功/错误语义，以及跳转或重新打开 AI 保存。 */}
        <HomeToast
            toastTone={toastTone}
            toastJump={toastJump}
            toastAction={toastAction}
            toastKey={toastKey}
            openNewBookmarkForm={openNewBookmarkForm}
            setToastOpen={setToastOpen}
            setAggressiveSaveAutoStart={setAggressiveSaveAutoStart}
            setScreen={setScreen}
            view={view}
            setActiveSubId={setActiveSubId}
            scrollToSection={scrollToSection}
            toastTitle={toastTitle}
            toastDesc={toastDesc}
          />
      </div>
    </div>
  )
}
