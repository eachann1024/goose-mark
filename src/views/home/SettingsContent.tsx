import type * as React from 'react'
import { Ico } from './icon'
import { useFeedbackUnread } from '@/lib/feedback'
import { type ViewMode, type Theme, type ThemePref } from './homeTypes'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsDisplay } from './SettingsDisplay'
import { SettingsAI } from './SettingsAI'
import { SettingsData } from './SettingsData'
import { useBookmarkStore } from '@/stores/bookmark'
import { type HomeToastHandler, type HomeNavigationBindings } from './homeInteractionTypes'

export const SET_NAV: Array<[string, string, string]> = [
  ['通用设置', 'settings', 'set-general'],
  ['AI 助手', 'sparkles', 'set-ai'],
  ['列表设置', 'list', 'set-list'],
  ['网格设置', 'layout-grid', 'set-grid'],
  ['导入与备份', 'database', 'set-data'],
  ['分组管理', 'folder', 'set-categories'],
]

const EDITABLE_SECTIONS = new Set(['set-general', 'set-list', 'set-grid', 'set-ai'])

export function HomeSettingsPage({
  setNavIdx,
  setSetNavIdx,
  fireToast,
  setMainRef,
  theme,
  themePref,
  view,
  applyThemePref,
  setScreen,
  onOpenFeedback
}: Pick<HomeNavigationBindings, 'view' | 'setScreen'> & {
  setNavIdx: number
  setSetNavIdx: (idx: number) => void
  fireToast: HomeToastHandler
  setMainRef: React.RefObject<HTMLDivElement | null>
  theme: Theme
  themePref: ThemePref
  applyThemePref: (pref: ThemePref) => void
  onOpenFeedback: () => void
}) {
  const unreadFeedback = useFeedbackUnread()
  const sectionId = SET_NAV[setNavIdx]?.[2] ?? SET_NAV[0][2]
  return (
    <div className="settings">
          <nav className="set-nav">
            {SET_NAV.map(([label, ic], i) => (
              <button
                key={label}
                className={i === setNavIdx ? 'on' : ''}
                onClick={() => {
                  setSetNavIdx(i)
                  const main = setMainRef.current
                  if (main) main.scrollTop = 0
                }}
              >
                <Ico name={ic} />
                {label}
              </button>
            ))}
            <button
              type="button"
              className="feedback relative"
              data-feedback-entry
              aria-label={unreadFeedback ? '反馈（有新回复）' : '快速反馈'}
              onClick={onOpenFeedback}
            >
              <Ico name="message-square" />
              快速反馈
              {unreadFeedback ? (
                <span className="feedback-unread-dot" aria-hidden />
              ) : null}
            </button>
          </nav>
          <div className="set-main" ref={setMainRef}>
            <div className="set-wrap">
              <SettingsContent
                sectionId={sectionId}
                theme={theme}
                themePref={themePref}
                view={view}
                onThemeChange={applyThemePref}
                onToast={fireToast}
                onGoToGroups={() => setScreen('groups')}
              />
            </div>
          </div>
        </div>
  )
}

export function SettingsGroups({ onGoToGroups }: { onGoToGroups?: () => void }) {

  return (
    <>
      <div className="set-section" id="set-categories">
        <h2><Ico name="folder" />分组管理</h2>
        <div className="set-card">
          <div className="set-row set-row-link" onClick={onGoToGroups}>
            <div><div className="rt">分组管理</div><div className="rd">创建、编辑和排序分组</div></div>
            <Ico name="chevron-right" className="set-row-link-icon" />
          </div>
        </div>
      </div>
    </>
  )
}

export function SettingsContent({
  sectionId,
  theme,
  themePref,
  view,
  onThemeChange,
  onToast,
  onGoToGroups,
}: {
  sectionId: string
  theme: Theme
  themePref: ThemePref
  view: ViewMode
  onThemeChange?: (pref: ThemePref) => void
  onToast?: (title?: string) => void
  onGoToGroups?: () => void
}) {
  const readOnly = useBookmarkStore(state => state.isReadOnly)
  const body = (() => {
    if (sectionId === 'set-general') return <SettingsGeneral themePref={themePref} onThemeChange={onThemeChange} />
    if (sectionId === 'set-list') return <SettingsDisplay section="list" />
    if (sectionId === 'set-grid') return <SettingsDisplay section="grid" />
    if (sectionId === 'set-ai') return <SettingsAI />
    if (sectionId === 'set-data') return <SettingsData onToast={onToast} />
    return <SettingsGroups onGoToGroups={onGoToGroups} />
  })()
  if (!EDITABLE_SECTIONS.has(sectionId)) return body
  return (
    <fieldset className="set-editable-sections" disabled={readOnly}>
      {body}
    </fieldset>
  )
}
