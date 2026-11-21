import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Ico } from './icon'
import { useFeedbackUnread } from '@/lib/feedback'
import { isTelemetryEnabled, setTelemetryEnabled, subscribeTelemetry, telemetryPreview } from '@/lib/telemetry'
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
  ['隐私与统计', 'shield', 'set-privacy'],
]

export const PRIVACY_NAV_INDEX = SET_NAV.findIndex(([, , id]) => id === 'set-privacy')

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

export function SettingsPrivacy() {
  const [enabled, setEnabled] = useState(() => isTelemetryEnabled())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewJson, setPreviewJson] = useState('')

  useEffect(() => {
    const sync = () => {
      setEnabled(isTelemetryEnabled())
      if (previewOpen) {
        setPreviewJson(JSON.stringify(telemetryPreview(), null, 2))
      }
    }
    sync()
    return subscribeTelemetry(sync)
  }, [previewOpen])

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  const openPreview = () => {
    setPreviewJson(JSON.stringify(telemetryPreview(), null, 2))
    setPreviewOpen(true)
  }

  return (
    <>
      <div className="set-section" id="set-privacy">
        <h2><Ico name="shield" />隐私与统计</h2>
        <div className="set-card">
          <div className="set-row">
            <div>
              <div className="rt">发送匿名使用统计</div>
              <div className="rd">只统计功能使用次数和报错类型，不含任何书签、分组或搜索词等内容，关闭后会删除匿名编号</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="发送匿名使用统计"
              className={`g-switch${enabled ? ' on' : ''}`}
              onClick={() => setTelemetryEnabled(!enabled)}
            />
          </div>
          <div className="set-row set-row-action">
            <div>
              <div className="rt">查看上报内容</div>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={openPreview}
            >
              <Ico name="eye" />查看上报内容
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div
          className="help-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="上报内容预览"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false)
          }}
        >
          <div className="help-panel telemetry-preview-panel">
            <div className="help-header">
              <span className="help-title">上报内容预览</span>
              <button type="button" className="help-close" onClick={() => setPreviewOpen(false)} title="关闭 (Esc)" aria-label="关闭">
                <Ico name="x" />
              </button>
            </div>
            <div className="help-body">
              <pre className="telemetry-preview-pre" aria-readonly="true" tabIndex={0}>
                {previewJson}
              </pre>
            </div>
          </div>
        </div>
      )}
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
    if (sectionId === 'set-privacy') return <SettingsPrivacy />
    return <SettingsGroups onGoToGroups={onGoToGroups} />
  })()
  if (!EDITABLE_SECTIONS.has(sectionId)) return body
  return (
    <fieldset className="set-editable-sections" disabled={readOnly}>
      {body}
    </fieldset>
  )
}
