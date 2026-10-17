import type * as React from 'react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { Ico } from './icon'
import { type ToastTone } from './homeTypes'
import { type HomeNavigationBindings } from './homeInteractionTypes'

export function HomeToast({
  toastTone,
  toastJump,
  toastKey,
  setToastOpen,
  setScreen,
  view,
  setActiveSubId,
  scrollToSection,
  toastTitle,
  toastDesc
}: Pick<HomeNavigationBindings, 'setScreen' | 'view' | 'setActiveSubId'> & {
  toastTone: ToastTone
  toastJump: BookmarkLocation | null
  toastKey: number
  setToastOpen: React.Dispatch<React.SetStateAction<boolean>>
  scrollToSection: (groupId: string, subId: string) => void
  toastTitle: string
  toastDesc: string
}) {
  return (
    <div
          className={`toast is-${toastTone}${toastJump ? ' is-action' : ''}`}
          key={`toast-${toastKey}`}
          role={toastJump ? 'button' : undefined}
          tabIndex={toastJump ? 0 : undefined}
          onClick={() => {
            if (!toastJump) return
            setScreen(view)
            setActiveSubId(toastJump.subGroupId)
            useBookmarkStore.getState().selectGroup(toastJump.groupId, toastJump.subGroupId)
            requestAnimationFrame(() => {
              if (view === 'list' || view === 'grid') scrollToSection(toastJump.groupId, toastJump.subGroupId)
            })
            setToastOpen(false)
          }}
          onKeyDown={(e) => {
            if (!toastJump) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              ;(e.currentTarget as HTMLDivElement).click()
            }
          }}
        >
          <span className="tic"><Ico name={toastTone === 'error' ? 'alert-circle' : 'check'} /></span>
          <div>
            <div className="tt">{toastTitle || '操作完成'}</div>
            {toastDesc ? (
              <div className="td">
                {toastDesc}
                {toastJump ? ' · 点击跳转' : ''}
              </div>
            ) : null}
          </div>
        </div>
  )
}
