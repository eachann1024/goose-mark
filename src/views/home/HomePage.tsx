import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PinyinMatch from 'pinyin-match'
import type { Bookmark, BookmarkLocation, Group } from '@/types/bookmark'
import { flushBookmarkStorePersistence, useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import {
  useSettingsStore,
  selectAiSettings,
  WINDOW_HEIGHT_MIN,
  WINDOW_HEIGHT_MAX,
  type DetachedWindowPosition
} from '@/stores/settings'
import { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import { useUToolsMcpBridge } from '@/hooks/useUToolsMcpBridge'
import { useUTools } from '@/hooks/useUTools'
import { parseJsonImportText, importHtmlBookmarks, applyImportDataToStore } from '@/hooks/useImportExport'
import { parseHtmlBookmarks } from '@/lib/htmlBookmarkParser'
import { useBookmarkForm, useBookmarkFormStore, enqueueMetadataHydration } from '@/hooks/useBookmarkForm'
import { useUIManager } from '@/hooks/useUIManager'
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect'
import { iconToDisplayUrl } from '@/services/iconCache'
import { resolveBookmarkLaunchUrl, getTemplateLabel } from '@/lib/utils'
import { getRuntimePlatform } from '@/lib/platform'
import {
  deferInlineRenameCommit,
  handleInlineRenameEnter,
  shouldDeferListEnterShortcut,
} from '@/lib/inlineEditKeys'
import { Ico } from './icon'
import { Image } from '@/components/ui/image'
import { buildHomeGroups, trashCount, type HomeGroup, type HomeItem } from './viewModel'
import SidebarNav from './SidebarNav'
import AddBookmarkWizard from './AddBookmarkWizard'
import GroupManagePage from './GroupManagePage'
import AvatarMenu from './AvatarMenu'
import HelpAboutDialog from './HelpAboutDialog'
import StarryBackground from '@/components/StarryBackground'
import BlackHole from '@/components/BlackHole'
import { DEFAULT_AI_MODEL, AI_PROVIDER_PRESETS } from '@/constants/ai'
import { fetchCustomAIModels, getAIAvailability } from '@/lib/aiProvider'
import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'
import './home.css'

// ── SortableTab：顶栏一级分组 Tab 可拖拽单项（模块顶层，避免 TDZ）──────────
interface SortableTabProps {
  id: string
  name: string
  isActive: boolean
  onTabClick: () => void
  onTabContextMenu: (e: React.MouseEvent) => void
}

function SortableTab({ id, name, isActive, onTabClick, onTabContextMenu }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group-tab${isActive ? ' on' : ''}${isDragging ? ' dragging' : ''}`}
      onClick={onTabClick}
      onContextMenu={onTabContextMenu}
    >
      {name}
    </button>
  )
}

// ── 书签拖拽：碰撞策略（优先指针命中，空则回退到最近中心，兼顾「拖到段落空白/侧栏」与同段排序）──
const bookmarkCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  return pointerHits.length ? pointerHits : closestCenter(args)
}

// ── SecBlock：子分组段容器（droppable），让空段与段落空白区也能接收书签 ──────────
function SecBlock({
  groupId,
  subId,
  subName,
  count,
  view,
  children,
}: {
  groupId: string
  subId: string
  subName: string
  count: number
  view: 'list' | 'grid'
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `area:${groupId}:${subId}`,
    data: { type: 'sub-area', groupId, subId },
  })
  return (
    <div
      ref={setNodeRef}
      className={`sec-block${isOver ? ' drop-over' : ''}`}
      data-sec-id={`sec-${groupId}-${subId}`}
      data-sub-id={subId}
      data-view={view}
    >
      <div className="sec-head">
        <span className="g">{subName}</span>
        <span className="s">· {count}</span>
      </div>
      {children}
    </div>
  )
}

// ── SortableCard：列表视图可拖拽书签行（模块顶层，避免 TDZ）────────────────────
function SortableCard({
  item,
  groupId,
  subId,
  selected,
  onSelect,
  onOpen,
}: {
  item: HomeItem
  groupId: string
  subId: string
  selected: boolean
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'bookmark', groupId, subId, item },
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { onSelect(item.id); onOpen?.(item) }}
    >
      <BookmarkCard item={item} selected={selected} groupId={groupId} subId={subId} />
    </div>
  )
}

// ── SortableGridCell：网格视图可拖拽书签格（模块顶层，避免 TDZ）───────────────────
function SortableGridCell({
  item,
  groupId,
  subId,
  selected,
  subText,
  subClass,
  onSelect,
  onOpen,
}: {
  item: HomeItem
  groupId: string
  subId: string
  selected: boolean
  subText: string
  subClass: string
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'bookmark', groupId, subId, item },
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`gcard${selected ? ' sel' : ''}`}
      data-item-id={item.id}
      data-group-id={groupId}
      data-sub-id={subId}
      onClick={() => { onSelect(item.id); onOpen?.(item) }}
    >
      <Fav item={item} />
      <div className="ttl">{item.ttl}</div>
      {subText && <div className={subClass}>{subText}</div>}
    </div>
  )
}

// uTools 事件常量（与 preload 对齐）
const UTOOLS_PLUGIN_ENTER_EVENT = 'goose-marks:plugin-enter'
const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
const UTOOLS_INPUT_EVENT = 'goose-marks:utools-search'
const UTOOLS_SYNC_EVENT = 'goose-marks:utools-search-sync'
const UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT = 'goose-marks:restore-default-search-input'

// 运行平台：uTools 模式由顶部原生 subInput 承接搜索，页内搜索框隐藏（避免重复）。
const RUNTIME_PLATFORM = getRuntimePlatform()

// 模板/Universal 书签相关常量
const UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE = /^[\s/|:：\-—–]+/
const RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS = 1000

// 窗口模式 toggle：plugin-enter 距最近一次窗口聚焦小于该间隔时，视为本次唤起带来的聚焦（不隐藏）。
const DETACH_TOGGLE_FOCUS_GRACE_MS = 400

// 分离窗口（detach/browser）不隐藏主窗口，对齐 App.tsx 的窗口保留策略
const isDetachedUToolsWindow = () => {
  try {
    const t = window.utools?.getWindowType?.()
    return t === 'detach' || t === 'browser'
  } catch {
    return false
  }
}

type SearchSurface = 'utools-subinput' | 'inline'

const getSearchSurface = (): SearchSurface =>
  RUNTIME_PLATFORM === 'utools' && !isDetachedUToolsWindow() ? 'utools-subinput' : 'inline'

const readCurrentWindowPosition = (): DetachedWindowPosition | null => {
  const fromBridge = window.__gooseMarksWindowControl?.getPosition?.()
  if (fromBridge && Number.isFinite(fromBridge.x) && Number.isFinite(fromBridge.y)) {
    return { x: Math.round(fromBridge.x), y: Math.round(fromBridge.y) }
  }

  const x = Math.round(window.screenX)
  const y = Math.round(window.screenY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

const moveDetachedWindowTo = (position: DetachedWindowPosition | null | undefined) => {
  if (!position || !isDetachedUToolsWindow()) return
  const x = Math.round(Number(position.x))
  const y = Math.round(Number(position.y))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  if (window.__gooseMarksWindowControl?.setPosition?.({ x, y })) return
  try {
    window.moveTo?.(x, y)
  } catch { /* ignore */ }
}

// 跨窗口同步：取数据集中最大 updatedAt（对齐 App.tsx getLatestUpdatedAt）
const getLatestUpdatedAt = (data: { groups?: Group[]; bookmarks?: Bookmark[] }) => {
  let max = 0
  ;(data.groups || []).forEach((group) => {
    max = Math.max(max, group.updatedAt || group.createdAt || 0)
    group.children?.forEach((sub) => {
      max = Math.max(max, sub.updatedAt || sub.createdAt || 0)
    })
  })
  ;(data.bookmarks || []).forEach((bookmark) => {
    max = Math.max(max, bookmark.updatedAt || bookmark.createdAt || 0)
  })
  return max
}

interface UToolsPluginEnterPayload {
  code?: string
  payload?: unknown
  type?: string
}

/**
 * HomePage —— 「鹅的书签 · 配色改造预览.html」的 1:1 React 还原。
 * --------------------------------------------------------------------------
 * 严格对照设计稿 HTML 结构 + app.js 交互重写为新首页：
 *   - 顶栏：搜索框（聚焦→搜索浮层）/ 列表·网格切换 / 新增 / 设置 / 明暗
 *   - 侧栏：分组→子分组导航 + 回收站
 *   - 中栏：列表卡（分段标题）/ 网格卡
 *   - 浮层：搜索(⌘K) / 新增·编辑表单页 / 设置页 / 右键菜单 / 复制 Toast
 * 数据接真实 bookmark store（store 自带 seed 数据，非空）；
 * 业务动作（真实打开/保存/删除/AI）按要求先移除，仅保留界面交互态。
 * 明暗用根容器 data-theme 控制，配色全部来自 home.css 的独立 CSS 变量。
 */

type Screen = 'list' | 'grid' | 'add' | 'settings' | 'trash' | 'groups'
type ViewMode = 'list' | 'grid'
type Theme = 'light' | 'dark'
type ThemePref = 'light' | 'dark' | 'system'
type CtxMode = 'menu' | 'confirmDelete'

function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

interface CtxState {
  open: boolean
  x: number
  y: number
}

const HOME_CONTINUITY_KEY = 'goose-marks.home-continuity'

interface HomeContinuityState {
  searchVal: string
  activeGroupId: string
  activeSubId: string | null
  selectedId: string | null
  scrollTop: number
  updatedAt: number
}

const readHomeContinuityState = (): HomeContinuityState | null => {
  const raw = getPersistentItem(HOME_CONTINUITY_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HomeContinuityState>
    return {
      searchVal: typeof parsed.searchVal === 'string' ? parsed.searchVal : '',
      activeGroupId: typeof parsed.activeGroupId === 'string' ? parsed.activeGroupId : '',
      activeSubId: typeof parsed.activeSubId === 'string' ? parsed.activeSubId : null,
      selectedId: typeof parsed.selectedId === 'string' ? parsed.selectedId : null,
      scrollTop: Number.isFinite(Number(parsed.scrollTop)) ? Math.max(0, Number(parsed.scrollTop)) : 0,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0
    }
  } catch {
    return null
  }
}

const SET_NAV: Array<[string, string, string]> = [
  ['通用设置', 'settings', 'set-general'],
  ['列表设置', 'list', 'set-list'],
  ['网格设置', 'layout-grid', 'set-grid'],
  ['AI 助手', 'sparkles', 'set-ai'],
  ['导入与备份', 'database', 'set-data'],
  ['分组管理', 'folder', 'set-categories'],
]

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
  const { AI_QUICK_SAVE_FEATURE_CODE, FEATURE_PREFIX, syncFeatures, getEnterText } = useUTools()
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
  // enterTemplateMode 声明在后方，用 ref 间接引用避免 TDZ；所有调用点统一走本包装。
  const enterTemplateModeFnRef = useRef<(b: Bookmark) => void>(() => {})
  const openBookmarkLink = useCallback(
    (bookmark: Bookmark, options?: Parameters<typeof openBookmarkLinkBase>[1]) => {
      if (window.utools && /{[^}]+}/.test(bookmark.url) && !options?.source?.startsWith('template')) {
        enterTemplateModeFnRef.current(bookmark)
        return
      }
      openBookmarkLinkBase(bookmark, options)
    },
    [openBookmarkLinkBase]
  )

  // settings store
  const homeViewMode = useSettingsStore((s) => s.homeViewMode)
  const setHomeViewMode = useSettingsStore((s) => s.setHomeViewMode)
  const useUtoolsBrowser = useSettingsStore((s) => s.useUtoolsBrowser)
  const gridColumns = useSettingsStore((s) => s.gridColumns)
  const density = useSettingsStore((s) => s.density)
  const uiScale = useSettingsStore((s) => s.uiScale)
  const setUiScale = useSettingsStore((s) => s.setUiScale)
  const easterEggEnabled = useSettingsStore((s) => s.easterEggEnabled)
  const easterEggVariant = useSettingsStore((s) => s.easterEggVariant)
  const panelContinuous = useSettingsStore((s) => s.panelContinuous)
  // AI 设置变化键（与 App.tsx 对齐），用于触发 syncFeatures 重跑
  const aiSettingsKey = useSettingsStore((s) => `${s.aiEnabled}|${s.aiAllowLegacyUTools}|${s.aiUseCustomProvider}|${s.aiSelectedModelId}|${s.aiCustomApiKey}`)

  const homeGroups: HomeGroup[] = useMemo(
    () => buildHomeGroups(groups, bookmarks),
    [groups, bookmarks]
  )
  const trashN = useMemo(() => trashCount(groups), [groups])
  const initialContinuityRef = useRef<HomeContinuityState | null>(
    useSettingsStore.getState().panelContinuous ? readHomeContinuityState() : null
  )

  // ---- UI 状态 ----
  // 主题偏好（system/light/dark）和实际渲染主题分开存储
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    const saved = getPersistentItem('goose-marks.theme-mode', ['vueuse-color-scheme'])
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
    return 'light'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = getPersistentItem('goose-marks.theme-mode', ['vueuse-color-scheme'])
    const pref: ThemePref = (saved === 'dark' || saved === 'light' || saved === 'system') ? saved : 'light'
    return resolveTheme(pref)
  })
  // 视图：从 settings store 读取初始值
  const [view, setView] = useState<ViewMode>(() =>
    homeViewMode === 'grid' ? 'grid' : 'list'
  )
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedId, setSelectedId] = useState<string | null>(() => initialContinuityRef.current?.selectedId ?? null)
  // 书签拖拽中的项（用于 DragOverlay 跟手预览）
  const [activeDragItem, setActiveDragItem] = useState<HomeItem | null>(null)
  // 标记本次 selectedId 变更来自键盘方向键（决定滚入时居中 vs 就近，避免鼠标点击触发跳动）
  const keyboardNavRef = useRef(false)
  // 方向键节流：长按时系统 keydown repeat 频率过高会导致滚动飞快，限制每步最小间隔放慢节奏
  const lastArrowAtRef = useRef(0)
  // 平滑滚动动画句柄：长按时复用同一段缓动，新目标到来即接管，不打断
  const smoothRafRef = useRef<number | null>(null)
  const smoothScrollTo = useCallback((root: HTMLElement, target: number) => {
    if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current)
    const max = root.scrollHeight - root.clientHeight
    const to = Math.max(0, Math.min(target, max))
    const from = root.scrollTop
    const dist = to - from
    if (Math.abs(dist) < 1) {
      root.scrollTop = to
      return
    }
    // 距离越短动画越短（每步小移动 ~120ms），缓动用 easeOutCubic，跟手且不拖沓
    const dur = Math.min(180, 90 + Math.abs(dist) * 0.18)
    const startTs = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      root.scrollTop = from + dist * eased
      if (t < 1) {
        smoothRafRef.current = requestAnimationFrame(step)
      } else {
        smoothRafRef.current = null
      }
    }
    smoothRafRef.current = requestAnimationFrame(step)
  }, [])
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
  // formKey：每次点新增时递增，强制 FormPage 重挂载以确保 openAdd() 重跑
  const [formKey, setFormKey] = useState(0)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastTitle, setToastTitle] = useState('')
  const [toastKey, setToastKey] = useState(0)
  const [searchVal, setSearchVal] = useState(() => initialContinuityRef.current?.searchVal ?? '')
  // ---- 个人菜单 + 帮助弹窗 ----
  const [paOpen, setPaOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  // 模板输入态：当前处于模板输入模式的书签
  const [activeTemplateBookmark, setActiveTemplateBookmark] = useState<Bookmark | null>(null)
  const [templateQuery, setTemplateQuery] = useState('')
  const templateQueryRef = useRef('')
  // 1000ms 防重入：模板 enter 后短时间内忽略 bookmarks 主入口
  const recentDynamicTemplateEnterAtRef = useRef(0)

  // templateQueryRef 保持与 templateQuery state 同步（供 keydown handler 读取最新值）
  templateQueryRef.current = templateQuery

  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const headerSearchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  // 侧栏点击触发的程序化滚动期间抑制 scroll-spy，避免高亮闪过中间分组
  const isAnchorScrollingRef = useRef(false)
  const anchorScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRaf = useRef(0)
  const homeScrollTopRef = useRef(initialContinuityRef.current?.scrollTop ?? 0)
  const homeContinuityLatestRef = useRef({
    searchVal,
    activeSubId,
    selectedId,
    activeGroupId
  })
  homeContinuityLatestRef.current = { searchVal, activeSubId, selectedId, activeGroupId }

  const saveHomeContinuity = useCallback(() => {
    if (!useSettingsStore.getState().panelContinuous) {
      utoolsStorage.removeItem(HOME_CONTINUITY_KEY)
      return
    }

    const latest = homeContinuityLatestRef.current
    const store = useBookmarkStore.getState()
    const payload: HomeContinuityState = {
      searchVal: latest.searchVal,
      activeGroupId: latest.activeGroupId || store.activeGroupId,
      activeSubId: latest.activeSubId || store.activeSubGroupId || null,
      selectedId: latest.selectedId,
      scrollTop: homeScrollTopRef.current,
      updatedAt: Date.now()
    }
    utoolsStorage.setItem(HOME_CONTINUITY_KEY, JSON.stringify(payload))
  }, [])

  /** 网格列数：接 settings.gridColumns，键盘跳格与 CSS 列数始终一致 */
  const GRID_COLS = gridColumns

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

    requestAnimationFrame(() => {
      if (contentRef.current && Number.isFinite(saved.scrollTop)) {
        homeScrollTopRef.current = saved.scrollTop
        contentRef.current.scrollTop = saved.scrollTop
      }
    })
  }, [homeGroups, panelContinuous])

  /** 聚焦当前搜索入口并全选已有文本（方便直接覆盖输入） */
  const focusSearchInput = useCallback(() => {
    if (searchSurface === 'utools-subinput') {
      window.utools?.subInputFocus?.()
      return
    }
    requestAnimationFrame(() => {
      const el = headerSearchRef.current
      if (!el) return
      el.focus()
      el.select()
    })
  }, [searchSurface])

  // 软件打开后自动聚焦搜索入口：主面板挂载 uTools subInput，独立窗口/浏览器聚焦页内输入框。
  useEffect(() => {
    if (searchSurface === 'utools-subinput') {
      window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
      return
    }
    const timer = setTimeout(focusSearchInput, 50)
    return () => clearTimeout(timer)
  }, [focusSearchInput, searchSurface])

  // 面板内联搜索：searchVal 非空时直接过滤当前列表（保留分组段结构，空段隐藏），
  // 支持标题/链接/描述/标签 + 拼音匹配，取代原全屏搜索浮层。
  const filteredGroups = useMemo<HomeGroup[]>(() => {
    const q = searchVal.trim().toLowerCase()
    // 非搜索态：两层导航 —— 只显示当前选中的一级分组（activeGroupId 为空则回退首个）
    if (!q) {
      const current = activeGroupId
        ? homeGroups.filter((g) => g.id === activeGroupId)
        : homeGroups.slice(0, 1)
      return current.length ? current : homeGroups.slice(0, 1)
    }
    // 搜索态：跨所有一级分组全量匹配
    const match = (b: HomeItem) => {
      const haystack = [b.ttl, b.url, b.dsc, b.tags.join(' ')].join(' ').toLowerCase()
      if (haystack.includes(q)) return true
      return !!PinyinMatch.match(haystack, q)
    }
    return homeGroups
      .map((g) => ({
        ...g,
        subs: g.subs
          .map((s) => ({ ...s, items: s.items.filter(match) }))
          .filter((s) => s.items.length > 0)
      }))
      .filter((g) => g.subs.length > 0)
  }, [homeGroups, searchVal, activeGroupId])
  const isSearching = searchVal.trim().length > 0

  // 网格搜索态：全局匹配的扁平集合（按 id 去重），展示为单个无分组宫格。
  // 非搜索态网格已改为全量分组段渲染（见 GridContent），无需再算当前子分组。
  const gridSearchItems = useMemo<HomeItem[]>(() => {
    if (!isSearching) return []
    const seen = new Set<string>()
    return filteredGroups
      .flatMap((g) => g.subs.flatMap((s) => s.items))
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
  }, [isSearching, filteredGroups])

  // 当前视图下可键盘导航的扁平书签列表（基于过滤后的数据）
  // 网格与列表现已同为全量连续渲染，导航集合一致：全部分组扁平去重。
  const navigableItems = useMemo<HomeItem[]>(() => {
    const seen = new Set<string>()
    return filteredGroups
      .flatMap((g) => g.subs.flatMap((s) => s.items))
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
  }, [filteredGroups])

  // 切换视图后，若当前选中项不在可导航列表内则回退到首项
  useEffect(() => {
    if (!navigableItems.length) return
    if (!navigableItems.some((i) => i.id === selectedId)) {
      setSelectedId(navigableItems[0].id)
    }
  }, [navigableItems, selectedId])

  // 搜索词变化（含清空）：默认选中过滤结果第一项，Enter 即可直接打开
  const navigableItemsRef = useRef(navigableItems)
  navigableItemsRef.current = navigableItems
  useEffect(() => {
    setSelectedId(navigableItemsRef.current[0]?.id ?? null)
  }, [searchVal])

  // 当 themePref 为 system 时，监听系统颜色方案变化并同步 theme
  useEffect(() => {
    if (themePref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themePref])

  // 同步 .dark class 到 documentElement，让 Tailwind token（index.css 第 83 行）在深色模式下生效
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const eggOn = theme === 'dark' && easterEggEnabled
    const rootEl = document.getElementById('root')
    if (RUNTIME_PLATFORM === 'utools') {
      const bg = eggOn ? 'transparent' : theme === 'dark' ? '#262624' : '#faf9f5'
      const fg = theme === 'dark' ? '#faf9f5' : '#1f1e1d'
      document.body.style.backgroundColor = bg
      document.body.style.color = fg
      document.documentElement.style.backgroundColor = bg
      if (rootEl) rootEl.style.backgroundColor = eggOn ? 'transparent' : ''
      return
    }
    if (eggOn) {
      document.body.style.backgroundColor = 'transparent'
      document.documentElement.style.backgroundColor = 'transparent'
      if (rootEl) rootEl.style.backgroundColor = 'transparent'
    } else {
      document.body.style.backgroundColor = ''
      document.documentElement.style.backgroundColor = ''
      if (rootEl) rootEl.style.backgroundColor = ''
    }
  }, [theme, easterEggEnabled])

  // uTools 默认窗口偏矮（plugin.json 560）；收集向导内容高，临时拉高避免底部裁切（离开 add 恢复用户设置）
  const utoolsWizardHeightRef = useRef<number | null>(null)
  useEffect(() => {
    if (RUNTIME_PLATFORM !== 'utools' || typeof window.utools?.setExpendHeight !== 'function') return
    if (screen === 'add') {
      const stored = useSettingsStore.getState().windowHeight
      const target = Math.max(stored, 680)
      if (utoolsWizardHeightRef.current === null) utoolsWizardHeightRef.current = stored
      try {
        window.utools.setExpendHeight(target)
      } catch { /* ignore */ }
      return
    }
    if (utoolsWizardHeightRef.current !== null) {
      const restore = utoolsWizardHeightRef.current
      utoolsWizardHeightRef.current = null
      try {
        window.utools.setExpendHeight(restore)
      } catch { /* ignore */ }
    }
  }, [screen])

  /**
   * 统一搜索值更新入口：setSearchVal 并在 uTools 环境下把值同步到 subInput。
   * fromSubInput=true 时跳过 subInput 同步（避免回环）。
   * 注意：必须定义在 clearSearch / applySearchValRef 等引用点之前（const TDZ）。
   */
  const applySearchVal = useCallback((text: string, fromSubInput = false) => {
    setSearchVal(text)
    if (searchSurface === 'utools-subinput' && !fromSubInput) {
      window.dispatchEvent(new CustomEvent(UTOOLS_SYNC_EVENT, { detail: { text } }))
    }
  }, [searchSurface])

  // ---- 工具：清空面板内联搜索 ----
  const clearSearch = useCallback(() => {
    applySearchVal('')
  }, [applySearchVal])

  const initialSearchSyncedRef = useRef(false)
  useEffect(() => {
    if (initialSearchSyncedRef.current) return
    initialSearchSyncedRef.current = true
    if (panelContinuous && searchVal) applySearchVal(searchVal)
  }, [applySearchVal, panelContinuous, searchVal])

  useEffect(() => {
    if (!panelContinuous) utoolsStorage.removeItem(HOME_CONTINUITY_KEY)
  }, [panelContinuous])

  useEffect(() => {
    if (!panelContinuous) return
    const timer = window.setTimeout(saveHomeContinuity, 250)
    return () => window.clearTimeout(timer)
  }, [activeGroupId, activeSubId, panelContinuous, saveHomeContinuity, searchVal, selectedId])

  useEffect(() => {
    const save = () => saveHomeContinuity()
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') save()
    }

    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, save)
    window.addEventListener('pagehide', save)
    window.addEventListener('beforeunload', save)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      save()
      window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, save)
      window.removeEventListener('pagehide', save)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  }, [saveHomeContinuity])

  useEffect(() => {
    if (!panelContinuous || (screen !== 'list' && screen !== 'grid')) return
    const root = contentRef.current
    if (!root) return
    let timer: number | undefined
    const saveSoon = () => {
      homeScrollTopRef.current = root.scrollTop
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(saveHomeContinuity, 300)
    }
    root.addEventListener('scroll', saveSoon, { passive: true })
    return () => {
      if (timer) window.clearTimeout(timer)
      root.removeEventListener('scroll', saveSoon)
    }
  }, [panelContinuous, saveHomeContinuity, screen])

  // ---- 一级分组 Tab：切换当前分组（同步 store，首个子分组自动选中）----
  const changeActiveGroup = useCallback((groupId: string) => {
    setCtx((c) => (c.open ? { ...c, open: false } : c))
    setCtxMode('menu')
    if (screen === 'trash' || screen === 'settings') setScreen(view)
    setActiveGroup(groupId)
  }, [screen, view, setActiveGroup])

  // ---- 顶栏 Tab 拖拽排序（distance:5 保证点击/右键不被误判为拖拽）----
  const tabSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // 书签 / 侧栏子分组统一拖拽 sensors：MouseSensor + TouchSensor（dnd-kit 推荐的更兼容组合，
  // 鼠标/触摸都稳；distance:8 比点击略大，避免「点开书签」被误判为拖拽；触摸长按 180ms 起拖、避免与滚动冲突）
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  )

  const handleTabDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = homeGroups.findIndex((g) => g.id === active.id)
    const newIndex = homeGroups.findIndex((g) => g.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    // 用 arrayMove 算出视图模型新顺序，再映射回 raw groups（剔除回收站/已删除）
    const newHomeGroups = arrayMove(homeGroups, oldIndex, newIndex)
    const rawGroups = useBookmarkStore.getState().groups.filter((g) => g.id !== TRASH_GROUP_ID && !g.isDeleted)
    const newRaw = newHomeGroups.map((hg) => rawGroups.find((rg) => rg.id === hg.id)!).filter(Boolean)
    reorderGroups(newRaw)
  }, [homeGroups, reorderGroups])

  // ---- 一级 Tab 右键菜单：重命名 / 删除 ----
  const [tabCtx, setTabCtx] = useState<{ open: boolean; x: number; y: number; groupId: string }>({ open: false, x: 0, y: 0, groupId: '' })
  const [tabRenaming, setTabRenaming] = useState<string | null>(null)
  const [tabRenameVal, setTabRenameVal] = useState('')
  const tabMenuRef = useRef<HTMLDivElement>(null)
  const tabRenameRef = useRef<HTMLInputElement>(null)

  // ---- 新建主分组：顶栏 Tab 末尾 + → 就地内联输入 ----
  const [tabAdding, setTabAdding] = useState(false)
  const [tabAddVal, setTabAddVal] = useState('')
  const tabAddRef = useRef<HTMLInputElement>(null)

  const startTabAdd = useCallback(() => {
    setTabAdding(true)
    setTabAddVal('')
    requestAnimationFrame(() => tabAddRef.current?.focus())
  }, [])

  const commitTabAdd = useCallback(() => {
    if (!tabAdding) return
    const name = tabAddVal.trim()
    if (name) {
      const g = addGroup(name) // addGroup 内部已切到新分组并选中首个子分组
      if (screen === 'trash' || screen === 'settings') setScreen(view)
      if (isSearching) clearSearch()
      void g
    }
    setTabAdding(false)
  }, [tabAdding, tabAddVal, addGroup, screen, view, isSearching, clearSearch])

  const openTabCtx = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const menuW = 180
    const left = Math.min(e.clientX, window.innerWidth - menuW - 8)
    setTabCtx({ open: true, x: Math.max(8, left), y: e.clientY + 4, groupId })
  }, [])
  const closeTabCtx = useCallback(() => setTabCtx((c) => (c.open ? { ...c, open: false } : c)), [])

  const startTabRename = useCallback((groupId: string) => {
    const g = homeGroups.find((x) => x.id === groupId)
    if (!g) return
    setTabRenaming(groupId)
    setTabRenameVal(g.name)
    closeTabCtx()
    requestAnimationFrame(() => { tabRenameRef.current?.focus(); tabRenameRef.current?.select() })
  }, [homeGroups, closeTabCtx])

  const commitTabRename = useCallback(() => {
    if (!tabRenaming) return
    const name = tabRenameVal.trim()
    if (name) updateGroup(tabRenaming, name)
    setTabRenaming(null)
  }, [tabRenaming, tabRenameVal, updateGroup])

  const deleteTabGroup = useCallback((groupId: string) => {
    const g = homeGroups.find((x) => x.id === groupId)
    if (!g) return
    if (!window.confirm(`确定删除分组「${g.name}」？组内书签将移入回收站。`)) return
    removeGroup(groupId)
    closeTabCtx()
  }, [homeGroups, removeGroup, closeTabCtx])

  // 点击空白 / Esc 关闭 Tab 右键菜单
  useEffect(() => {
    if (!tabCtx.open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.tab-ctx-menu')) closeTabCtx()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTabCtx() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [tabCtx.open, closeTabCtx])


  // ---- 交互：统一主题偏好入口（持久化到 utools storage） ----
  const applyThemePref = useCallback((pref: ThemePref) => {
    setThemePref(pref)
    setTheme(resolveTheme(pref))
    utoolsStorage.setItem('goose-marks.theme-mode', pref)
  }, [])

  // ---- 交互：列表/网格切换（设计稿 setView，同步持久化到 settings store） ----
  const changeView = useCallback(
    (v: ViewMode) => {
      setView(v)
      setHomeViewMode(v)
      // 书签视图内切换布局；回收站下点视图切换视为「回到书签视图」。
      // 搜索/设置/表单态下不切走（避免误关浮层丢状态）。
      setScreen((prev) => (prev === 'list' || prev === 'grid' || prev === 'trash' ? v : prev))
      // 网格与列表现已同为全量连续渲染，导航集合一致，无需再收敛回首组
      // 切换布局后聚焦当前搜索入口
      focusSearchInput()
    },
    [setHomeViewMode, focusSearchInput]
  )

  // ---- 交互：右键菜单（记录被右键的书签项及精确位置） ----
  const openCtx = useCallback((e: React.MouseEvent) => {
    const card = (e.target as HTMLElement).closest('.card,.gcard') as HTMLElement | null
    if (!card) return
    e.preventDefault()
    const root = rootRef.current
    if (!root) return
    // 从被右键的卡片中找 item id，反查 homeGroups 得到 HomeItem
    const itemId = card.dataset.itemId
    if (itemId) {
      let found: HomeItem | null = null
      let foundGroupId: string | null = card.dataset.groupId ?? null
      let foundSubId: string | null = card.dataset.subId ?? null
      outer: for (const g of homeGroups) {
        for (const s of g.subs) {
          const hit = s.items.find((b) => b.id === itemId)
          if (hit) {
            found = hit
            // 若 DOM 属性存在则优先使用，否则用遍历到的第一个位置
            if (!foundGroupId) foundGroupId = g.id
            if (!foundSubId) foundSubId = s.id
            break outer
          }
        }
      }
      setCtxItem(found)
      setCtxLocation(
        foundGroupId && foundSubId
          ? { groupId: foundGroupId, subGroupId: foundSubId }
          : null
      )
    }
    const r = root.getBoundingClientRect()
    const menuW = ctxMenuRef.current?.offsetWidth || 200
    let left = e.clientX - r.left
    let top = e.clientY - r.top
    left = Math.min(left, r.width - menuW - 12)
    top = Math.min(top, r.height - 250)
    setCtxMode('menu')
    setCtx({ open: true, x: Math.max(8, left), y: Math.max(8, top) })
  }, [homeGroups])
  const closeCtx = useCallback(() => {
    setCtx((c) => (c.open ? { ...c, open: false } : c))
    setCtxMode('menu')
  }, [])

  const requestCtxDelete = useCallback(() => {
    if (ctxItem) setCtxMode('confirmDelete')
  }, [ctxItem])

  const confirmCtxDelete = useCallback(() => {
    if (!ctxItem) return
    const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
    closeCtx()
    if (realBookmark) handleRemove(realBookmark, ctxLocation ?? undefined)
  }, [bookmarks, closeCtx, ctxItem, ctxLocation, handleRemove])

  // fireToast 的稳定引用，供 plugin-enter effect 使用（声明在 fireToast 之前）
  const fireToastRef = useRef<(title?: string) => void>(() => {})

  // ---- 交互：复制 → Toast ----
  // 用自增 toastKey 作为 Toast 元素 key：每次复制都强制重新挂载，CSS 飞入动画必从头重放
  // （比依赖 DOM reflow 更可靠，且符合 React 范式；连续复制也能看到动画重播）。
  const fireToast = useCallback(
    (title?: string) => {
      closeCtx()
      setToastTitle(title || '')
      setToastKey((k) => k + 1)
      setToastOpen(true)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToastOpen(false), 2600)
    },
    [closeCtx]
  )
  // 保持 fireToastRef 与最新 fireToast 同步（供 plugin-enter effect 引用）
  fireToastRef.current = fireToast

  // ---- 统一拖拽：书签卡片（列表/网格）+ 侧栏子分组共用一个 DndContext ----
  // onDragStart：记录被拖书签，供 DragOverlay 跟手预览（子分组拖拽不需要 overlay）
  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; item?: HomeItem } | undefined
    if (data?.type === 'bookmark' && data.item) setActiveDragItem(data.item)
  }, [])

  // onDragEnd：按 active.type 分流 —— 子分组排序 / 书签排序 / 书签跨子分组移动
  const handleDndDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragItem(null)
    const { active, over } = event
    if (!over) return
    const a = active.data.current as { type?: string; groupId?: string; subId?: string } | undefined
    const o = over.data.current as { type?: string; groupId?: string; subId?: string } | undefined
    if (!a) return

    // 1) 侧栏子分组排序（active 与 over 都是子分组，同一一级分组内）
    if (a.type === 'sub') {
      if (o?.type !== 'sub' || o.groupId !== a.groupId || active.id === over.id) return
      const group = homeGroups.find((g) => g.id === a.groupId)
      if (!group) return
      const oldIdx = group.subs.findIndex((s) => s.id === active.id)
      const newIdx = group.subs.findIndex((s) => s.id === over.id)
      if (oldIdx < 0 || newIdx < 0) return
      const newOrder = arrayMove(group.subs, oldIdx, newIdx)
      const rawGroup = useBookmarkStore.getState().groups.find((rg) => rg.id === group.id)
      if (!rawGroup) return
      const rawChildren = rawGroup.children.filter((c) => !c.isDeleted)
      const newRaw = newOrder.map((hs) => rawChildren.find((rc) => rc.id === hs.id)!).filter(Boolean)
      reorderSubGroups(group.id, newRaw)
      return
    }

    // 2) 书签拖拽：先解析落点所属子分组
    if (a.type !== 'bookmark' || !a.groupId || !a.subId) return
    let toGroupId: string | undefined
    let toSubId: string | undefined
    let overBookmarkId: string | undefined
    if (o?.type === 'bookmark') {
      toGroupId = o.groupId
      toSubId = o.subId
      overBookmarkId = String(over.id)
    } else if (o?.type === 'sub') {
      // 落到侧栏子分组项：over.id 即目标子分组 id
      toGroupId = o.groupId
      toSubId = String(over.id)
    } else if (o?.type === 'sub-area') {
      // 落到内容区某子分组段（含空段/段落空白）
      toGroupId = o.groupId
      toSubId = o.subId
    }
    if (!toGroupId || !toSubId) return

    if (a.groupId === toGroupId && a.subId === toSubId) {
      // 同子分组内排序（仅当落在另一张卡片上）
      if (overBookmarkId && active.id !== over.id) {
        reorderInSub(a.groupId, a.subId, String(active.id), overBookmarkId)
      }
      return
    }
    // 跨子分组移动
    const ok = moveBookmarkToSubGroup(String(active.id), a.groupId, a.subId, toGroupId, toSubId)
    if (ok) fireToast('已移动')
  }, [homeGroups, reorderSubGroups, reorderInSub, moveBookmarkToSubGroup, fireToast])

  // 选中项变化时滚入可视区域
  useEffect(() => {
    if (screen !== 'list' && screen !== 'grid') return
    if (!selectedId) return
    const root = contentRef.current
    if (!root) return
    const sel = root.querySelector<HTMLElement>(`[data-item-id="${selectedId}"]`)
    if (!sel) return
    if (keyboardNavRef.current) {
      // 键盘方向键导航：把选中项滚到容器正中。
      // 用 rAF 自写缓动平滑跟随——长按连续触发时每次取消上一段动画、从当前 scrollTop 重新缓动到新目标，
      // 既不会像原生 smooth 那样相互打断卡顿，也不像瞬时 auto 那样硬跳，整体连贯流畅。
      keyboardNavRef.current = false
      const rRect = root.getBoundingClientRect()
      const sRect = sel.getBoundingClientRect()
      const delta = (sRect.top - rRect.top) - (root.clientHeight - sRect.height) / 2
      smoothScrollTo(root, root.scrollTop + delta)
    } else {
      // 鼠标点击等其他来源：就近滚入即可（避免页面跳动）
      sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedId, screen, view, smoothScrollTo])

  const syncSidebarForItem = useCallback(
    (itemId: string) => {
      for (const g of homeGroups) {
        for (const s of g.subs) {
          if (s.items.some((b) => b.id === itemId)) {
            // 键盘导航跨到新子分组时才居中（同一子分组内移动不触发，频率天然很低、不抖）
            setActiveSubId((prev) => {
              if (prev !== s.id) centerSidebar()
              return s.id
            })
            return
          }
        }
      }
    },
    [homeGroups, centerSidebar]
  )

  // ---- 侧栏 → 内容区锚点滚动：点击子分组滚到对应分组段 ----
  // setTimeout(0) 等 React 提交完成（清空搜索 / 从回收站切回后段落才存在），再做平滑滚动；
  // 滚动期间抑制 scroll-spy，避免高亮闪过中间分组。
  const scrollToSection = useCallback((groupId: string, subId: string) => {
    window.setTimeout(() => {
      const root = contentRef.current
      if (!root) return
      const el = root.querySelector<HTMLElement>(`[data-sec-id="sec-${groupId}-${subId}"]`)
      if (!el) return
      isAnchorScrollingRef.current = true
      if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
      cancelAnimationFrame(anchorRaf.current)
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
      root.scrollTo({ top: Math.max(0, top - 4), behavior: 'auto' })
      // 抑制 scroll-spy 直到 smooth 动画真正停下（连续若干帧 scrollTop 不变）。
      // 固定超时会在动画末尾解除，恰好放过最后一次 scroll 事件 → 触底兜底逻辑误把高亮改成末段。
      let last = -1
      let still = 0
      const release = () => { isAnchorScrollingRef.current = false }
      const settle = () => {
        const cur = Math.round(root.scrollTop)
        if (cur === last) {
          if (++still >= 3) { release(); return }
        } else {
          still = 0
          last = cur
        }
        anchorRaf.current = requestAnimationFrame(settle)
      }
      anchorRaf.current = requestAnimationFrame(settle)
      // 硬超时兜底：万一 rAF 被冻结（页面离屏等），1.2s 后强制解除抑制，避免 scroll-spy 永久失灵
      if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
      anchorScrollTimer.current = setTimeout(release, 1200)
    }, 0)
  }, [])
  useEffect(() => () => {
    if (anchorScrollTimer.current) clearTimeout(anchorScrollTimer.current)
    cancelAnimationFrame(anchorRaf.current)
  }, [])

  // ---- 工具：返回书签列表视图（供 FormPage/TrashPage 返回用） ----
  // jump 非空（保存成功）时跳到书签落地的分组/子分组：store.selectGroup 已切一级分组，
  // 这里再同步本地 activeSubId（侧栏高亮）并滚动到对应分组段。
  const backToList = useCallback((jump?: BookmarkLocation) => {
    setScreen(view)
    if (jump) {
      setActiveSubId(jump.subGroupId)
      if (view === 'list' || view === 'grid') scrollToSection(jump.groupId, jump.subGroupId)
    }
  }, [view, scrollToSection])

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

  // ---- 全局键盘：Esc / ⌘K / 方向键导航 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 保存中：禁止 Esc 关闭表单（问题4）
        if (useBookmarkFormStore.getState().isSaving) return
        // 退出 add 表单时统一走关闭逻辑（问题2）
        if (screen === 'add') useBookmarkFormStore.getState().set({ showAdd: false })
        if (screen === 'add' || screen === 'settings' || screen === 'trash' || screen === 'groups') {
          setScreen(view)
          closeCtx()
          return
        }
        // 列表态：Esc 优先清空内联搜索，其次让搜索框失焦
        if (searchVal) {
          clearSearch()
          closeCtx()
          return
        }
        if (document.activeElement === headerSearchRef.current) headerSearchRef.current?.blur()
        closeCtx()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // 表单页（add/edit）正在编辑时忽略 Cmd+K，避免未保存草稿被卸载
        if (screen === 'add') return
        e.preventDefault()
        focusSearchInput()
        return
      }

      const active = document.activeElement as HTMLElement | null
      const inEditable =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)

      if (screen !== 'list' && screen !== 'grid') return
      if (ctx.open) return

      // Enter：打开当前选中书签。无论焦点在顶栏搜索框、列表区还是无焦点（鼠标点击 / 方向键
      // 选中后焦点落在 body），都应直接打开；仅当焦点落在「搜索框以外」的其它输入控件时才放行给它。
      if (e.key === 'Enter') {
        if (shouldDeferListEnterShortcut(e, headerSearchRef.current)) return
        const hit = navigableItems.find((i) => i.id === selectedId) ?? navigableItems[0]
        if (hit) {
          e.preventDefault()
          const realBookmark = bookmarks.find((b) => b.id === hit.id)
          if (realBookmark) openBookmarkLink(realBookmark)
        }
        return
      }

      const isArrowKey =
        e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (inEditable && active === headerSearchRef.current) {
        // 顶栏搜索框聚焦：字符正常键入（内联过滤）；方向键放行到下方导航
        if (!isArrowKey) return
        // 方向键：落到下方导航逻辑
      } else if (inEditable) {
        return
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && e.key !== ' ') {
        // 列表区直接键入字符 → 聚焦顶栏搜索框接管输入（type-to-search）
        e.preventDefault()
        applySearchValRef.current(searchVal + e.key)
        headerSearchRef.current?.focus()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const items = navigableItems
      if (!items.length) return

      let idx = items.findIndex((i) => i.id === selectedId)
      if (idx < 0) idx = 0

      const total = items.length
      const isGrid = view === 'grid'
      let newIdx = idx

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          newIdx = Math.min(idx + (isGrid ? GRID_COLS : 1), total - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          newIdx = Math.max(idx - (isGrid ? GRID_COLS : 1), 0)
          break
        case 'ArrowRight':
          if (!isGrid) return
          e.preventDefault()
          newIdx = Math.min(idx + 1, total - 1)
          break
        case 'ArrowLeft':
          if (!isGrid) return
          e.preventDefault()
          newIdx = Math.max(idx - 1, 0)
          break
        default:
          return
      }

      if (newIdx === idx) return
      // 长按方向键节流：系统 keydown repeat 频率很高（常 30+/s），会让选中项飞快掠过。
      // 限制每步最小间隔，把节奏压到 ~10/s，配合平滑滚动手感更稳。e.repeat 为 false（首次按下）时不节流，保证即时响应。
      if (e.repeat) {
        const now = performance.now()
        if (now - lastArrowAtRef.current < 95) return
        lastArrowAtRef.current = now
      } else {
        lastArrowAtRef.current = performance.now()
      }
      const next = items[newIdx]
      if (!next) return
      // 键盘导航期间给根元素打标记，CSS 据此禁用 :hover，避免鼠标停留处卡片一直高亮
      rootRef.current?.classList.add('kbd-nav')
      keyboardNavRef.current = true
      setSelectedId(next.id)
      if (!isGrid) syncSidebarForItem(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    view,
    screen,
    ctx.open,
    closeCtx,
    navigableItems,
    selectedId,
    syncSidebarForItem,
    GRID_COLS,
    bookmarks,
    openBookmarkLink,
    searchVal,
    clearSearch,
    focusSearchInput
  ])

  // ---- 全局点击：点空白关闭右键菜单 ----
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ctx-menu')) closeCtx()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [closeCtx])

  // ---- 真实鼠标移动时解除键盘导航态，恢复 hover ----
  // 键盘滚动在 macOS 下不会合成 mousemove，所以只有用户真正动鼠标才会触发；
  // 但程序化滚动可能因指针相对页面位移而产生 mousemove，故用坐标变化做二次确认，避免误清。
  useEffect(() => {
    let lastX = -1
    let lastY = -1
    const onMove = (e: MouseEvent) => {
      if (e.clientX === lastX && e.clientY === lastY) return
      lastX = e.clientX
      lastY = e.clientY
      rootRef.current?.classList.remove('kbd-nav')
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => () => {
    if (setScrollTimeout.current) clearTimeout(setScrollTimeout.current)
    if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current)
  }, [])

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

  // ---- 模板书签输入态 ----
  // uTools subInput 已整体下线，模板参数改由页面内横幅输入框（tpl-banner）承接。
  const enterTemplateMode = useCallback((bookmark: Bookmark) => {
    setActiveTemplateBookmark(bookmark)
    activeTemplateBookmarkRef.current = bookmark
    setTemplateQuery('')
    templateQueryRef.current = ''
    // 关闭可能打开的表单 / 清空搜索，回到主视图
    useBookmarkFormStore.getState().set({ showAdd: false })
    applySearchVal('')
    setScreen((prev) => (prev === 'add' ? view : prev))
  }, [view, applySearchVal])
  // 供前方 openBookmarkLink 包装通过 ref 调用（避免声明顺序 TDZ）
  enterTemplateModeFnRef.current = enterTemplateMode

  const exitTemplateMode = useCallback(() => {
    setActiveTemplateBookmark(null)
    activeTemplateBookmarkRef.current = null
    setTemplateQuery('')
    templateQueryRef.current = ''
  }, [])
  const exitTemplateModeRef = useRef(exitTemplateMode)
  exitTemplateModeRef.current = exitTemplateMode

  const executeTemplateSearch = useCallback(() => {
    const bookmark = activeTemplateBookmarkRef.current
    if (!bookmark) return
    const query = templateQueryRef.current.trim()
    if (!query) return
    let url = bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query))
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    fireToastRef.current('正在打开…')
    openUrl(url)
    // openUrl 内部已处理 autoCloseWindow / outPlugin；非自动关闭时收起主窗口并退出模板态
    if (!isDetachedUToolsWindow()) { try { window.utools?.hideMainWindow?.() } catch { /* ignore */ } }
    exitTemplateModeRef.current()
  }, [openUrl])
  const executeTemplateSearchRef = useRef(executeTemplateSearch)
  executeTemplateSearchRef.current = executeTemplateSearch

  // 模板态键盘：Enter 执行 / Esc 退出（独立监听，优先于全局键盘逻辑）
  useEffect(() => {
    if (!activeTemplateBookmark) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        executeTemplateSearchRef.current()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        exitTemplateModeRef.current()
      }
    }
    // capture 阶段注册，先于全局 keydown 处理
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activeTemplateBookmark])

  // universal 书签匹配：payload 文本「标题 + 分隔符 + 关键词」→ 命中 allowUniversal 书签
  const findUniversalBookmarkMatch = useCallback((payloadText: string): { bookmark: Bookmark; query: string; exact: boolean } | null => {
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

  // 窗口模式 toggle 所需：记录窗口最近一次获得焦点的时间（blur 清零）。
  // uTools 唤起分离窗口时会先聚焦再发 plugin-enter，document.hasFocus() 彼时必为 true，
  // 单看它无法区分「快捷键唤起聚焦」与「窗口原本就激活时再次按下」，需配合该时间戳判断。
  const lastWindowFocusAtRef = useRef(document.hasFocus() ? Date.now() : 0)
  useEffect(() => {
    const onFocus = () => { lastWindowFocusAtRef.current = Date.now() }
    const onBlur = () => { lastWindowFocusAtRef.current = 0 }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const lastDetachedWindowPositionKeyRef = useRef('')
  const saveDetachedWindowPosition = useCallback(() => {
    if (!isDetachedUToolsWindow()) return
    const position = readCurrentWindowPosition()
    if (!position) return
    const key = `${position.x},${position.y}`
    if (key === lastDetachedWindowPositionKeyRef.current) return
    lastDetachedWindowPositionKeyRef.current = key
    useSettingsStore.getState().setDetachedWindowPosition(position)
  }, [])

  useEffect(() => {
    if (!window.utools) return

    const restore = () => {
      const position = useSettingsStore.getState().detachedWindowPosition
      window.setTimeout(() => moveDetachedWindowTo(position), 0)
      window.setTimeout(() => moveDetachedWindowTo(position), 120)
    }
    const save = () => saveDetachedWindowPosition()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save()
    }

    restore()
    const saveTimer = window.setInterval(save, 1000)
    window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, restore)
    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, save)
    window.addEventListener('blur', save)
    window.addEventListener('beforeunload', save)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(saveTimer)
      save()
      window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, restore)
      window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, save)
      window.removeEventListener('blur', save)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [saveDetachedWindowPosition])

  // 3.【致命】plugin-enter 事件：处理 bookmarks / quick_save / ai_quick_save / bm_tpl: 功能码
  // handler 用 ref 包裹，保持监听器长生命周期的同时始终调用最新逻辑
  const pluginEnterHandlerRef = useRef<(e: Event) => void>(() => {})
  pluginEnterHandlerRef.current = (e: Event) => {
    const rawDetail = (e as CustomEvent<UToolsPluginEnterPayload & { params?: unknown }>).detail
    // preload 可能包一层 { params }（对齐 App.tsx getUToolsPluginEnterParams）
    const params: UToolsPluginEnterPayload =
      rawDetail && typeof rawDetail === 'object' && rawDetail.params && typeof rawDetail.params === 'object'
        ? (rawDetail.params as UToolsPluginEnterPayload)
        : (rawDetail ?? {})
    const code = params?.code
    const enterType = typeof params?.type === 'string' ? params.type : ''
    const payloadText = getEnterText(params?.payload).trim()
    const isTemplateFeature = typeof code === 'string' && code.startsWith(FEATURE_PREFIX)
    const store = useBookmarkStore.getState()

    // ---- quick_save / ai_quick_save：保存当前网址 ----
    if (code === 'quick_save' || code === AI_QUICK_SAVE_FEATURE_CODE) {
      let urlToSave = ''
      const payload = params?.payload
      if (typeof payload === 'string') urlToSave = payload.trim()
      else if (payload && typeof payload === 'object' && 'text' in payload) {
        urlToSave = String((payload as { text: unknown }).text).trim()
      }
      // 无 payload（主入口直接执行）：读取当前浏览器页面 URL（对齐 App.tsx:949-956）
      if (!urlToSave) {
        void (async () => {
          try {
            const utoolsApi = window.utools as unknown as { readCurrentBrowserUrl?: () => Promise<string> } | undefined
            if (typeof utoolsApi?.readCurrentBrowserUrl === 'function') {
              const browserUrl = (await utoolsApi.readCurrentBrowserUrl()).trim()
              if (browserUrl) {
                // 重新走同一处理器，带上拿到的 URL
                pluginEnterHandlerRef.current({ detail: { code, payload: browserUrl } } as unknown as Event)
                return
              }
            }
          } catch (err) {
            console.warn('[quick_save] 获取浏览器 URL 失败:', err)
          }
          // 兜底：打开新增表单手动填写
          setFormEditItem(null)
          setFormKey((k) => k + 1)
          setScreen('add')
          fireToastRef.current('未检测到有效链接，请手动填写')
        })()
        return
      }
      // URL 校验三段分类：
      //   1. 带 ://（http/https 之外拒绝）；2. 形如 scheme: 但非 host:port 拒绝；3. 无 scheme 补 https://
      //   用例：example.com:8080 ✓、localhost:3000 ✓、ftp://x ✗、mailto:a@b.c ✗、data:text/html ✗、javascript:alert(1) ✗
      const normalizeQuickUrl = (raw: string): string | null => {
        if (!raw) return null
        try {
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
            const u = new URL(raw)
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
            return raw
          }
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) && !/^[a-zA-Z0-9.-]+:\d+([/?#]|$)/.test(raw)) {
            return null
          }
          const normalized = `https://${raw}`
          new URL(normalized)
          return normalized
        } catch { return null }
      }
      const finalUrl = normalizeQuickUrl(urlToSave)
      if (finalUrl) {
        const bookmark = store.quickSaveBookmark(finalUrl)
        // 复用表单的后台元信息水合：快存先即时落库（标题以 URL 兜底显示），随后抓取真实
        // 标题/简介补全；ai_quick_save 变体追加 AI 整理（AI 不可用时自动降级为仅抓取）。
        // 仅新建（标题为空）时触发，去重命中的既有书签不重复抓取。
        if (!bookmark.title) {
          enqueueMetadataHydration(bookmark.id, {
            url: finalUrl,
            initialTitle: '',
            initialDesc: '',
            forceAi: code === AI_QUICK_SAVE_FEATURE_CODE
          })
        }
        fireToastRef.current(`已保存：${bookmark.title || urlToSave}`)
        void flushBookmarkStorePersistence().finally(() => window.utools?.outPlugin())
      } else {
        // 无有效 URL：打开新增表单作为兜底（对齐旧版 QuickSaveDialog 的意图）
        setFormEditItem(null)
        setFormKey((k) => k + 1)
        setScreen('add')
        fireToastRef.current('未检测到有效链接，请手动填写')
      }
      return
    }

    // ---- bm_tpl:<bookmarkId>：模板书签快捷入口 ----
    if (isTemplateFeature) {
      const id = (code as string).slice(FEATURE_PREFIX.length)
      const bookmark = store.bookmarks.find((b) => b.id === id)
      if (!bookmark) {
        window.utools?.outPlugin()
        return
      }
      const hasTemplate = /{[^}]+}/.test(bookmark.url)
      const isInTemplateMode = activeTemplateBookmarkRef.current?.id === id
      const query = isInTemplateMode ? templateQueryRef.current.trim() : payloadText

      if (hasTemplate) {
        // 无关键词（或仅书签标题本身）时进入模板输入态，等待用户键入参数
        const shouldEnterTemplateMode =
          enterType === 'over'
            ? !payloadText && !isInTemplateMode
            : (!payloadText || payloadText === bookmark.title) && !isInTemplateMode
        if (shouldEnterTemplateMode) {
          recentDynamicTemplateEnterAtRef.current = Date.now()
          enterTemplateMode(bookmark)
          return
        }
      }

      let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      fireToastRef.current('正在打开…')
      openUrl(url)
      if (!isDetachedUToolsWindow()) { try { window.utools?.hideMainWindow?.() } catch { /* ignore */ } }
      if (activeTemplateBookmarkRef.current) exitTemplateModeRef.current()
      recentDynamicTemplateEnterAtRef.current = Date.now()
      return
    }

    // ---- bookmarks：默认入口 ----
    if (code === 'bookmarks') {
      // universal 书签匹配：payload「标题 关键词」直达
      if (payloadText) {
        const match = findUniversalBookmarkMatch(payloadText)
        if (match) {
          recentDynamicTemplateEnterAtRef.current = Date.now()
          if (match.exact && /{[^}]+}/.test(match.bookmark.url)) {
            enterTemplateMode(match.bookmark)
            return
          }
          const resolvedUrl = resolveBookmarkLaunchUrl(match.bookmark.url, match.query)
          if (resolvedUrl) {
            fireToastRef.current('正在打开…')
            openUrl(resolvedUrl)
            if (!isDetachedUToolsWindow()) { try { window.utools?.hideMainWindow?.() } catch { /* ignore */ } }
            return
          }
        }
      }
      // bm_tpl 进入后 1s 内 uTools 会补发一次 bookmarks code，忽略避免打断模板态
      if (
        recentDynamicTemplateEnterAtRef.current > 0 &&
        Date.now() - recentDynamicTemplateEnterAtRef.current <= RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS
      ) {
        recentDynamicTemplateEnterAtRef.current = 0
        return
      }
      // 窗口模式 toggle：分离窗口在按下快捷键前就处于激活状态 → 再次唤起视为「收起」，关闭窗口。
      // lastWindowFocusAtRef 距今足够久才算「原本就激活」，刚被唤起聚焦（间隔极短）不触发
      if (
        isDetachedUToolsWindow() &&
        document.hasFocus() &&
        lastWindowFocusAtRef.current > 0 &&
        Date.now() - lastWindowFocusAtRef.current > DETACH_TOGGLE_FOCUS_GRACE_MS
      ) {
        if (activeTemplateBookmarkRef.current) exitTemplateModeRef.current()
        saveDetachedWindowPosition()
        try { window.utools?.outPlugin?.() } catch { /* ignore */ }
        return
      }
      if (activeTemplateBookmarkRef.current) exitTemplateModeRef.current()
      // bookmarks 主入口：universal 书签未命中后根据连贯模式决定是否重置视图和搜索。
      // 不能因为 payloadText 非空就进搜索——uTools 用命令词（"书签"/"bookmark"）触发主入口时，
      // 会把命令词本身当 payload 传进来。真正的关键词检索在面板内搜索框完成。
      useBookmarkFormStore.getState().set({ showAdd: false })
      if (useSettingsStore.getState().panelContinuous) {
        // 连贯开：保留上次搜索内容和浏览位置，仅聚焦搜索框（全选方便直接覆盖）
        focusSearchInput()
      } else {
        // 连贯关（默认）：清搜索、回主视图，再聚焦
        applySearchValRef.current('')
        setScreenRef.current(view)
        focusSearchInput()
      }
      return
    }
  }
  useEffect(() => {
    if (!window.utools) return
    // 绑定稳定的 wrapper，内部走 ref 取最新 handler
    const wrapper = (e: Event) => {
      // preload 在 onPluginEnter 也会设高度，但可能读到旧存储；页面已挂载时在此用 store 纠正。
      if (typeof window.utools?.setExpendHeight === 'function') {
        try {
          window.utools.setExpendHeight(useSettingsStore.getState().windowHeight)
        } catch { /* ignore */ }
      }
      pluginEnterHandlerRef.current(e)
    }
    window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, wrapper)

    // 回放 preload 缓存的 pending plugin-enter 事件（对齐 App.tsx:1609-1623）
    const pendingEvents = (window as unknown as {
      __gooseMarksPendingPluginEnterEvents?: Array<{ params: UToolsPluginEnterPayload }>
    }).__gooseMarksPendingPluginEnterEvents || []
    if (pendingEvents.length > 0) {
      // 优先回放 bm_tpl: 动态模板事件（uTools 会在其后补发 bookmarks，取最后一条会丢模板入口，
      // 对齐 App.tsx:1613-1619 的反向查找策略）
      const selectedEvent =
        [...pendingEvents]
          .reverse()
          .find((entry) => {
            const c = entry?.params?.code
            return typeof c === 'string' && c.startsWith(FEATURE_PREFIX)
          }) ?? pendingEvents[pendingEvents.length - 1]
      if (selectedEvent) {
        wrapper({ detail: selectedEvent.params } as unknown as Event)
      }
      ;(window as unknown as { __gooseMarksPendingPluginEnterEvents?: unknown[] }).__gooseMarksPendingPluginEnterEvents = []
    }
    if (typeof window.utools?.setExpendHeight === 'function') {
      try {
        window.utools.setExpendHeight(useSettingsStore.getState().windowHeight)
      } catch { /* ignore */ }
    }


    return () => window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, wrapper)
  }, [])

  // ---- uTools subInput → 应用层搜索同步 ----
  // 用 ref 读取最新状态，避免重复绑定监听。
  // 规则：模板输入态忽略；add 表单页忽略；settings/trash 先切回主视图再过滤。
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text ?? ''
      if (activeTemplateBookmarkRef.current) return
      const curScreen = screenRef.current
      if (curScreen === 'add') return
      if (curScreen === 'settings' || curScreen === 'trash' || curScreen === 'groups') {
        setScreenRef.current(viewRef.current)
      }
      applySearchValRef.current(text, true)
    }
    window.addEventListener(UTOOLS_INPUT_EVENT, handler)
    return () => window.removeEventListener(UTOOLS_INPUT_EVENT, handler)
  }, [])

  // ---- useUIManager toast 桥：hooks 内部（useBookmarkOperations/useBookmarkForm 等）调用的
  // showToast 在新 UI 没有 ResultToast 宿主，这里转发到 HomePage 自己的 toast，避免反馈静默丢失 ----
  const uiToastState = useUIManager((s) => s.toastState)
  useEffect(() => {
    if (uiToastState.visible && uiToastState.title) {
      fireToastRef.current(
        uiToastState.description ? `${uiToastState.title}：${uiToastState.description}` : uiToastState.title
      )
      // 立即收掉 store 态，避免下次同标题 toast 不触发
      useUIManager.getState().closeToast()
    }
  }, [uiToastState])

  // ---- storage-sync：分离窗口/多标签场景下另一侧写入存储 → 本侧合并（对齐 App.tsx:1507-1547，
  // 略去 App 独有的本地镜像目录联动）----
  useEffect(() => {
    if (!window.utools) return
    const onStorageSync = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: string }>).detail
      const { key, value } = detail || {}
      if (!value) return
      try {
        const data = JSON.parse(value)
        if (key === 'settings' && data && typeof data === 'object') {
          const settingsStore = useSettingsStore.getState()
          const localMirrorDirectory = settingsStore.localMirrorDirectory
          const nextSettings = { ...(data as Record<string, unknown>) }
          delete nextSettings.localMirrorDirectory
          useSettingsStore.setState(nextSettings as Partial<typeof settingsStore>)
          settingsStore.setLocalMirrorDirectory(localMirrorDirectory)
        }
        if (key === 'bookmark') {
          const store = useBookmarkStore.getState()
          const incomingStamp = getLatestUpdatedAt(data)
          const localStamp = getLatestUpdatedAt({ groups: store.groups, bookmarks: store.bookmarks })
          // 严格大于才应用：persist 序列化含本窗口 active 选择，两窗口选择不同时
          // `>=` 会让等时间戳数据互相写回、BroadcastChannel 无限回弹
          if (incomingStamp > localStamp) {
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
    }
    window.addEventListener('storage-sync', onStorageSync)
    return () => window.removeEventListener('storage-sync', onStorageSync)
  }, [])

  // ---- syncFeatures：书签数据变化 → 注册/反注册动态 uTools 特性 ----
  // checkAiAvailable 是纯函数（读 store），直接在 callback 内调用，不需要作为依赖
  const syncUToolsFeatures = useCallback(() => {
    if (!window.utools) return
    const settings = useSettingsStore.getState()
    const { aiQuickSaveEnabled: quickSaveSetting } = settings
    const aiQuickSaveEnabled = !!(quickSaveSetting && getAIAvailability(selectAiSettings(settings)).ok)
    syncFeatures(useBookmarkStore.getState().bookmarks, { aiQuickSaveEnabled })
  }, [syncFeatures])

  // 书签数据变化 → 同步 uTools 特性（对齐 App.tsx:1294-1297）
  useEffect(() => {
    syncUToolsFeatures()
  }, [bookmarks, syncUToolsFeatures])

  // AI 设置变化 → 同步 uTools 特性（对齐 App.tsx:1300-1304）
  useEffect(() => {
    syncUToolsFeatures()
  }, [aiSettingsKey, syncUToolsFeatures])

  // 设置页：IntersectionObserver 同步左侧高亮
  useEffect(() => {
    if (screen !== 'settings') return
    const container = setMainRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (isSetScrollingRef.current) return
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = SET_NAV.findIndex(([, , id]) => id === entry.target.id)
            if (idx >= 0) setSetNavIdx(idx)
            break
          }
        }
      },
      { root: container, rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )
    for (const [, , id] of SET_NAV) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [screen])

  const scrollToSetSection = useCallback((idx: number) => {
    const [, , id] = SET_NAV[idx]
    const el = document.getElementById(id)
    const container = setMainRef.current
    if (!el || !container) return
    isSetScrollingRef.current = true
    if (setScrollTimeout.current) clearTimeout(setScrollTimeout.current)
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    container.scrollTo({ top, behavior: 'auto' })
    setSetNavIdx(idx)
    setScrollTimeout.current = setTimeout(() => {
      isSetScrollingRef.current = false
    }, 600)
  }, [])

  // 当前选中书签（供右键「复制」Toast 副标题展示书签名，对齐设计稿）
  const selectedItem = useMemo<HomeItem | null>(() => {
    if (!selectedId) return null
    for (const g of homeGroups) for (const s of g.subs) {
      const hit = s.items.find((b) => b.id === selectedId)
      if (hit) return hit
    }
    return null
  }, [homeGroups, selectedId])

  const rootCls = [
    'goose-home',
    toastOpen ? 'toast-open' : '',
    // 彩蛋激活时加 egg-on，让 CSS 透出底层 canvas
    theme === 'dark' && easterEggEnabled ? 'egg-on' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={rootCls} data-theme={theme} data-screen={screen} data-density={density} data-ui-scale={uiScale} data-platform={RUNTIME_PLATFORM} data-search-surface={searchSurface}>
      {theme === 'dark' && easterEggEnabled && easterEggVariant === 'starry' && <StarryBackground />}
      {theme === 'dark' && easterEggEnabled && easterEggVariant === 'blackhole' && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none">
          <BlackHole brightness={0.75} speed={0.9} quality="auto" />
        </div>
      )}
      {/* zIndex 让窗口盖在彩蛋 canvas 上；position 必须保留 CSS 的 absolute+inset:0，否则高度约束链断裂导致设置页无法滚动 */}
      <div className="window" style={{ zIndex: 1 }}>
        {/* ---------- Header ---------- */}
        <header className="app-header">
          {/* 一级分组 Tab 栏（可拖拽排序 + 右键管理） */}
          <DndContext sensors={tabSensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
            <SortableContext items={homeGroups.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
              <div className="group-tabs">
                {homeGroups.map((g) =>
                  tabRenaming === g.id ? (
                    <input
                      key={g.id}
                      ref={tabRenameRef}
                      className="group-tab-rename"
                      value={tabRenameVal}
                      onChange={(e) => setTabRenameVal(e.target.value)}
                      onKeyDown={(e) => {
                        handleInlineRenameEnter(e, commitTabRename)
                        if (e.key === 'Escape') setTabRenaming(null)
                      }}
                      onBlur={() => deferInlineRenameCommit(commitTabRename)}
                    />
                  ) : (
                    <SortableTab
                      key={g.id}
                      id={g.id}
                      name={g.name}
                      isActive={!isSearching && activeGroupId === g.id}
                      onTabClick={() => {
                        if (isSearching) clearSearch()
                        changeActiveGroup(g.id)
                      }}
                      onTabContextMenu={(e) => openTabCtx(e, g.id)}
                    />
                  )
                )}
                {/* 新建主分组：+ 虚线胶囊 → 就地内联输入 */}
                {tabAdding ? (
                  <input
                    ref={tabAddRef}
                    className="group-tab-rename"
                    placeholder="分组名称…"
                    value={tabAddVal}
                    onChange={(e) => setTabAddVal(e.target.value)}
                    onKeyDown={(e) => {
                      handleInlineRenameEnter(e, commitTabAdd)
                      if (e.key === 'Escape') setTabAdding(false)
                    }}
                    onBlur={() => deferInlineRenameCommit(commitTabAdd)}
                  />
                ) : (
                  <button className="tab-add" title="新建分组" onClick={startTabAdd}>
                    <Ico name="plus" />
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
          {/* 搜索框（收窄到右侧） */}
          <div className="header-search">
            <Ico name="search" />
            <input
              ref={headerSearchRef}
              type="text"
              placeholder="搜索书签…"
              value={searchVal}
              onChange={(e) => applySearchVal(e.target.value)}
            />
            {isSearching && (
              <button className="search-clear" title="清空搜索 (Esc)" onClick={clearSearch}>
                <Ico name="x" />
              </button>
            )}
          </div>
          {/* 收集按钮 */}
          <button
            className="collect-btn"
            onClick={() => { setFormEditItem(null); setFormKey((k) => k + 1); setScreen('add') }}
          >
            <Ico name="plus" />
            收集
          </button>
          {/* 头像按钮 */}
          <button
            ref={avatarRef}
            className="avatar"
            title="设置"
            onClick={() => setPaOpen((o) => !o)}
          >
            <Ico name="settings" />
          </button>
        </header>

        {/* 一级 Tab 右键菜单 */}
        {tabCtx.open && (
          <div
            ref={tabMenuRef}
            className="ctx-menu tab-ctx-menu"
            style={{ display: 'flex', position: 'fixed', left: tabCtx.x, top: tabCtx.y, zIndex: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => startTabRename(tabCtx.groupId)}>
              <Ico name="pencil" />
              重命名
            </button>
            <div className="ctx-sep" />
            <button className="danger" onClick={() => deleteTabGroup(tabCtx.groupId)}>
              <Ico name="trash-2" />
              删除分组
            </button>
          </div>
        )}

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

        {/* 模板输入态横幅：参数输入框在页面内（uTools subInput 已下线） */}
        {activeTemplateBookmark && (
          <div className="tpl-banner">
            <Ico name="wand-sparkles" />
            <span>{`「${activeTemplateBookmark.title}」`}</span>
            <input
              className="tpl-input"
              type="text"
              autoFocus
              value={templateQuery}
              placeholder={`输入${getTemplateLabel(activeTemplateBookmark.url) || '关键词'}后回车打开…`}
              onChange={(e) => setTemplateQuery(e.target.value)}
            />
            <button className="tpl-banner-exit" title="退出模板模式 (Esc)" onClick={() => exitTemplateMode()}>
              <Ico name="x" />
            </button>
          </div>
        )}

        {/* ---------- Main ---------- */}
        <div className="app-main">
          <DndContext
            sensors={dndSensors}
            collisionDetection={bookmarkCollision}
            onDragStart={handleDndDragStart}
            onDragEnd={handleDndDragEnd}
          >
          {/* Sidebar */}
          <SidebarNav
            homeGroups={homeGroups}
            activeGroupId={activeGroupId}
            activeSubId={activeSubId}
            screen={screen}
            onSubClick={(groupId, subId) => {
              setActiveSubId(subId)
              centerSidebar() // 主动点击 → 侧栏高亮居中
              // 同步 store，让 MCP create_bookmark fallback 位置与界面一致
              useBookmarkStore.getState().selectGroup(groupId, subId)
              // 搜索中点侧栏 = 放弃搜索回到该分组；回收站中点侧栏 = 切回书签视图
              if (isSearching) clearSearch()
              if (screen === 'trash') setScreen(view)
              // 列表 / 网格视图都滚动到对应分组段
              if (view === 'list' || view === 'grid') scrollToSection(groupId, subId)
            }}
            fireToast={fireToast}
            onActiveSubIdFix={handleActiveSubIdFix}
            centerSignal={sidebarCenterSignal}
          />

          {/* Center */}
          <div className="center">
            {screen === 'trash' ? (
              <TrashContent
                groups={groups}
                onToast={fireToast}
              />
            ) : (
              <div
                ref={contentRef}
                className="content"
                data-view={view}
                tabIndex={-1}
                onContextMenu={openCtx}
              >
                {view === 'grid' ? (
                  <GridContent
                    groups={filteredGroups}
                    columns={gridColumns}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    searching={isSearching}
                    searchItems={gridSearchItems}
                    onOpen={(item) => {
                      const realBookmark = bookmarks.find((b) => b.id === item.id)
                      if (realBookmark) openBookmarkLink(realBookmark)
                    }}
                  />
                ) : (
                  <ListContent
                    groups={filteredGroups}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    searching={isSearching}
                    onOpen={(item) => {
                      const realBookmark = bookmarks.find((b) => b.id === item.id)
                      if (realBookmark) openBookmarkLink(realBookmark)
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragItem ? (
              view === 'grid' ? (
                <div className="gcard drag-overlay">
                  <Fav item={activeDragItem} />
                  <div className="ttl">{activeDragItem.ttl}</div>
                  <div className="url">{activeDragItem.host}</div>
                </div>
              ) : (
                <div className="drag-overlay">
                  <BookmarkCard item={activeDragItem} />
                </div>
              )
            ) : null}
          </DragOverlay>
          </DndContext>
        </div>

        {/* ---------- Settings ---------- */}
        <div className="settings">
          <nav className="set-nav">
            {SET_NAV.map(([label, ic], i) => (
              <button
                key={label}
                className={i === setNavIdx ? 'on' : ''}
                onClick={() => scrollToSetSection(i)}
              >
                <Ico name={ic} />
                {label}
              </button>
            ))}
            <button className="feedback" onClick={() => fireToast('反馈邮箱：each1026@gmail.com · 已复制')}>
              <Ico name="message-square" />
              快速反馈
            </button>
          </nav>
          <div className="set-main" ref={setMainRef}>
            <div className="set-wrap">
              <SettingsContent
                theme={theme}
                themePref={themePref}
                view={view}
                onThemeChange={applyThemePref}
                onToast={fireToast}
                onGoToGroups={() => setScreen('groups')}
              />
            </div>
          </div>
        </div>

        {/* ---------- Add/Edit wizard (沉浸式三步) ---------- */}
        {screen === 'add' && <AddBookmarkWizard key={`wiz-${formKey}`} editItem={formEditItem} onBack={backToList} />}

        {/* ---------- Group manage page ---------- */}
        {screen === 'groups' && <GroupManagePage onBack={() => setScreen('settings')} />}

        {/* ---------- Context menu ---------- */}
        <div ref={ctxMenuRef} className={`ctx-menu${ctx.open ? ' show' : ''}`} style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
          {ctxMode === 'confirmDelete' ? (
            <>
              <div className="ctx-confirm-msg">
                <span>删除「{ctxItem?.ttl || '该书签'}」？</span>
                <span className="ctx-confirm-sub">书签将移入回收站</span>
              </div>
              <div className="ctx-sep" />
              <button className="danger" onClick={confirmCtxDelete}><Ico name="trash-2" />确认删除</button>
              <button onClick={closeCtx}><Ico name="x" />取消</button>
            </>
          ) : (
            <>
              <button onClick={() => {
                closeCtx()
                if (ctxItem) {
                  const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
                  if (realBookmark) openBookmarkLink(realBookmark)
                }
              }}><Ico name="external-link" />打开</button>
              <button onClick={() => {
                closeCtx()
                // 反转：默认走内置浏览器时，右键提供「用系统默认浏览器打开」，反之亦然
                if (ctxItem) (useUtoolsBrowser ? openUrlInDefaultBrowser : openUrlInUtoolsBrowser)(ctxItem.url)
              }}><Ico name="globe" />{useUtoolsBrowser ? '用默认浏览器打开' : '在内置浏览器打开'}</button>
              <button onClick={() => {
                closeCtx()
                if (ctxItem) {
                  const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
                  // useUIManager 的 toast 在新 UI 未挂载，复制成功后用 HomePage 自己的 fireToast 反馈
                  if (realBookmark) void copyBookmarkUrl(realBookmark) // 成功/失败反馈由 useUIManager toast 桥统一转发
                }
              }}><Ico name="copy" />复制链接</button>
              <button onClick={() => { closeCtx(); setFormEditItem(ctxItem); setScreen('add') }}><Ico name="pencil" />编辑</button>
              <div className="ctx-sep" />
              <button className="danger" onClick={requestCtxDelete}><Ico name="trash-2" />删除</button>
            </>
          )}
        </div>

        {/* ---------- Toast ---------- */}
        {/* 通用 toast：标题来自 fireToast 入参（此前写死「链接已复制」，
            会让保存/恢复/打开等所有反馈都套复制文案） */}
        <div className="toast" key={`toast-${toastKey}`}>
          <span className="tic"><Ico name="check" /></span>
          <div>
            <div className="tt">{toastTitle || '操作完成'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================== 子组件 ============================== */

function Fav({ item, cls = 'fav' }: { item: HomeItem; cls?: string }) {
  // 真实图标加载失败（如 favicon 服务 404）时优雅回退到文字首字母
  const [imgError, setImgError] = useState(false)
  const showImg = item.iconUrl && !imgError
  // 有真实图标：不加背景（透明 PNG 不会透出底色）。文字占位：加 is-placeholder，
  // 底色与文字色由 --fav-hue 在 CSS 里按深浅模式派生（低饱和、每站独立）；用户自设 color 优先覆盖
  const placeholderStyle: React.CSSProperties = item.color
    ? { background: item.color }
    : ({ '--fav-hue': item.favHue } as React.CSSProperties)
  return (
    <div className={showImg ? cls : `${cls} is-placeholder`} style={showImg ? undefined : placeholderStyle}>
      {showImg ? (
        <Image bare src={item.iconUrl} alt="" onError={() => setImgError(true)} onContextMenu={(e) => e.preventDefault()} />
      ) : (
        item.fav
      )}
    </div>
  )
}

function BookmarkCard({
  item,
  selected,
  trailing,
  style,
  onClick,
  groupId,
  subId
}: {
  item: HomeItem
  selected?: boolean
  trailing?: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  groupId?: string
  subId?: string
}) {
  const showDescription = useSettingsStore((s) => s.listShowDescription)
  const fullDescription = useSettingsStore((s) => s.listFullDescription)
  const hideUrlWithoutDescription = useSettingsStore((s) => s.listShowTags)
  return (
    <div className={`card${selected ? ' sel' : ''}`} style={style} data-item-id={item.id} data-group-id={groupId} data-sub-id={subId} onClick={onClick}>
      <Fav item={item} />
      <div className="meta">
        <div className="ttl">{item.ttl}</div>
        {showDescription && item.dsc && <div className={`dsc${fullDescription ? ' full' : ''}`}>{item.dsc}</div>}
        {!hideUrlWithoutDescription && showDescription && !item.dsc && item.host && <div className="url">{item.host}</div>}
        {item.tags.length > 0 && (
          <div className="tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      {item.pin && <Ico name="pin" className="pin" />}
      {trailing}
    </div>
  )
}

function ListContent({
  groups,
  selectedId,
  onSelect,
  onOpen,
  searching
}: {
  groups: HomeGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  searching?: boolean
}) {
  if (!groups.length) {
    return (
      <div className="empty">
        <Ico name={searching ? 'search-x' : 'inbox'} />
        <span>{searching ? '没有找到匹配的书签' : '还没有书签，点右上角 + 新增第一个'}</span>
      </div>
    )
  }
  return (
    <>
      {groups.map((g) =>
        g.subs.map((s) => (
          <SecBlock
            key={`${g.id}-${s.id}`}
            groupId={g.id}
            subId={s.id}
            subName={s.name}
            count={s.items.length}
            view="list"
          >
            {s.items.length === 0 ? (
              <div className="sec-empty">暂无书签</div>
            ) : searching ? (
              s.items.map((b) => (
                <div key={`${g.id}-${s.id}-${b.id}`} onClick={() => { onSelect(b.id); onOpen?.(b) }}>
                  <BookmarkCard item={b} selected={b.id === selectedId} groupId={g.id} subId={s.id} />
                </div>
              ))
            ) : (
              <SortableContext items={s.items.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {s.items.map((b) => (
                  <SortableCard
                    key={`${g.id}-${s.id}-${b.id}`}
                    item={b}
                    groupId={g.id}
                    subId={s.id}
                    selected={b.id === selectedId}
                    onSelect={onSelect}
                    onOpen={onOpen}
                  />
                ))}
              </SortableContext>
            )}
          </SecBlock>
        ))
      )}
    </>
  )
}

/** 宫格图标尺寸映射 */
const GRID_ICON_SIZE_PX: Record<string, string> = {
  small: '38px',
  medium: '46px',
  large: '56px'
}

/** 单个宫格集合（共用：分组段内与搜索扁平态） */
function GridCells({
  items,
  columns,
  selectedId,
  iconSize,
  onSelect,
  onOpen,
  groupId,
  subId
}: {
  items: HomeItem[]
  columns: number
  selectedId: string | null
  iconSize: string
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  groupId?: string
  subId?: string
}) {
  const showDescription = useSettingsStore((s) => s.listShowDescription)
  const hideUrlWithoutDescription = useSettingsStore((s) => s.listShowTags)
  // 非搜索态（有归属分组）才可拖拽；搜索扁平宫格无 groupId，保持普通渲染
  const canDrag = !!groupId && !!subId
  const cells = items.map((b) => {
    const subText = showDescription && b.dsc ? b.dsc : (hideUrlWithoutDescription ? '' : b.host)
    const subClass = showDescription && b.dsc ? 'dsc' : 'url'
    if (canDrag) {
      return (
        <SortableGridCell
          key={b.id}
          item={b}
          groupId={groupId!}
          subId={subId!}
          selected={b.id === selectedId}
          subText={subText}
          subClass={subClass}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      )
    }
    return (
      <div
        key={b.id}
        className={`gcard${b.id === selectedId ? ' sel' : ''}`}
        data-item-id={b.id}
        data-group-id={groupId}
        data-sub-id={subId}
        onClick={() => { onSelect(b.id); onOpen?.(b) }}
      >
        <Fav item={b} />
        <div className="ttl">{b.ttl}</div>
        {subText && <div className={subClass}>{subText}</div>}
      </div>
    )
  })
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        '--grid-icon-size': iconSize
      } as React.CSSProperties}
    >
      {canDrag ? (
        <SortableContext items={items.map((b) => b.id)} strategy={rectSortingStrategy}>
          {cells}
        </SortableContext>
      ) : cells}
    </div>
  )
}

/**
 * 网格视图：全量渲染所有分组段，连续滚动可达任意分组。
 * 每个子分组一个 .sec-block（复用列表视图的 data-sec-id / data-sub-id 锚点协议，
 * 让 scroll-spy 与侧栏点击定位无缝共用）。搜索态退化为单个扁平宫格。
 */
function GridContent({
  groups,
  columns,
  selectedId,
  onSelect,
  onOpen,
  searching,
  searchItems
}: {
  groups: HomeGroup[]
  columns: number
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  searching?: boolean
  searchItems?: HomeItem[]
}) {
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const iconSize = GRID_ICON_SIZE_PX[gridIconSize] ?? '46px'

  // 搜索态：全局匹配结果扁平成一个宫格，不分段
  if (searching) {
    if (!searchItems || !searchItems.length) {
      return (
        <div className="empty">
          <Ico name="search-x" />
          <span>没有找到匹配的书签</span>
        </div>
      )
    }
    return (
      <GridCells
        items={searchItems}
        columns={columns}
        selectedId={selectedId}
        iconSize={iconSize}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    )
  }

  if (!groups.length) {
    return (
      <div className="empty">
        <Ico name="inbox" />
        <span>还没有书签，点右上角 + 新增第一个</span>
      </div>
    )
  }

  return (
    <>
      {groups.map((g) =>
        g.subs.map((s) => (
          <SecBlock
            key={`${g.id}-${s.id}`}
            groupId={g.id}
            subId={s.id}
            subName={s.name}
            count={s.items.length}
            view="grid"
          >
            {s.items.length === 0 ? (
              <div className="sec-empty">暂无书签</div>
            ) : (
              <GridCells
                items={s.items}
                columns={columns}
                selectedId={selectedId}
                iconSize={iconSize}
                onSelect={onSelect}
                onOpen={onOpen}
                groupId={g.id}
                subId={s.id}
              />
            )}
          </SecBlock>
        ))
      )}
    </>
  )
}

/* ---------- 新增/编辑表单页（接真实 useBookmarkForm hook） ---------- */
function FormPage({ editItem, onBack }: { editItem: HomeItem | null; onBack: () => void }) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const {
    showAdd,
    draft,
    draftLocations,
    previewIcon,
    iconLoading,
    iconFetchPhase,
    formError,
    isSaving,
    isGenerating,
    editingId,
    categorySuggestion,
    isSuggestingCategory,
    canUseAi,
    set,
    patchDraft,
    openAdd,
    openEdit,
    handleSave,
    askAI,
    requestDelete,
    askCategorySuggestion,
    applyCategorySuggestion,
    dismissCategorySuggestion,
    onTitleInput,
    onDescInput,
    isTitleDirty,
    isDescDirty,
    takeOverTitle,
    takeOverDesc,
  } = useBookmarkForm()

  const titleFetching = iconLoading && !isTitleDirty
  const descFetching = iconLoading && !isDescDirty

  // 监听 showAdd 关闭：hook 保存成功后会 set({ showAdd: false })，触发 onBack
  // wasOpenRef：防止初始 showAdd=false 时误触发
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (showAdd) {
      wasOpenRef.current = true
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      onBackRef.current()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd])

  // 任务 A：依赖数组使用固定大小写法，避免 React "changed size" 警告
  // editItem 作为单一依赖，内部再 find 对应真实 Bookmark
  const editItemId = editItem?.id ?? null
  useEffect(() => {
    if (editItemId) {
      const realBookmark = bookmarks.find((b) => b.id === editItemId)
      if (realBookmark) openEdit(realBookmark)
    } else {
      openAdd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemId])

  const previewIconUrl = iconToDisplayUrl(previewIcon ?? undefined)
  const previewText = ((draft.title || draft.url) || 'ICON').trim().slice(0, 4).toUpperCase()

  const handleSaveClick = async () => {
    await handleSave()
    // handleSave 成功后会 set({ showAdd: false })，失败时 formError 非空
    // showAdd 变化由下面的 useEffect 监听来触发 onBack
  }

  const handleDeleteClick = () => {
    requestDelete()
    // requestDelete 内部已 set({ showAdd: false })，会触发 wasOpenRef → onBack
  }

  // 点取消/返回按钮时手动关闭 hook，触发状态重置和 onBack
  const handleCancel = () => {
    set({ showAdd: false })
  }

  return (
    <div className="formpage">
      <div className="form-head">
        <button className="back-btn" onClick={handleCancel} disabled={isSaving} style={isSaving ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
          <Ico name="arrow-left" />
        </button>
        <span className="ic"><Ico name="file-text" /></span>
        <h1>{editingId ? '编辑书签' : '新增书签'}</h1>
      </div>
      <div className="form-body">
        <div className="form-col">
          {/* 链接 */}
          <section className="field">
            <div className="lbl">链接 / 模板</div>
            <div className="url-input">
              <input
                type="text"
                value={draft.url}
                placeholder="https://…"
                onChange={(e) => patchDraft({ url: e.target.value })}
              />
              {canUseAi && (
                <button
                  className="ai-trigger"
                  title="AI 预填标题和描述"
                  onClick={() => askAI(true)}
                  disabled={isGenerating}
                  style={isGenerating ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  <Ico name="sparkles" />
                </button>
              )}
            </div>
            {/{[^}]+}/.test(draft.url) && (
              <div className="hint-text">URL 含 {'{query}'} 可作为模板，呼出后直接输入关键词跳转</div>
            )}
          </section>

          {/* 图标与标题 */}
          <section className="field">
            <div className="lbl">图标与标题</div>
            <div className="id-row">
              <div className="favcol">
                <div
                  className={`fav bigfav${iconFetchPhase === 'success' ? ' fetch-success' : iconFetchPhase === 'failed' ? ' fetch-failed' : ''}`}
                  style={{ background: previewIcon?.bgColor || 'var(--surface-hover)' }}
                >
                  {iconLoading ? (
                    <span className="icon-countdown">
                      <svg viewBox="0 0 72 72" className="icon-countdown-ring" preserveAspectRatio="none">
                        <rect className="icon-countdown-track" x="1.25" y="1.25" width="69.5" height="69.5" rx="12.75" pathLength={100} />
                        <rect className="icon-countdown-fill" x="1.25" y="1.25" width="69.5" height="69.5" rx="12.75" pathLength={100} />
                      </svg>
                    </span>
                  ) : previewIconUrl ? (
                    <Image bare src={previewIconUrl} alt="" />
                  ) : (
                    <span className="fav-placeholder">
                      <Ico name="globe" />
                    </span>
                  )}
                </div>
                <div className="editfav-cap">图标预览</div>
              </div>
              <div className="id-fields">
                <input
                  className={`txt-input${titleFetching ? ' input-shimmer' : ''}`}
                  value={draft.title}
                  placeholder={titleFetching ? '正在获取标题…' : '网站标题'}
                  readOnly={titleFetching}
                  onPointerDown={() => { if (titleFetching) takeOverTitle() }}
                  // 键盘路径与点击等价：获取中 Tab 进来直接打字也视为接管（首键唤醒，readOnly 吞掉不录入）
                  // 仅编辑类按键触发，Tab/方向键等导航键不算
                  onKeyDown={(e) => { if (titleFetching && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) takeOverTitle() }}
                  onChange={(e) => {
                    patchDraft({ title: e.target.value })
                    // 6.【一般】dirty 标记：防止 URL 防抖回填覆盖用户手输标题（对齐 BookmarkFormDialog.tsx:193）
                    onTitleInput()
                  }}
                />
                <input
                  className={`txt-input desc-input${descFetching ? ' input-shimmer' : ''}`}
                  value={draft.desc}
                  placeholder={descFetching ? '正在获取描述…' : '网站描述（单行）'}
                  readOnly={descFetching}
                  onPointerDown={() => { if (descFetching) takeOverDesc() }}
                  onKeyDown={(e) => { if (descFetching && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) takeOverDesc() }}
                  onChange={(e) => onDescInput(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 分类 */}
          <section className="field">
            <div className="lbl">
              分类{' '}
              {canUseAi && (
                <button
                  className="ai-pill"
                  onClick={askCategorySuggestion}
                  disabled={isSuggestingCategory}
                >
                  <Ico name="wand-sparkles" />
                  {isSuggestingCategory ? '推荐中…' : 'AI 推荐'}
                </button>
              )}
            </div>
            {categorySuggestion && (
              <div className="ai-suggest" style={{ marginBottom: 10 }}>
                <Ico name="lightbulb" className="bulb" />
                <span className="txt">
                  建议归入 <b>{categorySuggestion.groupName} / {categorySuggestion.subGroupName}</b>
                </span>
                <button className="mini ok" onClick={() => applyCategorySuggestion()}>
                  <Ico name="check" />
                </button>
                <button className="mini no" onClick={dismissCategorySuggestion}>
                  <Ico name="x" />
                </button>
              </div>
            )}
            <div className="form-category-select">
              <CategoryMultiSelect
                inline
                value={draftLocations}
                onChange={(v) => set({ draftLocations: v })}
              />
            </div>
          </section>

          {/* 错误提示 */}
          {formError && (
            <div className="form-error">
              <Ico name="alert-circle" />
              {formError}
            </div>
          )}
        </div>

        <div className="form-foot">
          {editingId && (
            <button className="btn btn-ghost danger" onClick={handleDeleteClick} disabled={isSaving} style={isSaving ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
              <Ico name="trash-2" />删除
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={handleCancel} disabled={isSaving} style={isSaving ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>取消</button>
          <button
            className="btn btn-primary"
            disabled={isSaving}
            onClick={handleSaveClick}
          >
            {isSaving ? <Ico name="loader" style={{ animation: 'spin 1s linear infinite' }} /> : null}
            保存书签
          </button>
        </div>
      </div>
    </div>
  )
}


/* ---------- 回收站视图 ---------- */
function TrashContent({
  groups,
  onToast,
}: {
  groups: Group[]
  onToast: (title?: string) => void
}) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const restoreBookmarkFromTrash = useBookmarkStore((s) => s.restoreBookmarkFromTrash)
  const emptyTrash = useBookmarkStore((s) => s.emptyTrash)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  // 二次确认超时定时器：组件卸载时清理，避免卸载后 setState
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
  }, [])

  const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
  const trashItems = useMemo(() => {
    if (!trashGroup) return []
    const ids = trashGroup.children.flatMap((sub) => sub.bookmarkIds)
    return bookmarks.filter((b) => ids.includes(b.id))
  }, [trashGroup, bookmarks])

  const handleRestore = (id: string) => {
    const ok = restoreBookmarkFromTrash(id)
    if (ok) onToast('书签已恢复')
  }

  const handleEmptyTrash = () => {
    if (!confirmEmpty) {
      setConfirmEmpty(true)
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = setTimeout(() => setConfirmEmpty(false), 3000)
      return
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    emptyTrash()
    setConfirmEmpty(false)
    onToast('回收站已清空')
  }

  return (
    <div className="content trash-content">
      <div className="trash-head">
        <div className="trash-title">
          <Ico name="trash-2" />
          <span>回收站</span>
          {trashItems.length > 0 && <span className="trash-count">{trashItems.length}</span>}
        </div>
        {trashItems.length > 0 && (
          <button
            className={`btn btn-ghost${confirmEmpty ? ' danger' : ''}`}
            style={{ fontSize: 12.5, height: 32, padding: '0 12px' }}
            onClick={handleEmptyTrash}
          >
            <Ico name="trash-2" />
            {confirmEmpty ? '确认清空？' : '清空回收站'}
          </button>
        )}
      </div>

      {trashItems.length === 0 ? (
        <div className="empty" style={{ marginTop: 60 }}>
          <Ico name="check-circle" />
          <span>回收站为空</span>
        </div>
      ) : (
        trashItems.map((b) => (
          <div key={b.id} className="card trash-card">
            <div className="fav" style={{ background: b.icon?.bgColor || 'var(--surface-hover)' }}>
              {(() => {
                const url = iconToDisplayUrl(b.icon ?? undefined)
                return url
                  ? <Image bare src={url} alt="" />
                  : (b.title || b.url || '?').slice(0, 4).toUpperCase()
              })()}
            </div>
            <div className="meta">
              <div className="ttl">{b.title || b.url}</div>
              <div className="url">{b.url}</div>
            </div>
            <button
              className="trash-restore-btn"
              title="恢复书签"
              onClick={() => handleRestore(b.id)}
            >
              <Ico name="rotate-ccw" />
              恢复
            </button>
          </div>
        ))
      )}
    </div>
  )
}

/* ---------- 通用分段选择控件（模块级，避免 SettingsContent 每次渲染重建） ---------- */
function Seg<T extends string>({
  opts,
  value,
  onChange
}: {
  opts: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="radio-seg">
      {opts.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

/* ---------- 设置页内容（接真实 store） ---------- */
function SettingsContent({
  theme,
  themePref,
  view,
  onThemeChange,
  onToast,
  onGoToGroups,
}: {
  theme: Theme
  themePref: ThemePref
  view: ViewMode
  onThemeChange?: (pref: ThemePref) => void
  onToast?: (title?: string) => void
  onGoToGroups?: () => void
}) {
  // settings store
  const homeViewMode = useSettingsStore((s) => s.homeViewMode)
  const setHomeViewMode = useSettingsStore((s) => s.setHomeViewMode)
  const density = useSettingsStore((s) => s.density)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const autoCloseWindow = useSettingsStore((s) => s.autoCloseWindow)
  const setAutoCloseWindow = useSettingsStore((s) => s.setAutoCloseWindow)
  const panelContinuous = useSettingsStore((s) => s.panelContinuous)
  const setPanelContinuous = useSettingsStore((s) => s.setPanelContinuous)
  const useUtoolsBrowser = useSettingsStore((s) => s.useUtoolsBrowser)
  const setUseUtoolsBrowser = useSettingsStore((s) => s.setUseUtoolsBrowser)
  const gridColumns = useSettingsStore((s) => s.gridColumns)
  const setGridColumns = useSettingsStore((s) => s.setGridColumns)
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const setGridIconSize = useSettingsStore((s) => s.setGridIconSize)
  const listShowDescription = useSettingsStore((s) => s.listShowDescription)
  const setListShowDescription = useSettingsStore((s) => s.setListShowDescription)
  const listFullDescription = useSettingsStore((s) => s.listFullDescription)
  const setListFullDescription = useSettingsStore((s) => s.setListFullDescription)
  const listHideUrlWithoutDescription = useSettingsStore((s) => s.listShowTags)
  const setListHideUrlWithoutDescription = useSettingsStore((s) => s.setListShowTags)
  const easterEggEnabled = useSettingsStore((s) => s.easterEggEnabled)
  const setEasterEggEnabled = useSettingsStore((s) => s.setEasterEggEnabled)
  const easterEggVariant = useSettingsStore((s) => s.easterEggVariant)
  const setEasterEggVariant = useSettingsStore((s) => s.setEasterEggVariant)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const setAiEnabled = useSettingsStore((s) => s.setAiEnabled)
  const aiAllowLegacyUTools = useSettingsStore((s) => s.aiAllowLegacyUTools)
  const aiSelectedModelId = useSettingsStore((s) => s.aiSelectedModelId)
  const setAiSelectedModelId = useSettingsStore((s) => s.setAiSelectedModelId)
  const aiUseCustomProvider = useSettingsStore((s) => s.aiUseCustomProvider)
  const setAiCustomProviderEnabled = useSettingsStore((s) => s.setAiCustomProviderEnabled)
  const aiProviderPreset = useSettingsStore((s) => s.aiProviderPreset)
  const setAiProviderPreset = useSettingsStore((s) => s.setAiProviderPreset)
  const aiCustomBaseURL = useSettingsStore((s) => s.aiCustomBaseURL)
  const aiCustomApiKey = useSettingsStore((s) => s.aiCustomApiKey)
  const aiCustomModelOptions = useSettingsStore((s) => s.aiCustomModelOptions)
  const saveAiCustomConfig = useSettingsStore((s) => s.saveAiCustomConfig)
  const aiQuickSaveEnabled = useSettingsStore((s) => s.aiQuickSaveEnabled)
  const setAiQuickSaveEnabled = useSettingsStore((s) => s.setAiQuickSaveEnabled)
  const windowHeight = useSettingsStore((s) => s.windowHeight)
  const setWindowHeight = useSettingsStore((s) => s.setWindowHeight)

  const usingLegacyUToolsAi = aiAllowLegacyUTools && !aiUseCustomProvider
  // 第三方模型列表取自用户拉取结果；历史兼容的 uTools AI 仍回落到默认模型占位。
  const modelOptions = aiUseCustomProvider && aiCustomModelOptions.length > 0
    ? aiCustomModelOptions
    : [{ id: DEFAULT_AI_MODEL, label: DEFAULT_AI_MODEL }]

  // 自愈：选中模型若不在可选项内（如换供应商后旧 provider 的模型 id 残留），归一到首个可选项。
  // 否则下拉视觉显示首项、但持久化仍是旧 id，元数据生成会把旧模型发给新端点 → “旧模型不能访问”。
  useEffect(() => {
    if (!modelOptions.some((m) => m.id === aiSelectedModelId)) {
      setAiSelectedModelId(modelOptions[0]?.id ?? DEFAULT_AI_MODEL)
    }
  }, [aiSelectedModelId, modelOptions, setAiSelectedModelId])

  // 自定义供应商：API Key 本地草稿 + 拉取模型列表状态（BaseURL 跟随预置，custom 时可编辑）
  const [apiKeyDraft, setApiKeyDraft] = useState(aiCustomApiKey)
  const [customUrlDraft, setCustomUrlDraft] = useState(aiCustomBaseURL)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchHint, setModelFetchHint] = useState<{ ok: boolean; msg: string } | null>(null)
  // 切换供应商预置后，把草稿与 store 对齐（store 已在 setAiProviderPreset 里填好 BaseURL）
  useEffect(() => {
    setCustomUrlDraft(aiCustomBaseURL)
  }, [aiCustomBaseURL])
  useEffect(() => {
    setApiKeyDraft(aiCustomApiKey)
  }, [aiCustomApiKey])

  // 选预置：custom 用草稿地址，其余用预置内置地址
  const effectiveBaseURL = aiProviderPreset === 'custom' ? customUrlDraft : aiCustomBaseURL

  const handleFetchModels = useCallback(async () => {
    const baseURL = effectiveBaseURL.trim()
    const apiKey = apiKeyDraft.trim()
    if (!apiKey) {
      setModelFetchHint({ ok: false, msg: '请先填写 API Key' })
      return
    }
    setFetchingModels(true)
    setModelFetchHint(null)
    try {
      const models = await fetchCustomAIModels({ baseURL, apiKey })
      saveAiCustomConfig({ baseURL, apiKey, modelOptions: models })
      setModelFetchHint({ ok: true, msg: `已获取 ${models.length} 个模型` })
    } catch (err) {
      setModelFetchHint({ ok: false, msg: err instanceof Error ? err.message : '获取模型列表失败' })
    } finally {
      setFetchingModels(false)
    }
  }, [effectiveBaseURL, apiKeyDraft, saveAiCustomConfig])

  // 主题：外观 seg 与 HomePage themePref 联动
  const themeSeg: '跟随' | '明亮' | '暗黑' =
    themePref === 'system' ? '跟随' : themePref === 'dark' ? '暗黑' : '明亮'
  const viewSeg: '列表' | '网格' = homeViewMode === 'grid' ? '网格' : '列表'
  const compact = density === 'compact'
  const cols = String(gridColumns)
  const iconSizeSeg: '小' | '中' | '大' = gridIconSize === 'small' ? '小' : gridIconSize === 'large' ? '大' : '中'

  // 隐藏的 file input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 导入文件处理
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 重置 input，方便再次选同一文件
    e.target.value = ''
    try {
      const text = await file.text()
      const bookmarkStore = useBookmarkStore.getState()

      if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
        // HTML 书签导入
        const parsed = parseHtmlBookmarks(text)
        const importData = importHtmlBookmarks(parsed)
        const summary = applyImportDataToStore(bookmarkStore, importData, 'merge')
        onToast?.(`导入成功：${summary.added.bookmarks} 条书签`)
      } else {
        // JSON 导入
        const result = parseJsonImportText(text)
        if (!result.ok) {
          onToast?.(`导入失败：${result.message}`)
          return
        }
        const summary = applyImportDataToStore(bookmarkStore, result.data, 'merge')
        onToast?.(`导入成功：${summary.added.bookmarks} 条书签`)
      }
    } catch (err) {
      console.error('[Import] 导入失败', err)
      onToast?.('导入失败，请检查文件格式')
    }
  }, [onToast])

  const handleResetBookmarks = useCallback(() => {
    if (
      !window.confirm(
        '确定重置为默认书签？当前全部分组与书签将被替换为内置示例（含站点图标），此操作不可撤销。'
      )
    ) {
      return
    }
    useBookmarkStore.getState().resetToDefaultBookmarks()
    onToast?.('已恢复默认书签')
  }, [onToast])

  // 导出 JSON
  const handleExport = useCallback(() => {
    const { groups, bookmarks } = useBookmarkStore.getState()
    const data = JSON.stringify({ groups, bookmarks }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `goose-marks-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onToast?.('备份已下载')
  }, [onToast])

  return (
    <>
      <div className="set-section" id="set-general">
        <h2><Ico name="settings" />通用设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">外观主题</div><div className="rd">跟随系统 / 明亮 / 暗黑</div></div>
            <Seg
              opts={['跟随', '明亮', '暗黑']}
              value={themeSeg}
              onChange={(v) => {
                if (v === '暗黑') onThemeChange?.('dark')
                else if (v === '明亮') onThemeChange?.('light')
                else onThemeChange?.('system')
              }}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">默认视图</div><div className="rd">呼出后展示的书签布局</div></div>
            <Seg
              opts={['列表', '网格']}
              value={viewSeg}
              onChange={(v) => setHomeViewMode(v === '网格' ? 'grid' : 'list')}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">紧凑密度</div><div className="rd">减小卡片间距，单屏显示更多</div></div>
            <div
              className={`g-switch${compact ? ' on' : ''}`}
              onClick={() => setDensity(compact ? 'regular' : 'compact')}
            />
          </div>
          {window.utools && (
            <>
              <div className="set-row">
                <div><div className="rt">打开后自动关闭窗口</div><div className="rd">点击书签跳转后收起插件</div></div>
                <div
                  className={`g-switch${autoCloseWindow ? ' on' : ''}`}
                  onClick={() => setAutoCloseWindow(!autoCloseWindow)}
                />
              </div>
              <div className="set-row">
                <div><div className="rt">使用 uTools 内置浏览器</div><div className="rd">默认用系统默认浏览器打开书签，开启后改用 uTools 内置浏览器</div></div>
                <div
                  className={`g-switch${useUtoolsBrowser ? ' on' : ''}`}
                  onClick={() => setUseUtoolsBrowser(!useUtoolsBrowser)}
                />
              </div>
              <div className="set-row">
                <div><div className="rt">面板连贯模式</div><div className="rd">再次唤起插件时保留上次搜索和浏览位置，关闭则每次回到主页</div></div>
                <div
                  className={`g-switch${panelContinuous ? ' on' : ''}`}
                  onClick={() => setPanelContinuous(!panelContinuous)}
                />
              </div>
              <div className="set-row">
                <div><div className="rt">窗口高度</div><div className="rd">插件展开高度（{WINDOW_HEIGHT_MIN}–{WINDOW_HEIGHT_MAX}px），下次呼出自动恢复</div></div>
                <div className="stepper">
                  <button
                    className="stepper-btn"
                    disabled={windowHeight <= WINDOW_HEIGHT_MIN}
                    onClick={() => setWindowHeight(windowHeight - 20)}
                    aria-label="减小窗口高度"
                  ><Ico name="minus" /></button>
                  <span className="stepper-val">{windowHeight}px</span>
                  <button
                    className="stepper-btn"
                    disabled={windowHeight >= WINDOW_HEIGHT_MAX}
                    onClick={() => setWindowHeight(windowHeight + 20)}
                    aria-label="增大窗口高度"
                  ><Ico name="plus" /></button>
                </div>
              </div>
            </>
          )}
          <div className="set-row">
            <div><div className="rt">背景彩蛋</div><div className="rd">暗黑模式下的动态背景（可选）</div></div>
            <div
              className={`g-switch${easterEggEnabled ? ' on' : ''}`}
              onClick={() => setEasterEggEnabled(!easterEggEnabled)}
            />
          </div>
          {easterEggEnabled && (
            <div className="set-row">
              <div><div className="rt">彩蛋样式</div><div className="rd">星空或黑洞（引力透镜渲染）</div></div>
              <Seg
                opts={['星空', '黑洞']}
                value={easterEggVariant === 'blackhole' ? '黑洞' : '星空'}
                onChange={(v) => setEasterEggVariant(v === '黑洞' ? 'blackhole' : 'starry')}
              />
            </div>
          )}
        </div>
      </div>

      <div className="set-section" id="set-list">
        <h2><Ico name="list" />列表设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">显示描述</div><div className="rd">在书签条目下方显示描述文字</div></div>
            <div
              className={`g-switch${listShowDescription ? ' on' : ''}`}
              onClick={() => setListShowDescription(!listShowDescription)}
            />
          </div>
          <div className={`set-row${listShowDescription ? '' : ' is-off'}`} aria-disabled={!listShowDescription}>
            <div><div className="rt">完整显示描述</div><div className="rd">描述完整换行展示，不截断为单行省略号</div></div>
            <div
              className={`g-switch${listFullDescription ? ' on' : ''}`}
              onClick={() => listShowDescription && setListFullDescription(!listFullDescription)}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">无描述时隐藏网址</div><div className="rd">书签没有描述时，不用网址占位</div></div>
            <div
              className={`g-switch${listHideUrlWithoutDescription ? ' on' : ''}`}
              onClick={() => setListHideUrlWithoutDescription(!listHideUrlWithoutDescription)}
            />
          </div>
        </div>
      </div>

      <div className="set-section" id="set-grid">
        <h2><Ico name="layout-grid" />网格设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">网格列数</div><div className="rd">网格视图每行显示的书签数量</div></div>
            <Seg
              opts={['2', '3', '4', '5']}
              value={cols}
              onChange={(v) => setGridColumns(Number(v))}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">图标大小</div><div className="rd">宫格卡片中书签图标的尺寸</div></div>
            <Seg
              opts={['小', '中', '大']}
              value={iconSizeSeg}
              onChange={(v) => setGridIconSize(v === '小' ? 'small' : v === '大' ? 'large' : 'medium')}
            />
          </div>
        </div>
      </div>

      <div className="set-section" id="set-ai">
        <h2><Ico name="sparkles" />AI 助手</h2>
        <div className="set-card">
          {/* 第一项：总开关。关闭后下方全部禁用置灰 */}
          <div className="set-row">
            <div><div className="rt">启用 AI 智能整理</div><div className="rd">自动预填标题、描述并推荐分类</div></div>
            <div
              className={`g-switch ai${aiEnabled ? ' on' : ''}`}
              onClick={() => setAiEnabled(!aiEnabled)}
            />
          </div>

          {/* 下方所有 AI 配置：未启用时整体禁用置灰（pointer-events:none + 降透明度） */}
          <div className={`set-ai-body${aiEnabled ? '' : ' is-off'}`} aria-disabled={!aiEnabled}>
            <div className="set-row">
              <div>
                <div className="rt">AI 供应商</div>
                <div className="rd">
                  {aiAllowLegacyUTools
                    ? '默认仅支持第三方 OpenAI 协议端点；你之前已手动开启过 AI，可继续保留旧版 uTools AI'
                    : '仅支持第三方 OpenAI 协议端点，不再为新用户启用 uTools 内置 AI'}
                </div>
              </div>
              {aiAllowLegacyUTools ? (
                <div
                  className={`g-switch ai${aiUseCustomProvider ? ' on' : ''}`}
                  onClick={() => aiEnabled && setAiCustomProviderEnabled(!aiUseCustomProvider)}
                  title={aiUseCustomProvider ? '当前使用第三方供应商' : '当前使用历史兼容的 uTools AI'}
                />
              ) : (
                <div className="ai-pill">仅第三方</div>
              )}
            </div>

            {!usingLegacyUToolsAi && (
              <>
                <div className="ai-prov-label">选择供应商</div>
                <div className="ai-prov-grid">
                  {AI_PROVIDER_PRESETS.map((p) => (
                    <div
                      key={p.id}
                      className={`ai-prov-card${aiProviderPreset === p.id ? ' on' : ''}`}
                      onClick={() => aiEnabled && setAiProviderPreset(p.id)}
                    >
                      <div className="ai-prov-name"><span className="ai-prov-dot" />{p.label}</div>
                      <div className="ai-prov-url">{p.hint}</div>
                    </div>
                  ))}
                </div>

                <div className="ai-prov-fields">
                  {aiProviderPreset === 'custom' && (
                    <div>
                      <label className="ai-fld-lbl">Base URL（OpenAI 兼容）</label>
                      <input
                        className="ai-fld-input"
                        value={customUrlDraft}
                        placeholder="https://api.example.com/v1"
                        onChange={(e) => setCustomUrlDraft(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="ai-fld-lbl">API Key</label>
                    <div className="ai-fld-row">
                      <input
                        className="ai-fld-input"
                        type="password"
                        value={apiKeyDraft}
                        placeholder="sk-..."
                        onChange={(e) => setApiKeyDraft(e.target.value)}
                      />
                      <button
                        className="btn btn-ai"
                        style={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
                        disabled={fetchingModels || !apiKeyDraft.trim()}
                        onClick={handleFetchModels}
                      >
                        <Ico name={fetchingModels ? 'loader' : 'refresh-cw'} className={fetchingModels ? 'spin' : ''} />
                        {fetchingModels ? '获取中…' : '拉取模型'}
                      </button>
                    </div>
                    {modelFetchHint && (
                      <div className={`ai-fld-hint ${modelFetchHint.ok ? 'ok' : 'err'}`}>
                        <Ico name={modelFetchHint.ok ? 'check-circle' : 'alert-circle'} />
                        {modelFetchHint.msg}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="set-row">
              <div><div className="rt">模型</div><div className="rd">用于生成元数据的对话模型</div></div>
              <div className="select select-native">
                <Ico name="cpu" />
                <select
                  value={aiSelectedModelId || DEFAULT_AI_MODEL}
                  onChange={(e) => setAiSelectedModelId(e.target.value)}
                >
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.label || m.id}</option>
                  ))}
                </select>
                <Ico name="chevron-down" />
              </div>
            </div>
            {usingLegacyUToolsAi && (
              <div className="set-row">
                <div><div className="rt">兼容模式</div><div className="rd">你沿用的是历史已开启的 uTools AI；切到第三方后将按新规则运行</div></div>
                <div className="ai-pill">历史兼容</div>
              </div>
            )}
            <div className="set-row">
              <div><div className="rt">AI 快捷保存</div><div className="rd">全局快捷键直接由 AI 整理并保存当前网址</div></div>
              <div className={`g-switch ai${aiQuickSaveEnabled ? ' on' : ''}`} onClick={() => aiEnabled && setAiQuickSaveEnabled(!aiQuickSaveEnabled)} />
            </div>
          </div>
        </div>
      </div>

      <div className="set-section" id="set-data">
        <h2><Ico name="database" />导入与备份</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">导入浏览器书签</div><div className="rd">支持 Chrome / Edge / Firefox 导出的 HTML</div></div>
            {/* 隐藏的 file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <button
              className="btn btn-outline"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Ico name="upload" />选择文件
            </button>
          </div>
          <div className="set-row">
            <div><div className="rt">导出备份</div><div className="rd">下载全部分组与书签（JSON）</div></div>
            <button
              className="btn btn-primary"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={handleExport}
            >
              <Ico name="download" />导出
            </button>
          </div>
          <div className="set-row">
            <div><div className="rt">重置书签</div><div className="rd">恢复为内置默认分组与示例链接（图标已内置）</div></div>
            <button
              className="btn btn-ghost danger"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={handleResetBookmarks}
            >
              <Ico name="rotate-ccw" />重置
            </button>
          </div>
        </div>
      </div>

      <div className="set-section" id="set-categories">
        <h2><Ico name="folder" />分组管理</h2>
        <div className="set-card">
          <div className="set-row set-row-link" onClick={onGoToGroups}>
            <div><div className="rt">分组管理</div><div className="rd">创建、编辑和排序分组</div></div>
            <Ico name="chevron-right" className="set-row-link-icon" />
          </div>
        </div>
      </div>

    </>
  )
}
