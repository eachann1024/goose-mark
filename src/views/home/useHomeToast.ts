import type * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useUIManager } from '@/hooks/useUIManager'
import { type ToastTone, type ToastAction } from './homeTypes'
import { type HomeToastHandler } from './homeInteractionTypes'

export function useHomeToast({
  closeCtx,
  setToastTitle,
  setToastDesc,
  setToastJump,
  setToastTone,
  setToastAction,
  setToastKey,
  setToastOpen,
  toastTimer
}: {
  closeCtx: () => void
  setToastTitle: React.Dispatch<React.SetStateAction<string>>
  setToastDesc: React.Dispatch<React.SetStateAction<string>>
  setToastJump: React.Dispatch<React.SetStateAction<BookmarkLocation | null>>
  setToastTone: React.Dispatch<React.SetStateAction<ToastTone>>
  setToastAction: React.Dispatch<React.SetStateAction<ToastAction>>
  setToastKey: React.Dispatch<React.SetStateAction<number>>
  setToastOpen: React.Dispatch<React.SetStateAction<boolean>>
  toastTimer: React.RefObject<number | undefined>
}) {

  // fireToast 的稳定引用，供 plugin-enter effect 使用（声明在 fireToast 之前）
  const fireToastRef = useRef<
    (title?: string, options?: {
      description?: string
      jump?: BookmarkLocation | null
      duration?: number
      tone?: ToastTone
      action?: ToastAction
    }) => void
  >(() => {})

  // ---- 交互：复制 → Toast ----
  // 用自增 toastKey 作为 Toast 元素 key：每次复制都强制重新挂载，CSS 飞入动画必从头重放
  // （比依赖 DOM reflow 更可靠，且符合 React 范式；连续复制也能看到动画重播）。
  // options.jump：成功消息可点击，跳到对应分组/位置（AI 保存用）
  const fireToast = useCallback(
    (
      title?: string,
      options?: {
        description?: string
        jump?: BookmarkLocation | null
        duration?: number
        tone?: ToastTone
        action?: ToastAction
      }
    ) => {
      closeCtx()
      setToastTitle(title || '')
      setToastDesc(options?.description || '')
      setToastJump(options?.jump ?? null)
      setToastTone(options?.tone ?? 'success')
      setToastAction(options?.action ?? null)
      setToastKey((k) => k + 1)
      setToastOpen(true)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToastOpen(false), options?.duration ?? 4200)
    },
    [closeCtx]
  )
  // 保持 fireToastRef 与最新 fireToast 同步（供 plugin-enter effect 引用）
  fireToastRef.current = fireToast

  return { fireToastRef, fireToast }
}

export function useHomeUIToastBridge({
  fireToastRef
}: {
  fireToastRef: React.RefObject<HomeToastHandler>
}) {

  // ---- useUIManager toast 桥：hooks 内部（useBookmarkOperations/useBookmarkForm 等）调用的
  // showToast 在新 UI 没有 ResultToast 宿主，这里转发到 HomePage 自己的 toast，避免反馈静默丢失 ----
  const uiToastState = useUIManager((s) => s.toastState)
  useEffect(() => {
    if (uiToastState.visible && uiToastState.title) {
      fireToastRef.current(
        uiToastState.description ? `${uiToastState.title}：${uiToastState.description}` : uiToastState.title
      )
      // 立即收掉 store 态，避免下次同标题 toast 不触发
      useUIManager.getState().closeToast()
    }
  }, [uiToastState])
}
