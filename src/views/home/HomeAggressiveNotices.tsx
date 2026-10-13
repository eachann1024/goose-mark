import type * as React from 'react'
import { type AggressiveAiSaveResult } from '@/services/aggressiveAiSave'
import { Ico } from './icon'
import { type AggressiveSaveJob, type AggressiveSaveSuccess, type AggressiveSaveFailure } from './homeTypes'
import { type HomeAggressivePanelOpener, type HomeNavigationBindings } from './homeInteractionTypes'

export function HomeAggressiveNotices({
  activeAggressiveSaveJob,
  aggressiveSaveSuccesses,
  aggressiveSaveFailure,
  screen,
  aggressiveSaveWaitingCount,
  clearAggressiveSaveSuccessTimer,
  scheduleAggressiveSaveSuccessDismiss,
  dismissAggressiveSaveSuccess,
  jumpToAggressiveSaveResult,
  undoAggressiveSave,
  takeOverAggressiveSave,
  setAggressiveSaveFailure,
  openAggressiveSavePanel,
  enqueueAggressiveSave,
  setScreen
}: Pick<HomeNavigationBindings, 'screen' | 'setScreen'> & {
  activeAggressiveSaveJob: AggressiveSaveJob | undefined
  aggressiveSaveSuccesses: AggressiveSaveSuccess[]
  aggressiveSaveFailure: AggressiveSaveFailure | null
  aggressiveSaveWaitingCount: number
  clearAggressiveSaveSuccessTimer: (id: number) => void
  scheduleAggressiveSaveSuccessDismiss: (id: number, delay?: number) => void
  dismissAggressiveSaveSuccess: (id: number) => void
  jumpToAggressiveSaveResult: (result: AggressiveAiSaveResult) => void
  undoAggressiveSave: (notice: AggressiveSaveSuccess) => void
  takeOverAggressiveSave: (notice: AggressiveSaveSuccess) => void
  setAggressiveSaveFailure: React.Dispatch<React.SetStateAction<AggressiveSaveFailure | null>>
  openAggressiveSavePanel: HomeAggressivePanelOpener
  enqueueAggressiveSave: (url: string) => void
}) {
  return (
    (activeAggressiveSaveJob || aggressiveSaveSuccesses.length > 0 || (aggressiveSaveFailure && screen !== 'ai-aggressive-save')) && (
          <aside className="ag-save-stack" aria-label="AI 快速保存状态" aria-live="polite">
            {activeAggressiveSaveJob && (
              <div className="ag-save-progress-wrap">
                <div className="ag-save-progress-pill">
                  <span className="ag-save-progress-orb" aria-hidden="true" />
                  <div className="ag-save-progress-copy">
                    <div className="ag-save-progress-host">{activeAggressiveSaveJob.host}</div>
                    <div className="ag-save-progress-step">
                      {activeAggressiveSaveJob.detail}
                    </div>
                  </div>
                </div>
                {aggressiveSaveWaitingCount > 0 && (
                  <div className="ag-save-queue-hint">还有 {aggressiveSaveWaitingCount} 个排队</div>
                )}
              </div>
            )}

            {aggressiveSaveSuccesses.map((notice) => {
              const result = notice.result
              const groupText = result.groupLabels.join(' · ') || '未分组'
              return (
                <section
                  className="ag-save-success-card"
                  key={`ag-success-${notice.id}`}
                  onPointerEnter={() => clearAggressiveSaveSuccessTimer(notice.id)}
                  onPointerLeave={() => scheduleAggressiveSaveSuccessDismiss(notice.id, 2200)}
                  onFocusCapture={() => clearAggressiveSaveSuccessTimer(notice.id)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      scheduleAggressiveSaveSuccessDismiss(notice.id, 2200)
                    }
                  }}
                >
                  <button
                    type="button"
                    className="ag-save-success-close"
                    aria-label="关闭保存结果"
                    onClick={() => dismissAggressiveSaveSuccess(notice.id)}
                  >
                    <Ico name="x" />
                  </button>
                  <span className="ag-save-success-icon" aria-hidden="true"><Ico name="check" /></span>
                  <div className="ag-save-success-body">
                    <div className="ag-save-success-title">已加入 {result.locations.length} 个分组</div>
                    <div className="ag-save-success-detail">
                      <span className="ag-save-success-bookmark">「{result.title || '书签'}」</span>
                      <span aria-hidden="true"> → </span>
                      <span className="ag-save-success-groups">{groupText}</span>
                    </div>
                    <div className="ag-save-success-actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          jumpToAggressiveSaveResult(result)
                          dismissAggressiveSaveSuccess(notice.id)
                        }}
                      >
                        查看位置
                      </button>
                      <button type="button" className="danger" onClick={() => undoAggressiveSave(notice)}>
                        撤销
                      </button>
                      <button type="button" onClick={() => takeOverAggressiveSave(notice)}>
                        编辑书签
                      </button>
                    </div>
                  </div>
                </section>
              )
            })}

            {aggressiveSaveFailure && screen !== 'ai-aggressive-save' && (
              <section className="ag-save-failure-card">
                <button
                  type="button"
                  className="ag-save-success-close"
                  aria-label="关闭失败记录"
                  onClick={() => setAggressiveSaveFailure(null)}
                >
                  <Ico name="x" />
                </button>
                <span className="ag-save-failure-card-icon" aria-hidden="true"><Ico name="alert-circle" /></span>
                <div className="ag-save-success-body">
                  <div className="ag-save-success-title">{aggressiveSaveFailure.message}</div>
                  <div className="ag-save-failure-card-host">{aggressiveSaveFailure.host}</div>
                  <div className="ag-save-failure-card-detail">{aggressiveSaveFailure.detail}</div>
                  <div className="ag-save-success-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => openAggressiveSavePanel(aggressiveSaveFailure.url, { autoStart: false })}
                    >
                      查看原因
                    </button>
                    <button type="button" onClick={() => enqueueAggressiveSave(aggressiveSaveFailure.url)}>
                      重试
                    </button>
                    <button type="button" onClick={() => setScreen('settings')}>
                      AI 设置
                    </button>
                  </div>
                </div>
              </section>
            )}
          </aside>
        )
  )
}
