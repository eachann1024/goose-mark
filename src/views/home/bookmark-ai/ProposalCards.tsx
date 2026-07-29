import type { BookmarkAgentChangeProposal } from '@/services/bookmarkAgent'
import { Ico } from '../icon'

export function ProposalCards({
  proposals,
  applyingProposalId,
  disabled,
  onApply,
  onCancel,
}: {
  proposals: BookmarkAgentChangeProposal[]
  applyingProposalId: string
  disabled?: boolean
  onApply: (proposal: BookmarkAgentChangeProposal) => void
  onCancel: (proposal: BookmarkAgentChangeProposal) => void
}) {
  if (proposals.length === 0) return null
  return (
    <div className="bookmark-ai-proposals">
      {proposals.map((proposal) => {
        const applying = applyingProposalId === proposal.id
        return (
          <section
            className={`bookmark-ai-confirm${proposal.destructive ? ' destructive' : ''}`}
            key={proposal.id}
            aria-label="待确认变更"
          >
            <div className="bookmark-ai-confirm-head">
              <span><Ico name={proposal.destructive ? 'alert-circle' : 'file-text'} /></span>
              <div>
                <h3>{proposal.summary}</h3>
                <p>确认前不会修改任何数据</p>
              </div>
            </div>
            <ol>{proposal.details.map((detail, index) => <li key={`${proposal.id}-${index}`}>{detail}</li>)}</ol>
            <div className="bookmark-ai-confirm-actions">
              <button
                type="button"
                className="secondary"
                disabled={disabled || !!applyingProposalId}
                onClick={() => onCancel(proposal)}
              >
                取消
              </button>
              <button
                type="button"
                className={proposal.destructive ? 'danger' : 'primary'}
                disabled={disabled || !!applyingProposalId}
                onClick={() => onApply(proposal)}
              >
                {applying ? <><Ico name="loader" className="spin" />正在执行</> : '同意并执行'}
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
