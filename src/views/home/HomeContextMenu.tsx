import type * as React from 'react'
import type { Bookmark } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { Ico } from './icon'
import { type HomeItem } from './viewModel'
import { type Screen, type CtxMode, type CtxState } from './homeTypes'
import { type HomeBookmarkBindings } from './homeInteractionTypes'

export function HomeContextMenu({
  ctxMenuRef,
  ctx,
  ctxMode,
  ctxItem,
  confirmCtxDelete,
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
  ctxMode: CtxMode
  ctxItem: HomeItem | null
  confirmCtxDelete: () => void
  closeCtx: () => void
  useUtoolsBrowser: boolean
  openUrlInDefaultBrowser: (url: string) => void
  openUrlInUtoolsBrowser: (url: string) => void
  copyBookmarkUrl: (bookmark: Bookmark) => Promise<boolean>
  setScreen: React.Dispatch<React.SetStateAction<Screen>>
  requestCtxDelete: () => void
}) {
  return (
    <div ref={ctxMenuRef} className={`ctx-menu${ctx.open ? ' show' : ''}`} style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
          {ctxMode === 'confirmDelete' ? (
            <>
              <div className="ctx-confirm-msg">
                <span>删除「{ctxItem?.ttl || '该书签'}」？</span>
                <span className="ctx-confirm-sub">书签将移入回收站</span>
              </div>
              <div className="ctx-sep" />
              <button className="danger" onClick={confirmCtxDelete}><Ico name="trash-2" />确认删除</button>
              <button onClick={closeCtx}><Ico name="x" />取消</button>
            </>
          ) : (
            <>
              <button onClick={() => {
                closeCtx()
                if (ctxItem) {
                  const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
                  if (realBookmark) openBookmarkLink(realBookmark)
                }
              }}><Ico name="external-link" />打开</button>
              <button onClick={() => {
                closeCtx()
                // 反转：默认走内置浏览器时，右键提供「用系统默认浏览器打开」，反之亦然
                if (ctxItem) (useUtoolsBrowser ? openUrlInDefaultBrowser : openUrlInUtoolsBrowser)(ctxItem.url)
              }}><Ico name="globe" />{useUtoolsBrowser ? '用默认浏览器打开' : '在内置浏览器打开'}</button>
              <button onClick={() => {
                closeCtx()
                if (ctxItem) {
                  const realBookmark = bookmarks.find((b) => b.id === ctxItem.id)
                  // useUIManager 的 toast 在新 UI 未挂载，复制成功后用 HomePage 自己的 fireToast 反馈
                  if (realBookmark) void copyBookmarkUrl(realBookmark) // 成功/失败反馈由 useUIManager toast 桥统一转发
                }
              }}><Ico name="copy" />复制链接</button>
              <button onClick={() => {
                closeCtx()
                if (!ctxItem) return
                const real = bookmarks.find((b) => b.id === ctxItem.id)
                if (real) useBookmarkStore.getState().updateBookmark(real.id, { pinned: !real.pinned })
              }}><Ico name="pin" />{ctxItem?.pin ? '取消置顶' : '置顶'}</button>
              <button onClick={() => { closeCtx(); setFormEditItem(ctxItem); setScreen('add') }}><Ico name="pencil" />编辑</button>
              <div className="ctx-sep" />
              <button className="danger" onClick={requestCtxDelete}><Ico name="trash-2" />移到回收站</button>
            </>
          )}
        </div>
  )
}
