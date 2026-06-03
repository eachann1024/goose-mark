import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import './bookmarks.css'

/**
 * SubGroupSidebar（React 版）
 * --------------------------------------------------------------------------
 * 大纲式分组/子分组导航侧栏（含书签计数 + 回收站入口）。可外部传入 groups，
 * 否则从 store 派生。等价旧版 Vue SubGroupSidebar.vue。
 * 旧版 store.selectGroup → React store.setActiveGroup。无埋点。
 */
export interface OutlineSubGroup {
  subGroupId: string
  subGroupName: string
  bookmarkCount: number
  anchorId: string
}
export interface OutlineGroup {
  groupId: string
  groupName: string
  bookmarkCount: number
  children: OutlineSubGroup[]
}

export interface SubGroupSidebarProps {
  groups?: OutlineGroup[]
  activeAnchorId?: string
  onScrollTo: (anchorId: string) => void
  onEditGroup?: (groupId: string) => void
  onFocusSearch?: () => void
}

export function SubGroupSidebar({
  groups,
  activeAnchorId,
  onScrollTo,
  onFocusSearch
}: SubGroupSidebarProps) {
  const storeGroups = useBookmarkStore((s) => s.groups)
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const setActiveGroup = useBookmarkStore((s) => s.setActiveGroup)

  // 未传 groups 时从 store 计算（含子分组），等价旧版 computed
  const outlineGroups = useMemo<OutlineGroup[]>(() => {
    if (groups?.length) return groups

    return storeGroups
      .filter((g) => g.id !== TRASH_GROUP_ID)
      .map((group) => {
        const children = group.children
          .filter((sub) => (sub.bookmarkIds?.length || 0) > 0)
          .map((sub) => ({
            subGroupId: sub.id,
            subGroupName: sub.name,
            bookmarkCount: sub.bookmarkIds?.length || 0,
            anchorId: `section-${group.id}-${sub.id}`
          }))
        const bookmarkCount = children.reduce((sum, sub) => sum + sub.bookmarkCount, 0)
        return { groupId: group.id, groupName: group.name, bookmarkCount, children }
      })
      .filter((g) => g.bookmarkCount > 0)
  }, [groups, storeGroups])

  const isSubGroupActive = (anchorId: string) => {
    if (!activeAnchorId) return false
    return activeAnchorId === anchorId || anchorId.startsWith(`${activeAnchorId}-`)
  }

  const handleSubGroupClick = (anchorId: string) => {
    onScrollTo(anchorId)
    onFocusSearch?.()
  }

  return (
    <aside className="bm-no-scrollbar shrink-0 w-36 flex flex-col overflow-y-auto py-2 px-2 gap-1">
      <div className="flex flex-col gap-2">
        {outlineGroups.map((group) => (
          <div key={group.groupId} className="flex flex-col gap-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
              {group.groupName}
            </div>
            {group.children.map((sub) => (
              <button
                key={sub.subGroupId}
                type="button"
                className={cn(
                  'group-nav-item relative flex items-center gap-2 pl-5 pr-2 py-1 rounded-md text-left text-xs transition-colors duration-120',
                  isSubGroupActive(sub.anchorId) ? 'group-nav-item--active' : 'group-nav-item--idle'
                )}
                onClick={() => handleSubGroupClick(sub.anchorId)}
              >
                <span className="truncate flex-1">{sub.subGroupName}</span>
                {sub.bookmarkCount > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/40 tabular-nums">
                    {sub.bookmarkCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <button
        type="button"
        className={cn(
          'mt-auto flex items-center gap-2 px-2 py-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors',
          activeGroupId === TRASH_GROUP_ID && 'text-destructive bg-destructive/5'
        )}
        onClick={() => setActiveGroup(TRASH_GROUP_ID)}
      >
        <Trash2 className="size-3.5" />
        <span>回收站</span>
      </button>
    </aside>
  )
}

export default SubGroupSidebar
