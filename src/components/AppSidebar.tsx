import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Clock, Folder, Layers, Moon, Search, Settings, Star, Sun, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import type { ActiveView } from '@/stores/bookmark'
import { Image } from '@/components/ui/image'
import { cn } from '@/lib/utils'

/**
 * AppSidebar（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 侧边导航：品牌头 + 搜索触发 + 二级分组树（展开/折叠）+ 回收站 + 底部设置/计数。
 * - store.selectGroup(g) → setActiveGroup(g)；store.selectSubGroup(s) → setActiveSubGroup(s)
 * - store.isBookmarkInTrash → 本地用回收站 bookmarkIds 集合判断
 * - 展开态：默认展开当前激活分组（旧版 watchEffect → useEffect）
 * - i-ph-* 图标改 lucide-react；nav-item / no-scrollbar 样式已迁移到 index.css
 */
export interface AppSidebarProps {
  /** 列表模式下当前滚动定位到的分组锚点（保留契约，组件内部不直接消费） */
  activeAnchorId?: string
  isUTools?: boolean
  isSettings?: boolean
  onScrollTo?: (anchorId: string) => void
  onEditGroup?: (groupId: string) => void
  onFocusSearch?: () => void
  onOpenSettings?: () => void
  isDark?: boolean
  onToggleDark?: () => void
}

interface TreeSub {
  id: string
  name: string
  count: number
  anchorId: string
}
interface TreeGroup {
  id: string
  name: string
  count: number
  children: TreeSub[]
}

export function AppSidebar({
  isUTools,
  isSettings,
  onScrollTo,
  onFocusSearch,
  onOpenSettings,
  isDark,
  onToggleDark
}: AppSidebarProps) {
  const groups = useBookmarkStore((s) => s.groups)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const activeSubGroupId = useBookmarkStore((s) => s.activeSubGroupId)
  const activeView = useBookmarkStore((s) => s.activeView)
  const setActiveGroup = useBookmarkStore((s) => s.setActiveGroup)
  const setActiveSubGroup = useBookmarkStore((s) => s.setActiveSubGroup)
  const setActiveView = useBookmarkStore((s) => s.setActiveView)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // 默认展开当前激活分组（等价旧版 watchEffect）
  useEffect(() => {
    if (activeGroupId && activeGroupId !== TRASH_GROUP_ID) {
      setExpanded((prev) =>
        prev[activeGroupId] === undefined ? { ...prev, [activeGroupId]: true } : prev
      )
    }
  }, [activeGroupId])

  // 回收站书签 id 集合（用于 totalCount 排除）
  const trashIds = useMemo(() => {
    const set = new Set<string>()
    const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
    trashGroup?.children.forEach((sub) => sub.bookmarkIds.forEach((id) => set.add(id)))
    return set
  }, [groups])

  const tree = useMemo<TreeGroup[]>(
    () =>
      groups
        .filter((g) => g.id !== TRASH_GROUP_ID && !g.isDeleted)
        .map((group) => {
          const children = group.children
            .filter((sub) => !sub.isDeleted)
            .map((sub) => {
              const count = sub.bookmarkIds
                .map((id) => bookmarks.find((b) => b.id === id))
                .filter((b) => b && !b.isDeleted).length
              return {
                id: sub.id,
                name: sub.name,
                count,
                anchorId: `section-${group.id}-${sub.id}`
              }
            })
          const count = children.reduce((sum, c) => sum + c.count, 0)
          return { id: group.id, name: group.name, count, children }
        }),
    [groups, bookmarks]
  )

  const totalCount = useMemo(
    () => bookmarks.filter((b) => !b.isDeleted && !trashIds.has(b.id)).length,
    [bookmarks, trashIds]
  )

  // 置顶计数：非回收站且 pinned === true
  const pinnedCount = useMemo(
    () => bookmarks.filter((b) => !b.isDeleted && !trashIds.has(b.id) && b.pinned === true).length,
    [bookmarks, trashIds]
  )

  // 最近使用计数：非回收站且曾经使用过（有 lastUsed）
  const recentCount = useMemo(
    () => bookmarks.filter((b) => !b.isDeleted && !trashIds.has(b.id) && !!b.lastUsed).length,
    [bookmarks, trashIds]
  )

  const isTrashActive = activeGroupId === TRASH_GROUP_ID

  // 虚拟视图固定项（仅在非回收站、非设置时高亮）
  const virtualViews: { key: Exclude<ActiveView, 'group'>; label: string; icon: LucideIcon; count: number }[] = [
    { key: 'all', label: '全部书签', icon: Layers, count: totalCount },
    { key: 'pinned', label: '置顶', icon: Star, count: pinnedCount },
    { key: 'recent', label: '最近使用', icon: Clock, count: recentCount }
  ]

  // 虚拟视图激活：activeView 命中且未进回收站/设置
  const isViewActive = (key: Exclude<ActiveView, 'group'>) =>
    !isSettings && !isTrashActive && activeView === key

  const toggleGroup = (groupId: string) => {
    setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const selectGroup = (groupId: string) => {
    setActiveGroup(groupId)
    setExpanded((prev) => (prev[groupId] ? prev : { ...prev, [groupId]: true }))
  }

  const selectSub = (groupId: string, subId: string, anchorId: string) => {
    setActiveGroup(groupId)
    setActiveSubGroup(subId)
    onScrollTo?.(anchorId)
  }

  // 与虚拟视图互斥：仅当 activeView === 'group' 时分组项才高亮
  const isGroupActive = (groupId: string) =>
    !isSettings && activeView === 'group' && activeGroupId === groupId && !isTrashActive
  const isSubActive = (groupId: string, subId: string) =>
    !isSettings &&
    activeView === 'group' &&
    activeGroupId === groupId &&
    activeSubGroupId === subId &&
    !isTrashActive

  return (
    <aside
      className={cn(
        'app-sidebar shrink-0 flex flex-col bg-card/40 border-r border-border/40',
        isUTools ? 'w-[208px]' : 'w-[228px]'
      )}
    >
      {/* 品牌头部 */}
      <div className="shrink-0 px-3.5 pt-3.5 pb-2 flex items-center gap-2.5 select-none">
        <Image src="logo.png" alt="logo" width={26} height={26} fallback="none" className="shrink-0 rounded-md bg-transparent" />
        <div className="min-w-0 leading-tight">
          <div className="text-[13.5px] font-semibold text-foreground truncate">鹅的书签</div>
          <div className="text-[10px] font-mono tracking-wider text-muted-foreground/60 truncate">
            {isUTools ? 'uTools 插件' : 'GOOSE MARKS'}
          </div>
        </div>
      </div>

      {/* 搜索触发 */}
      <div className="shrink-0 px-3 pt-1 pb-2">
        <button
          type="button"
          className="w-full h-[34px] flex items-center gap-2 px-2.5 rounded-lg border border-border bg-background/60 text-muted-foreground hover:bg-muted/50 transition-colors"
          onClick={() => onFocusSearch?.()}
        >
          <Search className="size-[15px]" />
          <span className="text-[13px] flex-1 text-left truncate">
            {isUTools ? '在主输入框搜索' : '搜索全部书签'}
          </span>
          {!isUTools && (
            <kbd className="text-[10px] font-mono text-muted-foreground/60 bg-muted/60 rounded px-1 py-0.5">
              ⌘K
            </kbd>
          )}
        </button>
      </div>

      {/* 分组树 */}
      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 pt-1 pb-2">
        {/* 虚拟视图：全部书签 / 置顶 / 最近使用（固定在分组树之上） */}
        <div className="flex flex-col gap-0.5 pb-1">
          {virtualViews.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              className={cn(
                'nav-item w-full flex items-center gap-2 px-2 h-8 rounded-md text-left transition-colors',
                isViewActive(key) ? 'nav-item--active' : 'nav-item--idle'
              )}
              onClick={() => setActiveView(key)}
            >
              <Icon className="size-[15px] shrink-0 opacity-80" />
              <span className="flex-1 truncate text-[13px] font-medium">{label}</span>
              {count > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground/50 tabular-nums">{count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="px-2 pb-1 pt-2 text-[10.5px] font-mono font-semibold uppercase tracking-wider text-muted-foreground/50">
          分组
        </div>
        {tree.map((group) => (
          <div key={group.id}>
            {/* 一级分组 */}
            <button
              type="button"
              className={cn(
                'nav-item w-full flex items-center gap-2 px-2 h-8 rounded-md text-left transition-colors',
                isGroupActive(group.id) ? 'nav-item--active' : 'nav-item--idle'
              )}
              onClick={() => selectGroup(group.id)}
            >
              <Folder className="size-[15px] shrink-0 opacity-80" />
              <span className="flex-1 truncate text-[13px] font-medium">{group.name}</span>
              {group.count > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground/50 tabular-nums">
                  {group.count}
                </span>
              )}
              {group.children.length > 0 && (
                <ChevronDown
                  className={cn(
                    'size-3 shrink-0 transition-transform duration-200',
                    !expanded[group.id] && '-rotate-90'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleGroup(group.id)
                  }}
                />
              )}
            </button>
            {/* 二级子分组 */}
            {expanded[group.id] && group.children.length > 0 && (
              <div className="ml-[15px] pl-2.5 border-l border-border/50 my-0.5 flex flex-col gap-0.5">
                {group.children.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className={cn(
                      'nav-item flex items-center gap-2 px-2 h-7 rounded-md text-left transition-colors',
                      isSubActive(group.id, sub.id) ? 'nav-item--active' : 'nav-item--idle'
                    )}
                    onClick={() => selectSub(group.id, sub.id, sub.anchorId)}
                  >
                    <span className="flex-1 truncate text-[12.5px]">{sub.name}</span>
                    {sub.count > 0 && (
                      <span className="text-[10.5px] font-mono text-muted-foreground/45 tabular-nums">
                        {sub.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 回收站 */}
        <button
          type="button"
          className={cn(
            'nav-item w-full flex items-center gap-2 px-2 h-8 rounded-md text-left transition-colors mt-2',
            !isSettings && isTrashActive && activeView === 'group'
              ? 'nav-item--trash-active'
              : 'nav-item--idle'
          )}
          onClick={() => setActiveGroup(TRASH_GROUP_ID)}
        >
          <Trash2 className="size-[15px] shrink-0 opacity-80" />
          <span className="flex-1 truncate text-[13px]">回收站</span>
        </button>
      </nav>

      {/* 底部栏：设置 + 计数 */}
      <div className="shrink-0 flex items-center gap-1 px-3 h-11 border-t border-border/40">
        <button
          type="button"
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
            isSettings && 'bg-muted/60 text-foreground'
          )}
          title="设置"
          onClick={() => onOpenSettings?.()}
        >
          <Settings className="size-4" />
        </button>
        <button
          type="button"
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="切换明暗"
          onClick={() => onToggleDark?.()}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <div className="flex-1" />
        <span className="text-[11px] font-mono text-muted-foreground/50 tabular-nums">
          {totalCount} 个书签
        </span>
      </div>
    </aside>
  )
}

export default AppSidebar
