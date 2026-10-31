import type * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { bookmarkToHomeItem, getBookmarkIndex, getHomeGroupIndex, type HomeItem } from './viewModel'
import { type CtxState } from './homeTypes'
import { type HomeBookmarkBindings } from './homeInteractionTypes'

export function useHomeContextActions({
  rootRef,
  homeGroups,
  setCtxItem,
  setCtxLocation,
  ctxMenuRef,
  setCtx,
  ctxItem,
  bookmarks,
  handleRemove,
  ctxLocation
}: Pick<HomeBookmarkBindings, 'homeGroups' | 'bookmarks'> & {
  rootRef: React.RefObject<HTMLDivElement | null>
  setCtxItem: React.Dispatch<React.SetStateAction<HomeItem | null>>
  setCtxLocation: React.Dispatch<React.SetStateAction<{ groupId: string; subGroupId: string; } | null>>
  ctxMenuRef: React.RefObject<HTMLDivElement | null>
  setCtx: React.Dispatch<React.SetStateAction<CtxState>>
  ctxItem: HomeItem | null
  handleRemove: (bookmark: Bookmark, location?: { groupId: string; subGroupId: string; }) => void
  ctxLocation: { groupId: string; subGroupId: string; } | null
}) {
  const ctxOpenRef = useRef(false)

  // ---- 交互：右键菜单（记录被右键的书签项及精确位置） ----
  const openCtx = useCallback((e: React.MouseEvent) => {
    const card = (e.target as HTMLElement).closest('.card,.gcard,.search-row') as HTMLElement | null
    if (!card) return
    e.preventDefault()
    const root = rootRef.current
    if (!root) return
    const itemId = card.dataset.itemId
    if (!itemId) return
    const bookmark = getBookmarkIndex(bookmarks).get(itemId)
    if (!bookmark || bookmark.isDeleted) return
    const found = bookmarkToHomeItem(bookmark)
    const groupId = card.dataset.groupId
    const subGroupId = card.dataset.subId
    // 搜索结果没有位置属性时才使用已建索引；卡片的精确位置优先，避免多分类误删。
    const location = groupId && subGroupId
      ? { groupId, subGroupId }
      : homeGroups.reduce<{ groupId: string; subGroupId: string } | null>(
          (hit, group) => hit ?? getHomeGroupIndex(group).locationByItemId.get(itemId) ?? null, null)
    setCtxItem(found)
    setCtxLocation(location)
    ctxOpenRef.current = true
    setCtx({ open: true, x: e.clientX, y: e.clientY })
  }, [homeGroups, bookmarks])
  const closeCtx = useCallback(() => {
    ctxOpenRef.current = false
    setCtx((c) => (c.open ? { ...c, open: false } : c))
  }, [])

  const requestCtxDelete = useCallback(() => {
    if (!ctxOpenRef.current || !ctxItem) return
    const realBookmark = getBookmarkIndex(bookmarks).get(ctxItem.id)
    closeCtx()
    if (realBookmark) handleRemove(realBookmark, ctxLocation ?? undefined)
  }, [bookmarks, closeCtx, ctxItem, ctxLocation, handleRemove])

  return { openCtx, closeCtx, requestCtxDelete }
}

export function useHomePointerInteractions({
  closeCtx,
  rootRef
}: {
  closeCtx: () => void
  rootRef: React.RefObject<HTMLDivElement | null>
}) {

  // ---- 全局点击：点空白关闭右键菜单 ----
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ctx-menu')) closeCtx()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [closeCtx])

  // ---- 真实鼠标移动时解除键盘导航态，恢复 hover ----
  // 键盘滚动在 macOS 下不会合成 mousemove，所以只有用户真正动鼠标才会触发；
  // 但程序化滚动可能因指针相对页面位移而产生 mousemove，故用坐标变化做二次确认，避免误清。
  useEffect(() => {
    let lastX = -1
    let lastY = -1
    const onMove = (e: MouseEvent) => {
      if (e.clientX === lastX && e.clientY === lastY) return
      lastX = e.clientX
      lastY = e.clientY
      rootRef.current?.classList.remove('kbd-nav')
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
}
