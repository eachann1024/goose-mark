import type * as React from 'react'
import { useLayoutEffect } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { Ico } from './icon'
import { bookmarkToHomeItem, getBookmarkIndex, type HomeItem } from './viewModel'
import { type Screen, type CtxState } from './homeTypes'
import { type HomeBookmarkBindings } from './homeInteractionTypes'

export function HomeContextMenu({
  ctxMenuRef,
  ctx,
  ctxItem,
  closeCtx,
  bookmarks,
  openBookmarkLink,
  useUtoolsBrowser,
  openUrlInDefaultBrowser,
  openUrlInUtoolsBrowser,
  copyBookmarkUrl,
  setFormEditItem,
  setScreen,
  requestCtxDelete
}: Pick<HomeBookmarkBindings, 'bookmarks' | 'openBookmarkLink' | 'setFormEditItem'> & {
  ctxMenuRef: React.RefObject<HTMLDivElement | null>
  ctx: CtxState
  ctxItem: HomeItem | null
  closeCtx: () => void
  useUtoolsBrowser: boolean
  openUrlInDefaultBrowser: (url: string) => void
  openUrlInUtoolsBrowser: (url: string) => void
  copyBookmarkUrl: (bookmark: Bookmark) => Promise<boolean>
  setScreen: React.Dispatch<React.SetStateAction<Screen>>
  requestCtxDelete: () => void
}) {
  const bookmark = ctxItem ? getBookmarkIndex(bookmarks).get(ctxItem.id) : undefined
  const currentItem = bookmark && !bookmark.isDeleted ? bookmarkToHomeItem(bookmark) : null
  useLayoutEffect(() => {
    if (!ctx.open) return
    const fit = () => {
      const menu = ctxMenuRef.current
      if (!menu) return
      menu.style.left = `${Math.max(8, Math.min(ctx.x, window.innerWidth - menu.offsetWidth - 8))}px`
      menu.style.top = `${Math.max(8, Math.min(ctx.y, window.innerHeight - menu.offsetHeight - 8))}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ctx.open, ctx.x, ctx.y, ctxMenuRef])
  return (
    <div ref={ctxMenuRef} className={`ctx-menu${ctx.open ? ' show' : ''}`} style={{ position: 'fixed', left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => {
                closeCtx()
                if (ctxItem) {
                  const realBookmark = getBookmarkIndex(bookmarks).get(ctxItem.id)
                  if (realBookmark && !realBookmark.isDeleted) openBookmarkLink(realBookmark)
                }
              }}><Ico name="external-link" />打开</button>
              <button onClick={() => {
                closeCtx()
                // 反转：默认走内置浏览器时，右键提供「用系统默认浏览器打开」，反之亦然
                if (currentItem) (useUtoolsBrowser ? openUrlInDefaultBrowser : openUrlInUtoolsBrowser)(currentItem.url)
              }}><Ico name="globe" />{useUtoolsBrowser ? '用默认浏览器打开' : '在内置浏览器打开'}</button>
              <button onClick={() => {
                closeCtx()
                if (ctxItem) {
                  const realBookmark = getBookmarkIndex(bookmarks).get(ctxItem.id)
                  // useUIManager 的 toast 在新 UI 未挂载，复制成功后用 HomePage 自己的 fireToast 反馈
                  if (realBookmark) void copyBookmarkUrl(realBookmark) // 成功/失败反馈由 useUIManager toast 桥统一转发
                }
              }}><Ico name="copy" />复制链接</button>
              <button onClick={() => { closeCtx(); if (currentItem) { setFormEditItem(currentItem); setScreen('add') } }}><Ico name="pencil" />编辑</button>
              <div className="ctx-sep" />
              <button className="danger" onClick={requestCtxDelete}><Ico name="trash-2" />删除</button>
        </div>
  )
}
