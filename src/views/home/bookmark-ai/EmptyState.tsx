import { Ico } from '../icon'

const SUGGESTIONS = [
  '帮我找出前端开发相关的书签',
  '检查所有书签是否都能正常访问',
  '帮我整理分组，并先给出修改清单',
  '列出当前所有一级和二级分组',
]

export function EmptyState({ disabled, onSelect }: { disabled?: boolean; onSelect: (value: string) => void }) {
  return (
    <div className="bookmark-ai-empty">
      <span className="bookmark-ai-empty-icon"><Ico name="sparkles" /></span>
      <h3>可以直接让 AI 操作书签</h3>
      <p>可检查链接、调整书签位置并管理分组；写入前会先给你确认。</p>
      <div className="bookmark-ai-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button type="button" key={suggestion} disabled={disabled} onClick={() => onSelect(suggestion)}>
            <span>{suggestion}</span>
            <Ico name="arrow-up-right" />
          </button>
        ))}
      </div>
    </div>
  )
}
