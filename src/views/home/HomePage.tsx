import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import { parseJsonImportText, importHtmlBookmarks, applyImportDataToStore } from '@/hooks/useImportExport'
import { parseHtmlBookmarks } from '@/lib/htmlBookmarkParser'
import { Ico } from './icon'
import { buildHomeGroups, trashCount, type HomeGroup, type HomeItem } from './viewModel'
import './home.css'

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

type Screen = 'list' | 'grid' | 'search' | 'add' | 'settings'
type ViewMode = 'list' | 'grid'
type Theme = 'light' | 'dark'

interface CtxState {
  open: boolean
  x: number
  y: number
}

const SET_NAV: Array<[string, string]> = [
  ['通用设置', 'settings'],
  ['AI 助手', 'sparkles'],
  ['分组管理', 'folder'],
  ['导入与备份', 'database'],
  ['浏览器拓展', 'refresh-cw'],
  ['帮助与统计', 'info']
]

export default function HomePage() {
  const groups = useBookmarkStore((s) => s.groups)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)

  // 业务操作 hook
  const { openBookmarkLink, openUrlInUtoolsBrowser, copyBookmarkUrl, handleRemove } = useBookmarkOperations()

  // settings store
  const homeViewMode = useSettingsStore((s) => s.homeViewMode)
  const setHomeViewMode = useSettingsStore((s) => s.setHomeViewMode)

  const homeGroups: HomeGroup[] = useMemo(
    () => buildHomeGroups(groups, bookmarks),
    [groups, bookmarks]
  )
  const trashN = useMemo(() => trashCount(groups), [groups])

  // ---- UI 状态 ----
  // 主题：从 localStorage 读取初始值
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('goose-marks.theme-mode') as Theme | null
    return saved === 'dark' ? 'dark' : 'light'
  })
  // 视图：从 settings store 读取初始值
  const [view, setView] = useState<ViewMode>(() =>
    homeViewMode === 'grid' ? 'grid' : 'list'
  )
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)
  const [setNavIdx, setSetNavIdx] = useState(0)
  const [ctx, setCtx] = useState<CtxState>({ open: false, x: 0, y: 0 })
  // 当前被右键点击的书签项（用于右键菜单操作）
  const [ctxItem, setCtxItem] = useState<HomeItem | null>(null)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastTitle, setToastTitle] = useState('')
  const [toastKey, setToastKey] = useState(0)
  const [searchVal, setSearchVal] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const headerSearchRef = useRef<HTMLInputElement>(null)
  const suppressHeaderFocusRef = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)

  /** 网格列数，与 home.css `.grid` 的 repeat(N,1fr) 保持一致 */
  const GRID_COLS = 3

  // 首个分组/子分组作为默认激活项（对齐设计稿首屏：常用/开发 高亮）
  const firstGroup = homeGroups[0]
  const firstSub = firstGroup?.subs[0]
  useEffect(() => {
    if (!activeSubId && firstSub) setActiveSubId(firstSub.id)
  }, [activeSubId, firstSub])
  useEffect(() => {
    // 默认选中首个分组首条书签（对齐设计稿列表首项 sel）
    if (!selectedId && firstSub?.items[0]) setSelectedId(firstSub.items[0].id)
  }, [selectedId, firstSub])

  // 打开搜索浮层时自动聚焦输入框（overlay 常驻 DOM，autoFocus 不会重触发，需手动 focus）
  useEffect(() => {
    if (screen === 'search') {
      // 等浮层 display 切换为 flex 后再 focus
      const id = requestAnimationFrame(() => searchInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [screen])

  // 软件打开后 50ms 自动聚焦顶栏搜索框（APP 和 uTools 模式均适用）
  // suppressHeaderFocusRef 防止程序聚焦触发 onFocus → 打开浮层
  useEffect(() => {
    const timer = setTimeout(() => {
      suppressHeaderFocusRef.current = true
      headerSearchRef.current?.focus()
      // 下一个微任务后重置，避免影响用户手动点击
      queueMicrotask(() => { suppressHeaderFocusRef.current = false })
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // 网格视图当前展示的子分组（默认首个分组的首个子分组）
  const gridSub = useMemo(() => {
    if (!firstGroup) return null
    return firstGroup.subs.find((s) => s.id === activeSubId) || firstGroup.subs[0] || null
  }, [firstGroup, activeSubId])

  // 当前视图下可键盘导航的扁平书签列表
  const navigableItems = useMemo<HomeItem[]>(() => {
    if (view === 'grid') return gridSub?.items ?? []
    return homeGroups.flatMap((g) => g.subs.flatMap((s) => s.items))
  }, [view, homeGroups, gridSub])

  const searchMatches = useMemo<HomeItem[]>(() => {
    const all = homeGroups.flatMap((g) => g.subs.flatMap((s) => s.items))
    const q = searchVal.trim().toLowerCase()
    if (!q) return all.slice(0, 6)
    return all
      .filter(
        (b) =>
          b.ttl.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          b.dsc.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [homeGroups, searchVal])

  const [searchSelectedIdx, setSearchSelectedIdx] = useState(0)

  // 搜索词或结果变化时重置选中项
  useEffect(() => {
    setSearchSelectedIdx(0)
  }, [searchVal, searchMatches.length])

  // 切换视图后，若当前选中项不在可导航列表内则回退到首项
  useEffect(() => {
    if (!navigableItems.length) return
    if (!navigableItems.some((i) => i.id === selectedId)) {
      setSelectedId(navigableItems[0].id)
    }
  }, [navigableItems, selectedId])

  // ---- 交互：明暗切换（持久化到 localStorage） ----
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('goose-marks.theme-mode', next)
      return next
    })
  }, [])

  // ---- 交互：列表/网格切换（设计稿 setView，同步持久化到 settings store） ----
  const changeView = useCallback(
    (v: ViewMode) => {
      setView(v)
      setHomeViewMode(v)
      // 仅在书签视图内切换（搜索/设置/表单态下不切走）
      setScreen((prev) => (prev === 'list' || prev === 'grid' ? v : prev))
      // 网格视图只展示首个分组的子分组，切到网格时把侧栏高亮收敛回首组首子分组，
      // 避免侧栏停留在 list 模式下选中的其他组子分组、与网格内容不一致。
      if (v === 'grid' && firstGroup) {
        const inFirst = firstGroup.subs.some((s) => s.id === activeSubId)
        if (!inFirst) setActiveSubId(firstGroup.subs[0]?.id ?? null)
      }
    },
    [firstGroup, activeSubId, setHomeViewMode]
  )

  // ---- 交互：齿轮做设置开关 ----
  const toggleSettings = useCallback(() => {
    setScreen((prev) => (prev === 'settings' ? view : 'settings'))
  }, [view])

  // ---- 交互：右键菜单（记录被右键的书签项） ----
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
      outer: for (const g of homeGroups) {
        for (const s of g.subs) {
          const hit = s.items.find((b) => b.id === itemId)
          if (hit) { found = hit; break outer }
        }
      }
      setCtxItem(found)
    }
    const r = root.getBoundingClientRect()
    const menuW = ctxMenuRef.current?.offsetWidth || 200
    let left = e.clientX - r.left
    let top = e.clientY - r.top
    left = Math.min(left, r.width - menuW - 12)
    top = Math.min(top, r.height - 250)
    setCtx({ open: true, x: Math.max(8, left), y: Math.max(8, top) })
  }, [homeGroups])
  const closeCtx = useCallback(() => setCtx((c) => (c.open ? { ...c, open: false } : c)), [])

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

  // 选中项变化时滚入可视区域
  useEffect(() => {
    if (screen !== 'list' && screen !== 'grid') return
    if (!selectedId) return
    const root = contentRef.current
    if (!root) return
    const sel = root.querySelector<HTMLElement>(`[data-item-id="${selectedId}"]`)
    sel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId, screen, view])

  const syncSidebarForItem = useCallback(
    (itemId: string) => {
      for (const g of homeGroups) {
        for (const s of g.subs) {
          if (s.items.some((b) => b.id === itemId)) {
            setActiveSubId(s.id)
            return
          }
        }
      }
    },
    [homeGroups]
  )

  // ---- 全局键盘：Esc / ⌘K / 方向键导航 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setScreen((prev) => (prev === 'search' || prev === 'add' || prev === 'settings' ? view : prev))
        closeCtx()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setScreen('search')
        return
      }

      const active = document.activeElement as HTMLElement | null
      const inEditable =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)

      // 搜索浮层：↑↓ 选择 / Enter 打开（搜索框聚焦时也响应）
      if (screen === 'search') {
        if (inEditable && active !== searchInputRef.current) return
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const total = searchMatches.length
          if (!total) return
          e.preventDefault()
          setSearchSelectedIdx((i) =>
            e.key === 'ArrowDown' ? Math.min(i + 1, total - 1) : Math.max(i - 1, 0)
          )
        } else if (e.key === 'Enter') {
          const hit = searchMatches[searchSelectedIdx]
          if (hit) {
            e.preventDefault()
            // 从 bookmarks 数组找到真实 Bookmark 对象
            const realBookmark = bookmarks.find((b) => b.id === hit.id)
            if (realBookmark) openBookmarkLink(realBookmark, { openMethod: 'keyboard' })
          }
        }
        return
      }

      if (screen !== 'list' && screen !== 'grid') return
      if (ctx.open) return
      // 顶栏 readOnly 搜索框聚焦时，字符键直接打开搜索浮层
      if (inEditable && active === headerSearchRef.current) {
        if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
          e.preventDefault()
          setScreen('search')
        }
        return
      }
      if (inEditable) return
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
      const next = items[newIdx]
      if (!next) return
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
    searchMatches,
    searchSelectedIdx,
    syncSidebarForItem,
    GRID_COLS,
    bookmarks,
    openBookmarkLink
  ])

  // ---- 全局点击：点空白关闭右键菜单 ----
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ctx-menu')) closeCtx()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [closeCtx])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // 当前选中书签（供右键「复制」Toast 副标题展示书签名，对齐设计稿）
  const selectedItem = useMemo<HomeItem | null>(() => {
    if (!selectedId) return null
    for (const g of homeGroups) for (const s of g.subs) {
      const hit = s.items.find((b) => b.id === selectedId)
      if (hit) return hit
    }
    return null
  }, [homeGroups, selectedId])

  const rootCls = ['goose-home', ctx.open ? 'ctx-open' : '', toastOpen ? 'toast-open' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={rootCls} data-theme={theme} data-screen={screen}>
      <div className="window">
        {/* ---------- Header ---------- */}
        <header className="app-header">
          <div className="search-field">
            <Ico name="search" />
            <input
              ref={headerSearchRef}
              type="text"
              placeholder="搜索书签…"
              value=""
              readOnly
              onFocus={() => { if (!suppressHeaderFocusRef.current) setScreen('search') }}
              onClick={() => setScreen('search')}
            />
          </div>
          <div className="seg" style={{ padding: 2, background: 'var(--surface)' }}>
            <button
              className={view === 'list' ? 'on' : ''}
              style={{ padding: '6px 9px' }}
              onClick={() => changeView('list')}
              title="列表"
            >
              <Ico name="list" />
            </button>
            <button
              className={view === 'grid' ? 'on' : ''}
              style={{ padding: '6px 9px' }}
              onClick={() => changeView('grid')}
              title="网格"
            >
              <Ico name="layout-grid" />
            </button>
          </div>
          <button className="icon-btn" title="新增书签" onClick={() => setScreen('add')}>
            <Ico name="plus" />
          </button>
          <div className="h-divider" />
          <button
            className={`icon-btn${screen === 'settings' ? ' on' : ''}`}
            title="设置"
            onClick={toggleSettings}
          >
            <Ico name="settings" />
          </button>
          <button className="icon-btn theme-mini" title="主题" onClick={toggleTheme}>
            <Ico name={theme === 'dark' ? 'sun' : 'moon-star'} />
          </button>
        </header>

        {/* ---------- Main ---------- */}
        <div className="app-main">
          {/* Sidebar */}
          <aside className="sidebar">
            {view === 'grid'
              ? firstGroup && (
                  <div className="grp">
                    <div className="grp-label">
                      <span className="dot" />
                      {firstGroup.name}
                    </div>
                    {firstGroup.subs.map((s, i) => (
                      <button
                        key={s.id}
                        className={`nav-item${(activeSubId ? s.id === activeSubId : i === 0) ? ' on' : ''}`}
                        onClick={() => setActiveSubId(s.id)}
                      >
                        <span>{s.name}</span>
                        <span className="count">{s.items.length}</span>
                      </button>
                    ))}
                  </div>
                )
              : homeGroups.map((g) => (
                  <div className="grp" key={g.id}>
                    <div className="grp-label">
                      <span className="dot" />
                      {g.name}
                    </div>
                    {g.subs.map((s) => (
                      <button
                        key={s.id}
                        className={`nav-item${s.id === activeSubId ? ' on' : ''}`}
                        onClick={() => setActiveSubId(s.id)}
                      >
                        <span>{s.name}</span>
                        <span className="count">{s.items.length}</span>
                      </button>
                    ))}
                  </div>
                ))}
            <button className="trash" title="回收站">
              <Ico name="trash-2" />
              <span>回收站</span>
              {trashN > 0 && <span className="count">{trashN}</span>}
            </button>
          </aside>

          {/* Center */}
          <div className="center">
            <div
              ref={contentRef}
              className="content"
              tabIndex={-1}
              onContextMenu={openCtx}
            >
              {view === 'grid' ? (
                <GridContent
                  sub={gridSub}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onOpen={(item) => {
                    const realBookmark = bookmarks.find((b) => b.id === item.id)
                    if (realBookmark) openBookmarkLink(realBookmark, { openMethod: 'click' })
                  }}
                />
              ) : (
                <ListContent
                  groups={homeGroups}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onOpen={(item) => {
                    const realBookmark = bookmarks.find((b) => b.id === item.id)
                    if (realBookmark) openBookmarkLink(realBookmark, { openMethod: 'click' })
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ---------- Settings ---------- */}
        <div className="settings">
          <nav className="set-nav">
            {SET_NAV.map(([label, ic], i) => (
              <button
                key={label}
                className={i === setNavIdx ? 'on' : ''}
                onClick={() => setSetNavIdx(i)}
              >
                <Ico name={ic} />
                {label}
              </button>
            ))}
            <button className="feedback">
              <Ico name="message-square" />
              快速反馈
            </button>
          </nav>
          <div className="set-main">
            <div className="set-wrap">
              <SettingsContent
                theme={theme}
                view={view}
                onThemeChange={(t) => {
                  setTheme(t)
                  localStorage.setItem('goose-marks.theme-mode', t)
                }}
                onToast={fireToast}
              />
            </div>
          </div>
        </div>

        {/* ---------- Search overlay ---------- */}
        <div className="overlay" onMouseDown={(e) => {
          if ((e.target as HTMLElement).classList.contains('overlay')) setScreen(view)
        }}>
          <div className="overlay-search">
            <div className="overlay-search-row">
              <div className="big-search">
                <Ico name="search" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchVal}
                  autoFocus={screen === 'search'}
                  placeholder="搜索书签 / 输入网址…"
                  onChange={(e) => setSearchVal(e.target.value)}
                />
              </div>
              <button className="overlay-close" title="关闭搜索 (Esc)" onClick={() => setScreen(view)}>
                <Ico name="x" />
              </button>
            </div>
          </div>
          <div className="overlay-results">
            {searchMatches.map((b, i) => (
              <BookmarkCard
                key={b.id}
                item={b}
                selected={i === searchSelectedIdx}
                style={{ marginTop: 4 }}
                trailing={i === searchSelectedIdx ? <span className="kbd">⏎</span> : undefined}
              />
            ))}
          </div>
          <div className="overlay-foot">
            <span className="hint"><span className="key">↑</span><span className="key">↓</span> 选择</span>
            <span className="hint"><span className="key">⏎</span> 打开</span>
            <span className="hint"><span className="key">⌘</span><span className="key">C</span> 复制链接</span>
            <span className="hint"><span className="key">esc</span> 关闭</span>
          </div>
        </div>

        {/* ---------- Form page (add/edit) ---------- */}
        <FormPage onBack={() => setScreen(view)} />

        {/* ---------- Context menu ---------- */}
        <div ref={ctxMenuRef} className="ctx-menu" style={{ left: ctx.x, top: ctx.y }}>
          <button onClick={() => {
            closeCtx()
            if (ctxItem) {
              const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
              if (realBookmark) openBookmarkLink(realBookmark, { openMethod: 'click' })
            }
          }}><Ico name="external-link" />打开</button>
          <button onClick={() => {
            closeCtx()
            if (ctxItem) openUrlInUtoolsBrowser(ctxItem.url)
          }}><Ico name="globe" />在内置浏览器打开</button>
          <button onClick={() => {
            closeCtx()
            if (ctxItem) {
              const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
              // copyBookmarkUrl 内部已有 toast，不再调 fireToast
              if (realBookmark) copyBookmarkUrl(realBookmark)
            }
          }}><Ico name="copy" />复制链接</button>
          <button onClick={() => { closeCtx(); setScreen('add') }}><Ico name="pencil" />编辑</button>
          <div className="ctx-sep" />
          <button className="danger" onClick={() => {
            closeCtx()
            if (ctxItem) {
              const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
              if (realBookmark) handleRemove(realBookmark)
            }
          }}><Ico name="trash-2" />删除</button>
        </div>

        {/* ---------- Toast ---------- */}
        <div className="toast" key={toastKey}>
          <span className="tic"><Ico name="check" /></span>
          <div>
            <div className="tt">链接已复制</div>
            <div className="td">{toastTitle ? `${toastTitle} · 已写入剪贴板` : '已写入剪贴板'}</div>
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
  return (
    <div className={cls} style={{ background: item.color }}>
      {showImg ? (
        <img src={item.iconUrl} alt="" onError={() => setImgError(true)} />
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
  style
}: {
  item: HomeItem
  selected?: boolean
  trailing?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className={`card${selected ? ' sel' : ''}`} style={style} data-item-id={item.id}>
      <Fav item={item} />
      <div className="meta">
        <div className="ttl">{item.ttl}</div>
        <div className="dsc">{item.dsc}</div>
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
  onOpen
}: {
  groups: HomeGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
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
          <div key={`${g.id}-${s.id}`}>
            <div className="sec-head">
              <span className="g">{g.name}</span>
              <span className="s">/ {s.name} · {s.items.length}</span>
            </div>
            {s.items.map((b) => (
              <div key={b.id} onClick={() => { onSelect(b.id); onOpen?.(b) }}>
                <BookmarkCard item={b} selected={b.id === selectedId} />
              </div>
            ))}
          </div>
        ))
      )}
    </>
  )
}

function GridContent({
  sub,
  selectedId,
  onSelect,
  onOpen
}: {
  sub: { items: HomeItem[] } | null
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  if (!sub || !sub.items.length) {
    return (
      <div className="empty">
        <Ico name="inbox" />
        <span>该分组暂无书签</span>
      </div>
    )
  }
  return (
    <div className="grid">
      {sub.items.map((b) => (
        <div
          key={b.id}
          className={`gcard${b.id === selectedId ? ' sel' : ''}`}
          data-item-id={b.id}
          onClick={() => { onSelect(b.id); onOpen?.(b) }}
        >
          <Fav item={b} />
          <div className="ttl">{b.ttl}</div>
          <div className="url">{b.host}</div>
        </div>
      ))}
    </div>
  )
}

/* ---------- 新增/编辑表单页（静态界面态，对齐设计稿 .formpage） ---------- */
function FormPage({ onBack }: { onBack: () => void }) {
  const [activeChip, setActiveChip] = useState('开发')
  const chips = ['开发', '设计', '文档', '协作', '模型', '阅读']
  return (
    <div className="formpage">
      <div className="form-head">
        <button className="back-btn" onClick={onBack}>
          <Ico name="arrow-left" />
        </button>
        <span className="ic"><Ico name="file-text" /></span>
        <h1>编辑书签</h1>
      </div>
      <div className="form-body">
        <div className="form-col">
          <section className="field">
            <div className="lbl">链接 / 模板</div>
            <div className="url-input">
              <input type="text" defaultValue="https://github.com/search?q={query}" />
              <button className="ai-trigger" title="AI 预填标题和描述">
                <Ico name="sparkles" />
              </button>
            </div>
            <div className="hint-text">URL 含 {'{query}'} 可作为模板，呼出后直接输入关键词跳转</div>
          </section>

          <section className="field">
            <div className="lbl">图标与标题</div>
            <div className="id-row">
              <div className="favcol">
                <div className="fav bigfav" style={{ background: '#1f2328' }}>GH</div>
                <div className="editfav-cap">修改图标</div>
              </div>
              <div className="id-fields">
                <input className="txt-input" defaultValue="GitHub 代码搜索" placeholder="网站标题" />
                <input
                  className="txt-input desc-input"
                  defaultValue="在 GitHub 全站搜索代码、仓库与 issue"
                  placeholder="网站描述（单行）"
                />
              </div>
            </div>
          </section>

          <section className="field">
            <div className="lbl">
              分类{' '}
              <button className="ai-pill">
                <Ico name="wand-sparkles" />AI 推荐
              </button>
            </div>
            <div className="ai-suggest">
              <Ico name="lightbulb" className="bulb" />
              <span className="txt">建议归入 <b>常用 / 开发</b></span>
              <button className="mini ok"><Ico name="check" /></button>
              <button className="mini no"><Ico name="x" /></button>
            </div>
            <div className="cat-chips">
              {chips.map((c) => (
                <span
                  key={c}
                  className={`chip${c === activeChip ? ' on' : ''}`}
                  onClick={() => setActiveChip(c)}
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        </div>

        <div className="form-foot">
          <button className="btn btn-ghost danger"><Ico name="trash-2" />删除</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onBack}>取消</button>
          <button className="btn btn-primary" onClick={onBack}>保存书签</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 设置页内容（接真实 store） ---------- */
function SettingsContent({
  theme,
  view,
  onThemeChange,
  onToast
}: {
  theme: Theme
  view: ViewMode
  onThemeChange?: (t: Theme) => void
  onToast?: (title?: string) => void
}) {
  // settings store
  const homeViewMode = useSettingsStore((s) => s.homeViewMode)
  const setHomeViewMode = useSettingsStore((s) => s.setHomeViewMode)
  const density = useSettingsStore((s) => s.density)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const autoCloseWindow = useSettingsStore((s) => s.autoCloseWindow)
  const setAutoCloseWindow = useSettingsStore((s) => s.setAutoCloseWindow)
  const gridColumns = useSettingsStore((s) => s.gridColumns)
  const setGridColumns = useSettingsStore((s) => s.setGridColumns)
  const easterEggEnabled = useSettingsStore((s) => s.easterEggEnabled)
  const setEasterEggEnabled = useSettingsStore((s) => s.setEasterEggEnabled)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const setAiEnabled = useSettingsStore((s) => s.setAiEnabled)
  const aiSelectedModelId = useSettingsStore((s) => s.aiSelectedModelId)

  // AI 快捷保存：UI 态（store 暂无此字段）
  const [aiQuickSave, setAiQuickSave] = useState(true)

  // 主题：外观 seg 与 HomePage theme state 联动
  const themeSeg: '跟随' | '明亮' | '暗黑' = theme === 'dark' ? '暗黑' : '明亮'
  const viewSeg: '列表' | '网格' = homeViewMode === 'grid' ? '网格' : '列表'
  const compact = density === 'compact'
  const cols = String(gridColumns)

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

  const Seg = <T extends string>({
    opts,
    value,
    onChange
  }: {
    opts: T[]
    value: T
    onChange: (v: T) => void
  }) => (
    <div className="radio-seg">
      {opts.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <div className="set-section">
        <h2><Ico name="settings" />通用设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">外观主题</div><div className="rd">跟随系统 / 明亮 / 暗黑</div></div>
            <Seg
              opts={['跟随', '明亮', '暗黑']}
              value={themeSeg}
              onChange={(v) => {
                if (v === '暗黑') onThemeChange?.('dark')
                else onThemeChange?.('light')
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
              className={`switch${compact ? ' on' : ''}`}
              onClick={() => setDensity(compact ? 'regular' : 'compact')}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">打开后自动关闭窗口</div><div className="rd">点击书签跳转后收起插件</div></div>
            <div
              className={`switch${autoCloseWindow ? ' on' : ''}`}
              onClick={() => setAutoCloseWindow(!autoCloseWindow)}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">网格列数</div><div className="rd">网格视图每行显示的书签数量</div></div>
            <Seg
              opts={['3', '4', '5']}
              value={cols}
              onChange={(v) => setGridColumns(Number(v))}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">星空背景彩蛋</div><div className="rd">暗黑模式下的动态星空（可选）</div></div>
            <div
              className={`switch${easterEggEnabled ? ' on' : ''}`}
              onClick={() => setEasterEggEnabled(!easterEggEnabled)}
            />
          </div>
        </div>
      </div>

      <div className="set-section">
        <h2><Ico name="sparkles" />AI 助手</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">启用 AI 智能整理</div><div className="rd">自动预填标题、描述并推荐分类</div></div>
            <div
              className={`switch ai${aiEnabled ? ' on' : ''}`}
              onClick={() => setAiEnabled(!aiEnabled)}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">模型</div><div className="rd">用于生成元数据的对话模型</div></div>
            <div className="select"><Ico name="cpu" />{aiSelectedModelId || 'Claude Haiku'}<Ico name="chevron-down" /></div>
          </div>
          <div className="set-row">
            <div><div className="rt">AI 快捷保存</div><div className="rd">全局快捷键直接由 AI 整理并保存当前网址</div></div>
            <div className={`switch ai${aiQuickSave ? ' on' : ''}`} onClick={() => setAiQuickSave((v) => !v)} />
          </div>
        </div>
      </div>

      <div className="set-section">
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
        </div>
      </div>
    </>
  )
}
