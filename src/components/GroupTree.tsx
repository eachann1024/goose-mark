import { ChevronRight, Circle } from 'lucide-react'
import { useBookmarkStore } from '@/stores/bookmark'
import { cn } from '@/lib/utils'

/**
 * GroupTree（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 简单分组导航（一级 + 二级按钮），store.selectGroup(g,s) 选择。
 * React store 无 selectGroup，等价拆为 setActiveGroup + setActiveSubGroup。
 * i-ph-* 图标改 lucide-react。当前组件本身无拖拽（拖拽排序在 bookmarks/
 * 子分组组件用 @dnd-kit 实现，与此只读导航无关）。
 */
export function GroupTree() {
  const groups = useBookmarkStore((s) => s.groups)
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const activeSubGroupId = useBookmarkStore((s) => s.activeSubGroupId)
  const setActiveGroup = useBookmarkStore((s) => s.setActiveGroup)
  const setActiveSubGroup = useBookmarkStore((s) => s.setActiveSubGroup)

  const handleGroupClick = (groupId: string) => {
    setActiveGroup(groupId)
  }

  const handleSubClick = (groupId: string, subId: string) => {
    setActiveGroup(groupId)
    setActiveSubGroup(subId)
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          <button
            type="button"
            className={cn(
              'flex items-center justify-between w-full px-3 py-2 rounded-2xl text-left hover:bg-secondary/70 transition-colors',
              group.id === activeGroupId ? 'bg-secondary font-semibold' : 'bg-transparent'
            )}
            onClick={() => handleGroupClick(group.id)}
          >
            <span className="truncate">{group.name}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
          <div className="pl-4 flex flex-col gap-1">
            {group.children.map((sub) => (
              <button
                key={sub.id}
                type="button"
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm justify-start hover:bg-secondary/60 transition-colors',
                  sub.id === activeSubGroupId
                    ? 'bg-secondary text-accent-foreground'
                    : 'bg-transparent'
                )}
                onClick={() => handleSubClick(group.id, sub.id)}
              >
                <Circle className="size-3" />
                <span className="truncate">{sub.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default GroupTree
