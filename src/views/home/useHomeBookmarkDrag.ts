import type * as React from 'react'
import { useCallback } from 'react'
import { type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useBookmarkStore } from '@/stores/bookmark'
import { type HomeItem } from './viewModel'
import { type HomeBookmarkBindings } from './homeInteractionTypes'
import type { SubGroup } from '@/types/bookmark'

export function useHomeBookmarkDrag({
  setActiveDragItem,
  homeGroups,
  reorderSubGroups,
  reorderInSub,
  moveBookmarkToSubGroup,
  fireToast
}: Pick<HomeBookmarkBindings, 'homeGroups' | 'fireToast'> & {
  setActiveDragItem: React.Dispatch<React.SetStateAction<HomeItem | null>>
  reorderSubGroups: (groupId: string, newChildren: SubGroup[]) => void
  reorderInSub: (groupId: string, subId: string, fromId: string, toId: string) => void
  moveBookmarkToSubGroup: (bookmarkId: string, fromGroupId: string, fromSubId: string, toGroupId: string, toSubId: string) => boolean
}) {

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

  return { handleDndDragStart, handleDndDragEnd }
}
