import type { Active, Over } from '@dnd-kit/core'
import { type HomeGroup } from './viewModel'

/** 拖拽落点占位：跨子分组拖拽时在目标段插入它，让后续卡片/格子真正让位 */
export interface DropGapInfo {
  subId: string
  /** 目标子分组内的插入下标 */
  index: number
  /** 占位高度（被拖卡片实测高度） */
  height: number
  view: 'list' | 'grid'
}

interface DragData {
  type?: string
  groupId?: string
  subId?: string
  bookmarkId?: string
}

function findSub(groups: HomeGroup[], subId: string) {
  for (const g of groups) {
    const sub = g.subs.find((s) => s.id === subId)
    if (sub) return sub
  }
  return null
}

/**
 * 解析当前拖拽的落点占位。
 * 同一子分组内（含落在同段卡片上）由 dnd-kit 自身让位，这里返回 null；
 * 只有落到「别的子分组」时才返回占位信息，并且位置与 onDragEnd 的插入下标完全一致。
 */
export function resolveDropGap(
  active: Active | null,
  over: Over | null,
  groups: HomeGroup[],
  view: 'list' | 'grid'
): DropGapInfo | null {
  const a = active?.data.current as DragData | undefined
  if (!a || a.type !== 'bookmark' || !a.subId) return null
  const o = over?.data.current as DragData | undefined
  if (!o) return null

  let targetSubId: string | undefined
  let index = 0

  if (o.type === 'bookmark') {
    if (!o.subId || o.subId === a.subId) return null
    const sub = findSub(groups, o.subId)
    const at = sub?.items.findIndex((b) => b.id === o.bookmarkId) ?? -1
    if (at < 0) return null
    targetSubId = o.subId
    index = at
  } else if (o.type === 'sub-area') {
    if (!o.subId || o.subId === a.subId) return null
    targetSubId = o.subId
    index = findSub(groups, o.subId)?.items.length ?? 0
  } else if (o.type === 'sub') {
    const subId = String(over!.id)
    if (subId === a.subId) return null
    targetSubId = subId
    index = findSub(groups, subId)?.items.length ?? 0
  }

  if (!targetSubId) return null
  // 占位高度取落点卡片自身高度（替换时零位移），落到段尾时用被拖卡片高度
  const height = o.type === 'bookmark' ? (over?.rect.height ?? 0) : (active?.rect.current.initial?.height ?? 0)
  return {
    subId: targetSubId,
    index,
    height,
    view
  }
}
