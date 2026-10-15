import { useState } from 'react'
import { useSharedJsonStatus } from '@/lib/sharedJson'
import type { HomeToastHandler } from './homeInteractionTypes'
import { DataFolderDialog } from './DataFolderDialog'

export function SharedJsonControls({ onToast }: { onToast?: HomeToastHandler }) {
  const { phase, path, busy, error } = useSharedJsonStatus()
  const [editing, setEditing] = useState(false)
  const configured = !!path
  const title = busy ? '处理中' : phase === 'paused' ? '暂不可用' : configured ? '已设置' : '未设置'
  return (
    <>
      {editing && <DataFolderDialog onClose={() => setEditing(false)} onSaved={message => {
        setEditing(false)
        onToast?.(message)
      }} />}
      <div className="set-row set-row-action">
        <div>
          <div className="rt" title={error || undefined}>数据文件夹 · {title}</div>
          {path && <div className="rd">{path}</div>}
        </div>
        <div className="set-data-actions" aria-busy={busy}>
          <button className={`btn ${configured ? 'btn-outline' : 'btn-primary'}`} style={{ height: 34, fontSize: 12.5 }}
            disabled={busy} onClick={() => setEditing(true)}>{configured ? '更改' : '新建'}</button>
        </div>
      </div>
    </>
  )
}
