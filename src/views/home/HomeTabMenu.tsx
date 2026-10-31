import type * as React from 'react'
import { useLayoutEffect } from 'react'
import { Ico } from './icon'

export function HomeTabMenu({
  tabCtx,
  tabMenuRef,
  startTabRename,
  deleteTabGroup
}: {
  tabCtx: { open: boolean; x: number; y: number; groupId: string; }
  tabMenuRef: React.RefObject<HTMLDivElement | null>
  startTabRename: (groupId: string) => void
  deleteTabGroup: (groupId: string) => void
}) {
  useLayoutEffect(() => {
    if (!tabCtx.open) return
    const fitMenu = () => {
      const menu = tabMenuRef.current
      if (!menu) return
      menu.style.left = `${Math.max(8, Math.min(tabCtx.x, window.innerWidth - menu.offsetWidth - 8))}px`
      menu.style.top = `${Math.max(8, Math.min(tabCtx.y, window.innerHeight - menu.offsetHeight - 8))}px`
    }
    fitMenu()
    window.addEventListener('resize', fitMenu)
    return () => window.removeEventListener('resize', fitMenu)
  }, [tabCtx.open, tabCtx.x, tabCtx.y, tabMenuRef])

  return (
    tabCtx.open && (
          <div
            ref={tabMenuRef}
            className="ctx-menu tab-ctx-menu"
            style={{ display: 'flex', position: 'fixed', left: tabCtx.x, top: tabCtx.y, zIndex: 200 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation() }}
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
        )
  )
}
