import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Check, Filter, LayoutGrid, List, Plus, StretchHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * BookmarkListHeader（列表面板头 / 中栏顶部）
 * --------------------------------------------------------------------------
 * 设计稿：左侧当前视图名（衬线大标题）+「N 项」次要文字；
 * 右侧一排控件：漏斗筛选 + 排序下拉（默认「最近使用」）+ 视图切换（列表/网格/卡片）+「新建」珊瑚按钮。
 * 排序下拉为自包含的轻量 popover（点击外部关闭），与项目内 ContextMenu 等手写菜单风格一致，
 * 不引入额外依赖，避免 HeroUI v3 复合 Dropdown 的集成风险。
 */

export type ListSort = 'recent' | 'created' | 'name' | 'visits'

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: 'recent', label: '最近使用' },
  { value: 'created', label: '添加时间' },
  { value: 'name', label: '名称' },
  { value: 'visits', label: '访问次数' }
]

export interface BookmarkListHeaderProps {
  /** 当前视图标题（如「全部书签」「置顶」「最近使用」「工作 / 常用」「回收站」） */
  title: string
  /** 当前列表项数 */
  count: number
  viewMode: 'list' | 'grid' | 'cards'
  sort: ListSort
  /** 排序是否可用（分组视图按手动顺序展示时禁用） */
  sortEnabled?: boolean
  onSortChange: (sort: ListSort) => void
  onViewModeChange: (mode: 'list' | 'grid' | 'cards') => void
  onCreate: () => void
}

const VIEW_MODES: { mode: 'list' | 'grid' | 'cards'; icon: LucideIcon; label: string }[] = [
  { mode: 'list', icon: List, label: '列表视图' },
  { mode: 'grid', icon: LayoutGrid, label: '网格视图' },
  { mode: 'cards', icon: StretchHorizontal, label: '卡片视图' }
]

export function BookmarkListHeader({
  title,
  count,
  viewMode,
  sort,
  sortEnabled = true,
  onSortChange,
  onViewModeChange,
  onCreate
}: BookmarkListHeaderProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement | null>(null)

  // 点击外部 / Escape 关闭排序菜单
  useEffect(() => {
    if (!sortOpen) return
    const onPointer = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSortOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortOpen])

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? '最近使用'

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-border/30 select-none">
      {/* 左侧：视图名（衬线大标题）+ 项数 */}
      <div className="min-w-0 flex items-baseline gap-2">
        <h1 className="font-serif-title text-[22px] leading-none font-medium text-foreground truncate">
          {title}
        </h1>
        <span className="shrink-0 text-[12px] text-muted-foreground/60 tabular-nums">{count} 项</span>
      </div>

      <div className="flex-1" />

      {/* 漏斗筛选（占位入口，后续接筛选浮层） */}
      <button
        type="button"
        className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
        title="筛选"
      >
        <Filter className="size-[15px]" />
      </button>

      {/* 排序下拉 */}
      <div ref={sortRef} className="relative">
        <button
          type="button"
          disabled={!sortEnabled}
          className={cn(
            'h-8 inline-flex items-center gap-1.5 pl-2.5 pr-2 rounded-lg text-[12.5px] transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            'disabled:opacity-40 disabled:pointer-events-none',
            sortOpen && 'bg-muted/50 text-foreground'
          )}
          title="排序"
          onClick={() => setSortOpen((v) => !v)}
        >
          <ArrowUpDown className="size-[14px]" />
          <span className="tabular-nums">{currentSortLabel}</span>
        </button>
        {sortOpen && (
          <div className="absolute right-0 top-[calc(100%+4px)] z-40 min-w-[140px] rounded-[10px] border border-border bg-popover p-1 shadow-lg">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] text-left transition-colors',
                  opt.value === sort ? 'text-primary' : 'text-foreground hover:bg-muted'
                )}
                onClick={() => {
                  onSortChange(opt.value)
                  setSortOpen(false)
                }}
              >
                <span className="flex-1">{opt.label}</span>
                {opt.value === sort && <Check className="size-[14px]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 视图切换：列表 / 网格 / 卡片 */}
      <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
        {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            type="button"
            className={cn(
              'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
              viewMode === mode
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50'
            )}
            title={label}
            onClick={() => onViewModeChange(mode)}
          >
            <Icon className="size-[15px]" />
          </button>
        ))}
      </div>

      {/* 新建（珊瑚强调按钮） */}
      <button
        type="button"
        className="h-8 inline-flex items-center gap-1.5 pl-2.5 pr-3 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold shadow-sm hover:brightness-105 active:brightness-95 transition-all"
        onClick={onCreate}
        title="新建书签"
      >
        <Plus className="size-[15px]" />
        新建
      </button>
    </div>
  )
}

export default BookmarkListHeader
