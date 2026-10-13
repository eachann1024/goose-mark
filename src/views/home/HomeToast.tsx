import type * as React from 'react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { Ico } from './icon'
import { type ToastTone, type ToastAction } from './homeTypes'
import { type HomeNavigationBindings } from './homeInteractionTypes'

export function HomeToast({
  toastTone,
  toastJump,
  toastAction,
  toastKey,
  openNewBookmarkForm,
  setToastOpen,
  setAggressiveSaveAutoStart,
  setScreen,
  view,
  setActiveSubId,
  scrollToSection,
  toastTitle,
  toastDesc
}: Pick<HomeNavigationBindings, 'setScreen' | 'view' | 'setActiveSubId'> & {
  toastTone: ToastTone
  toastJump: BookmarkLocation | null
  toastAction: ToastAction
  toastKey: number
  openNewBookmarkForm: () => void
  setToastOpen: React.Dispatch<React.SetStateAction<boolean>>
  setAggressiveSaveAutoStart: React.Dispatch<React.SetStateAction<boolean>>
  scrollToSection: (groupId: string, subId: string) => void
  toastTitle: string
  toastDesc: string
}) {
  return (
    <div
          className={`toast is-${toastTone}${toastJump || toastAction ? ' is-action' : ''}`}
          key={`toast-${toastKey}`}
          role={toastJump || toastAction ? 'button' : undefined}
          tabIndex={toastJump || toastAction ? 0 : undefined}
          onClick={() => {
            if (toastAction === 'open-ai-save') {
              if (!useSettingsStore.getState().aiEnabled) {
                openNewBookmarkForm()
                setToastOpen(false)
                return
              }
              setAggressiveSaveAutoStart(false)
              setScreen('ai-aggressive-save')
              setToastOpen(false)
              return
            }
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
            if (!toastJump && !toastAction) return
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
                {toastJump ? ' · 点击跳转' : toastAction === 'open-ai-save' ? ' · 点击查看并重试' : ''}
              </div>
            ) : null}
          </div>
        </div>
  )
}
