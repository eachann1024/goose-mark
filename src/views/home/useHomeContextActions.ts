import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { type HomeItem } from './viewModel'
import { type CtxMode, type CtxState } from './homeTypes'
import { type HomeBookmarkBindings } from './homeInteractionTypes'

export function useHomeContextActions({
  rootRef,
  homeGroups,
  setCtxItem,
  setCtxLocation,
  ctxMenuRef,
  setCtxMode,
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
  setCtxMode: React.Dispatch<React.SetStateAction<CtxMode>>
  setCtx: React.Dispatch<React.SetStateAction<CtxState>>
  ctxItem: HomeItem | null
  handleRemove: (bookmark: Bookmark, location?: { groupId: string; subGroupId: string; }) => void
  ctxLocation: { groupId: string; subGroupId: string; } | null
}) {

  // ---- 交互：右键菜单（记录被右键的书签项及精确位置） ----
  const openCtx = useCallback((e: React.MouseEvent) => {
    const card = (e.target as HTMLElement).closest('.card,.gcard,.search-row') as HTMLElement | null
    if (!card) return
    e.preventDefault()
    const root = rootRef.current
    if (!root) return
    // 从被右键的卡片中找 item id，反查 homeGroups 得到 HomeItem
    const itemId = card.dataset.itemId
    if (itemId) {
      let found: HomeItem | null = null
      let foundGroupId: string | null = card.dataset.groupId ?? null
      let foundSubId: string | null = card.dataset.subId ?? null
      outer: for (const g of homeGroups) {
        for (const s of g.subs) {
          const hit = s.items.find((b) => b.id === itemId)
          if (hit) {
            found = hit
            // 若 DOM 属性存在则优先使用，否则用遍历到的第一个位置
            if (!foundGroupId) foundGroupId = g.id
            if (!foundSubId) foundSubId = s.id
            break outer
          }
        }
      }
      setCtxItem(found)
      setCtxLocation(
        foundGroupId && foundSubId
          ? { groupId: foundGroupId, subGroupId: foundSubId }
          : null
      )
    }
    const r = root.getBoundingClientRect()
    const menuW = ctxMenuRef.current?.offsetWidth || 200
    let left = e.clientX - r.left
    let top = e.clientY - r.top
    left = Math.min(left, r.width - menuW - 12)
    top = Math.min(top, r.height - 250)
    setCtxMode('menu')
    setCtx({ open: true, x: Math.max(8, left), y: Math.max(8, top) })
  }, [homeGroups])
  const closeCtx = useCallback(() => {
    setCtx((c) => (c.open ? { ...c, open: false } : c))
    setCtxMode('menu')
  }, [])

  const requestCtxDelete = useCallback(() => {
    if (ctxItem) setCtxMode('confirmDelete')
  }, [ctxItem])

  const confirmCtxDelete = useCallback(() => {
    if (!ctxItem) return
    const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
    closeCtx()
    if (realBookmark) handleRemove(realBookmark, ctxLocation ?? undefined)
  }, [bookmarks, closeCtx, ctxItem, ctxLocation, handleRemove])

  return { openCtx, closeCtx, requestCtxDelete, confirmCtxDelete }
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
