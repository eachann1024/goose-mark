import type { BookmarkApprovalEntry } from '@/services/bookmarkAgent/transaction'
import { Ico } from '../icon'

function statusCopy(entry: BookmarkApprovalEntry) {
  if (entry.status === 'completed' && entry.undo?.available) {
    return { label: '已完成，可恢复', detail: '这是上次会话留下的变更记录；执行撤回前必须重新校验当前书签数据。' }
  }
  if (entry.status === 'prepared') {
    return { label: '待重新确认', detail: entry.validation.reason || '恢复的变更计划需要重新校验后才能执行。' }
  }
  if (entry.status === 'failed') {
    return { label: '执行未完成', detail: entry.execution?.error || entry.validation.reason || '请重新生成或重新校验计划。' }
  }
  if (entry.status === 'executing') {
    return { label: '正在恢复状态', detail: '检测到未结束的执行记录，恢复层会先将它转为可安全处理的失败状态。' }
  }
  if (entry.status === 'undone') return { label: '已撤回', detail: '该变更已恢复到执行前状态。' }
  return { label: '已失效', detail: '该变更计划已经过期，请让 AI 重新生成。' }
}

export function RecoveredApprovals({
  entries,
  applyingProposalId,
  onUndo,
}: {
  entries: BookmarkApprovalEntry[]
  applyingProposalId: string
  onUndo: (entry: BookmarkApprovalEntry) => void
}) {
  const visible = entries.filter((entry) =>
    entry.status !== 'undone' &&
    entry.status !== 'expired' &&
    (entry.validation.state !== 'valid' || entry.status === 'failed' || entry.status === 'executing'),
  )
  if (visible.length === 0) return null
  return (
    <div className="bookmark-ai-recovered-approvals" aria-label="恢复的变更状态">
      {visible.map((entry) => {
        const copy = statusCopy(entry)
        return (
          <section className={`bookmark-ai-recovered-approval is-${entry.status}`} key={entry.proposalId} role="status">
            <span className="bookmark-ai-recovered-icon">
              <Ico name={entry.status === 'completed' ? 'check-circle' : 'alert-circle'} />
            </span>
            <div>
              <strong>{copy.label} · {entry.summary}</strong>
              <p>{copy.detail}</p>
              {entry.status === 'completed' && entry.undo?.available ? (
                <button
                  type="button"
                  disabled={!!applyingProposalId}
                  onClick={() => onUndo(entry)}
                >
                  {applyingProposalId === `recovered:${entry.proposalId}` ? '正在校验并撤回…' : '重新校验并撤回'}
                </button>
              ) : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}
