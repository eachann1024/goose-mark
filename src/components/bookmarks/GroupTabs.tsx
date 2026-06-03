import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Search, Settings, MoonStar, Trash2 } from 'lucide-react'
import { BookmarkTooltip } from './_BookmarkTooltip'
import './bookmarks.css'

/**
 * GroupTabs（React 版）
 * --------------------------------------------------------------------------
 * 顶部一级分组标签行 + 右侧操作区（搜索 / 设置 / 深浅模式 / 回收站）。
 * 等价旧版 Vue GroupTabs.vue。i-ph 图标 → lucide-react。
 * 受控 tab + 各类回调。无埋点。
 */
interface GroupTabsSubGroup {
  id: string
  name: string
}
export interface GroupTabsGroup {
  id: string
  name: string
  children: GroupTabsSubGroup[]
}

export interface GroupTabsProps {
  visibleGroups: GroupTabsGroup[]
  activeGroupId: string
  tab: 'bookmarks' | 'settings'
  isUTools: boolean
  isTrashActive: boolean
  searching: boolean
  groupLayout?: 'wrap' | 'scroll'
  onTabChange: (value: 'bookmarks' | 'settings') => void
  onSelectGroup: (id: string) => void
  onSelectTrash: () => void
  onToggleDark: () => void
  onOpenSearch: () => void
  onEditGroup: (id: string) => void
}

const formatName = (name: string) => (name.length > 8 ? `${name.slice(0, 8)}…` : name)

export function GroupTabs({
  visibleGroups,
  activeGroupId,
  tab,
  isTrashActive,
  searching,
  groupLayout,
  onTabChange,
  onSelectGroup,
  onSelectTrash,
  onToggleDark,
  onOpenSearch,
  onEditGroup
}: GroupTabsProps) {
  // 溢出（名称 > 8 字符被截断）→ 才显示 tooltip，等价旧版 overflowMap 逻辑
  const [overflowMap, setOverflowMap] = useState<Record<string, boolean>>({})

  const groupContainerClass =
    groupLayout === 'scroll'
      ? 'flex items-center gap-2 overflow-x-auto no-scrollbar mask-gradient-right whitespace-nowrap'
      : 'flex items-center flex-wrap gap-2'

  const handleGroupMouseEnter = (group: GroupTabsGroup) => {
    setOverflowMap((prev) => ({ ...prev, [group.id]: group.name.length > 8 }))
  }

  return (
    <div className="flex items-center justify-between">
      <div className={groupContainerClass}>
        {visibleGroups.map((group) => (
          <BookmarkTooltip
            key={group.id}
            content={<p>{group.name}</p>}
            disabled={!overflowMap[group.id]}
          >
            <Button
              variant="ghost"
              size="sm"
              className="main-group-tab group-tab-btn rounded-full px-4 h-9 font-normal transition-all border border-transparent"
              data-active={activeGroupId === group.id ? 'true' : undefined}
              onClick={() => onSelectGroup(group.id)}
              onMouseEnter={() => handleGroupMouseEnter(group)}
              onContextMenu={(e) => {
                e.preventDefault()
                onEditGroup(group.id)
              }}
            >
              {formatName(group.name)}
            </Button>
          </BookmarkTooltip>
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <BookmarkTooltip content={<p className="text-xs">直接输入字符即可搜索</p>}>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'group-action-btn h-9 rounded-full px-3 flex items-center gap-1',
              searching && 'group-action-btn--searching'
            )}
            onClick={onOpenSearch}
          >
            <Search className="size-4" />
            <span className="text-xs">搜索</span>
          </Button>
        </BookmarkTooltip>

        <div className="h-6 w-px bg-border mx-2" />

        <BookmarkTooltip content={<p>设置</p>}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'w-8 h-8 text-muted-foreground hover:text-foreground',
              tab === 'settings' && 'bg-muted text-foreground'
            )}
            onClick={() => onTabChange('settings')}
            aria-label="设置"
          >
            <Settings className="size-[18px]" />
          </Button>
        </BookmarkTooltip>

        <div className="h-6 w-px bg-border mx-2" />

        <BookmarkTooltip content={<p>切换深浅模式</p>}>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground hover:text-foreground"
            onClick={onToggleDark}
            aria-label="切换深浅模式"
          >
            <MoonStar className="size-[18px]" />
          </Button>
        </BookmarkTooltip>

        <div className="h-6 w-px bg-border mx-2" />

        <BookmarkTooltip content={<p>回收站</p>}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'w-7 h-7 text-muted-foreground hover:text-destructive transition-colors',
              isTrashActive && 'group-action-btn--danger-active text-destructive'
            )}
            onClick={onSelectTrash}
            aria-label="回收站"
          >
            <Trash2 className="size-[18px]" />
          </Button>
        </BookmarkTooltip>
      </div>
    </div>
  )
}

export default GroupTabs
