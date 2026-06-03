import { cn } from '@/lib/utils'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import './bookmarks.css'

/**
 * SubGroupNav（React 版）
 * --------------------------------------------------------------------------
 * 当前一级分组下的二级分组竖向导航（左侧窄栏）。仅在子分组数 > 1 且非回收站时显示。
 * 等价旧版 Vue SubGroupNav.vue。直接订阅 bookmark store（与旧版一致）。
 * 旧版 store.selectSubGroup → React store.setActiveSubGroup。无埋点。
 */
export function SubGroupNav() {
  const groups = useBookmarkStore((s) => s.groups)
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const activeSubGroupId = useBookmarkStore((s) => s.activeSubGroupId)
  const setActiveSubGroup = useBookmarkStore((s) => s.setActiveSubGroup)

  const activeGroup = groups.find((g) => g.id === activeGroupId)
  const subGroups = activeGroup?.children ?? []
  const shouldShow = subGroups.length > 1 && activeGroupId !== TRASH_GROUP_ID

  if (!shouldShow) return null

  return (
    <aside className="bm-no-scrollbar shrink-0 w-32 flex flex-col overflow-y-auto py-2 px-2 gap-0.5">
      {subGroups.map((sub) => {
        const isActive = activeSubGroupId === sub.id
        const count = sub.bookmarkIds?.length ?? 0
        return (
          <button
            key={sub.id}
            type="button"
            className={cn(
              'subgroup-nav-item relative flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors duration-120',
              isActive ? 'subgroup-nav-item--active' : 'subgroup-nav-item--idle'
            )}
            onClick={() => setActiveSubGroup(sub.id)}
          >
            <span className="truncate flex-1">{sub.name}</span>
            {count > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground/40 tabular-nums">{count}</span>
            )}
          </button>
        )
      })}
    </aside>
  )
}

export default SubGroupNav
