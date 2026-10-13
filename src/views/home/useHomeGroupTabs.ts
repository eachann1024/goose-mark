import type * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PointerSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Group } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { type HomeGroup } from './viewModel'
import { type HomeNavigationBindings, type HomeSearchBindings } from './homeInteractionTypes'

export function useHomeGroupTabs({
  homeGroups,
  reorderGroups,
  addGroup,
  screen,
  setScreen,
  view,
  isSearching,
  clearSearch,
  updateGroup,
  removeGroup
}: Pick<HomeNavigationBindings, 'screen' | 'setScreen' | 'view'> &
  Pick<HomeSearchBindings, 'isSearching' | 'clearSearch'> & {
  homeGroups: HomeGroup[]
  reorderGroups: (newOrder: Group[]) => void
  addGroup: (name: string) => Group
  updateGroup: (id: string, name: string) => void
  removeGroup: (id: string) => boolean
}) {

  // ---- 顶栏 Tab 拖拽排序（distance:5 保证点击/右键不被误判为拖拽）----
  const tabSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // 书签 / 侧栏子分组统一拖拽 sensors：MouseSensor + TouchSensor（dnd-kit 推荐的更兼容组合，
  // 鼠标/触摸都稳；distance:8 比点击略大，避免「点开书签」被误判为拖拽；触摸长按 180ms 起拖、避免与滚动冲突）
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  )

  const handleTabDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = homeGroups.findIndex((g) => g.id === active.id)
    const newIndex = homeGroups.findIndex((g) => g.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    // 用 arrayMove 算出视图模型新顺序，再映射回 raw groups（剔除回收站/已删除）
    const newHomeGroups = arrayMove(homeGroups, oldIndex, newIndex)
    const rawGroups = useBookmarkStore.getState().groups.filter((g) => g.id !== TRASH_GROUP_ID && !g.isDeleted)
    const newRaw = newHomeGroups.map((hg) => rawGroups.find((rg) => rg.id === hg.id)!).filter(Boolean)
    reorderGroups(newRaw)
  }, [homeGroups, reorderGroups])

  // ---- 一级 Tab 右键菜单：重命名 / 删除 ----
  const [tabCtx, setTabCtx] = useState<{ open: boolean; x: number; y: number; groupId: string }>({ open: false, x: 0, y: 0, groupId: '' })
  const [tabRenaming, setTabRenaming] = useState<string | null>(null)
  const [tabRenameVal, setTabRenameVal] = useState('')
  const tabMenuRef = useRef<HTMLDivElement>(null)
  const tabRenameRef = useRef<HTMLInputElement>(null)

  // ---- 新建主分组：顶栏 Tab 末尾 + → 就地内联输入 ----
  const [tabAdding, setTabAdding] = useState(false)
  const [tabAddVal, setTabAddVal] = useState('')
  const tabAddRef = useRef<HTMLInputElement>(null)

  const startTabAdd = useCallback(() => {
    setTabAdding(true)
    setTabAddVal('')
    requestAnimationFrame(() => tabAddRef.current?.focus())
  }, [])

  const commitTabAdd = useCallback(() => {
    if (!tabAdding) return
    const name = tabAddVal.trim()
    if (name) {
      const g = addGroup(name) // addGroup 内部已切到新分组并选中首个子分组
      if (screen === 'trash' || screen === 'settings') setScreen(view)
      if (isSearching) clearSearch()
      void g
    }
    setTabAdding(false)
  }, [tabAdding, tabAddVal, addGroup, screen, view, isSearching, clearSearch])

  const openTabCtx = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const menuW = 180
    const left = Math.min(e.clientX, window.innerWidth - menuW - 8)
    setTabCtx({ open: true, x: Math.max(8, left), y: e.clientY + 4, groupId })
  }, [])
  const closeTabCtx = useCallback(() => setTabCtx((c) => (c.open ? { ...c, open: false } : c)), [])

  const startTabRename = useCallback((groupId: string) => {
    const g = homeGroups.find((x) => x.id === groupId)
    if (!g) return
    setTabRenaming(groupId)
    setTabRenameVal(g.name)
    closeTabCtx()
    requestAnimationFrame(() => { tabRenameRef.current?.focus(); tabRenameRef.current?.select() })
  }, [homeGroups, closeTabCtx])

  const commitTabRename = useCallback(() => {
    if (!tabRenaming) return
    const name = tabRenameVal.trim()
    if (name) updateGroup(tabRenaming, name)
    setTabRenaming(null)
  }, [tabRenaming, tabRenameVal, updateGroup])

  const deleteTabGroup = useCallback((groupId: string) => {
    const g = homeGroups.find((x) => x.id === groupId)
    if (!g) return
    if (!window.confirm(`确定删除分组「${g.name}」？组内书签将移入回收站。`)) return
    removeGroup(groupId)
    closeTabCtx()
  }, [homeGroups, removeGroup, closeTabCtx])

  // 点击空白 / Esc 关闭 Tab 右键菜单
  useEffect(() => {
    if (!tabCtx.open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.tab-ctx-menu')) closeTabCtx()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTabCtx() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [tabCtx.open, closeTabCtx])

  return { tabSensors, dndSensors, handleTabDragEnd, tabCtx, tabRenaming, setTabRenaming, tabRenameVal, setTabRenameVal, tabMenuRef, tabRenameRef, tabAdding, setTabAdding, tabAddVal, setTabAddVal, tabAddRef, startTabAdd, commitTabAdd, openTabCtx, startTabRename, commitTabRename, deleteTabGroup }
}
