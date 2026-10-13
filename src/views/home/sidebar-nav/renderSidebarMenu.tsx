import type * as React from 'react'
import type { HomeGroup } from '../viewModel'
import { Ico } from '../icon'
import type { NavMenuState } from './types'

interface SidebarMenuProps {
  menu: NavMenuState
  homeGroups: HomeGroup[]
  menuRef: React.RefObject<HTMLDivElement | null>
  menuTargetName: () => string
  startRenameGroup: (groupId: string) => void
  startNewSub: (groupId: string) => void
  startRenameSub: (groupId: string, subId: string) => void
  moveGroupUp: (groupId: string) => void
  moveGroupDown: (groupId: string) => void
  moveSubUp: (groupId: string, subId: string) => void
  moveSubDown: (groupId: string, subId: string) => void
  switchToMoveMode: () => void
  doPromote: (groupId: string, subId: string) => void
  doMoveSubToGroup: (groupId: string, subId: string, targetGroupId: string) => void
  confirmDelete: () => void
  doDelete: () => void
  closeMenu: () => void
  backToMenu: () => void
}

export function renderSidebarMenu({
  menu,
  homeGroups,
  menuRef,
  menuTargetName,
  startRenameGroup,
  startNewSub,
  startRenameSub,
  moveGroupUp,
  moveGroupDown,
  moveSubUp,
  moveSubDown,
  switchToMoveMode,
  doPromote,
  doMoveSubToGroup,
  confirmDelete,
  doDelete,
  closeMenu,
  backToMenu,
}: SidebarMenuProps) {
    if (!menu.open || !menu.target) return null
    const target = menu.target

    if (menu.mode === 'confirmDelete') {
      const name = menuTargetName()
      return (
        <div
          ref={menuRef}
          className="ctx-menu sidebar-ctx-menu"
          style={{ display: 'flex', position: 'fixed', left: menu.x, top: menu.y, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sidebar-ctx-confirm-msg">
            <span>删除「{name}」？</span>
            <span className="sidebar-ctx-confirm-sub">书签将移入回收站</span>
          </div>
          <div className="ctx-sep" />
          <button className="danger" onClick={doDelete}>
            <Ico name="trash-2" />
            确认删除
          </button>
          <button onClick={closeMenu}>
            <Ico name="x" />
            取消
          </button>
        </div>
      )
    }

    if (menu.mode === 'move' && target.type === 'sub') {
      const t = target as { type: 'sub'; groupId: string; subId: string }
      const otherGroups = homeGroups.filter((g) => g.id !== t.groupId)
      return (
        <div
          ref={menuRef}
          className="ctx-menu sidebar-ctx-menu"
          style={{ display: 'flex', position: 'fixed', left: menu.x, top: menu.y, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sidebar-ctx-move-title">移动到…</div>
          {otherGroups.map((g) => (
            <button key={g.id} onClick={() => doMoveSubToGroup(t.groupId, t.subId, g.id)}>
              <Ico name="folder" />
              {g.name}
            </button>
          ))}
          <div className="ctx-sep" />
          <button onClick={backToMenu}>
            <Ico name="arrow-left" />
            返回
          </button>
        </div>
      )
    }

    // mode === 'menu'
    if (target.type === 'group') {
      const gId = target.groupId
      const gIdx = homeGroups.findIndex((g) => g.id === gId)
      const isFirst = gIdx === 0
      const isLast = gIdx === homeGroups.length - 1
      return (
        <div
          ref={menuRef}
          className="ctx-menu sidebar-ctx-menu"
          style={{ display: 'flex', position: 'fixed', left: menu.x, top: menu.y, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => startRenameGroup(gId)}>
            <Ico name="pencil" />
            重命名
          </button>
          <button onClick={() => startNewSub(gId)}>
            <Ico name="plus" />
            新建子分组
          </button>
          {!isFirst && (
            <button onClick={() => moveGroupUp(gId)}>
              <Ico name="chevron-up" />
              上移
            </button>
          )}
          {!isLast && (
            <button onClick={() => moveGroupDown(gId)}>
              <Ico name="chevron-down" />
              下移
            </button>
          )}
          <div className="ctx-sep" />
          <button className="danger" onClick={confirmDelete}>
            <Ico name="trash-2" />
            删除分组
          </button>
        </div>
      )
    }

    // target.type === 'sub'
    const t = target as { type: 'sub'; groupId: string; subId: string }
    const grp = homeGroups.find((g) => g.id === t.groupId)
    const subs = grp?.subs ?? []
    const sIdx = subs.findIndex((s) => s.id === t.subId)
    const isFirst = sIdx === 0
    const isLast = sIdx === subs.length - 1
    const canMove = homeGroups.length > 1

    return (
      <div
        ref={menuRef}
        className="ctx-menu sidebar-ctx-menu"
        style={{ display: 'flex', position: 'fixed', left: menu.x, top: menu.y, zIndex: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => startRenameSub(t.groupId, t.subId)}>
          <Ico name="pencil" />
          重命名
        </button>
        {!isFirst && (
          <button onClick={() => moveSubUp(t.groupId, t.subId)}>
            <Ico name="chevron-up" />
            上移
          </button>
        )}
        {!isLast && (
          <button onClick={() => moveSubDown(t.groupId, t.subId)}>
            <Ico name="chevron-down" />
            下移
          </button>
        )}
        {canMove && (
          <button onClick={switchToMoveMode}>
            <Ico name="arrow-right" />
            移动到其他分组
          </button>
        )}
        <button onClick={() => doPromote(t.groupId, t.subId)}>
          <Ico name="arrow-up-to-line" />
          提升为一级分组
        </button>
        <div className="ctx-sep" />
        <button className="danger" onClick={confirmDelete}>
          <Ico name="trash-2" />
          删除
        </button>
      </div>
    )
}
