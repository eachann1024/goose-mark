import { useEffect } from 'react'
import type { ImportMode } from '@/hooks/import-export/types'
import type { importPreviewCounts } from '@/hooks/import-export/preview'

export function DataImportPreview({ counts, onConfirm, onCancel }: {
  counts: ReturnType<typeof importPreviewCounts>
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onCancel])
  return (
    <div className="help-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="help-panel" role="dialog" aria-modal="true" aria-label="导入预览">
        <div className="help-header"><span className="help-title">导入预览</span></div>
        <div className="help-body">
          <p>书签 {counts.bookmarks} · 分组 {counts.groups} · 回收站 {counts.trash} · 冲突 {counts.conflicts}</p>
          <p>合并保留当前冲突项；覆盖替换全部书签和分组。已连接的数据源也会同步更新。</p>
          <div className="set-data-actions">
            <button className="btn btn-outline" onClick={onCancel}>取消</button>
            <button className="btn btn-outline" onClick={() => onConfirm('merge')}>确认合并</button>
            <button className="btn btn-primary" onClick={() => onConfirm('overwrite')}>确认覆盖</button>
          </div>
        </div>
      </div>
    </div>
  )
}
