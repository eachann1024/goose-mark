import { chooseSharedJsonSource, createSharedJsonSource, initializeSharedJsonSync, removeSharedJsonSource, useSharedJsonStatus } from '@/lib/sharedJson'
import type { HomeToastHandler } from './homeInteractionTypes'

export function SharedJsonControls({ onToast }: { onToast?: HomeToastHandler }) {
  const { phase, path, busy, error } = useSharedJsonStatus()
  const connected = phase !== 'local'
  const title = busy ? '处理中' : phase === 'paused' ? '已暂停' : connected ? '已连接' : '未连接'
  const action = async (operation: () => Promise<boolean>, message: string) => {
    try { if (await operation()) onToast?.(message) }
    catch (failure) { onToast?.(failure instanceof Error ? failure.message : '操作失败，请重试', { tone: 'error' }) }
  }
  return (
    <div className="set-row set-row-action">
      <div>
        <div className="rt" title={error || undefined}>数据文件夹 · {title}</div>
        {path && <div className="rd">{path}</div>}
      </div>
      <div className="set-data-actions" aria-busy={busy}>
        {phase === 'paused' && (
          <button className="btn btn-primary" style={{ height: 34, fontSize: 12.5 }} disabled={busy}
            onClick={() => void action(() => initializeSharedJsonSync(), '已重新连接数据源')}>重新连接</button>
        )}
        <button className="btn btn-outline" style={{ height: 34, fontSize: 12.5 }} disabled={busy}
          onClick={() => void action(createSharedJsonSource, '已创建并连接数据文件夹')}>新建文件夹</button>
        <button className={`btn ${connected ? 'btn-outline' : 'btn-primary'}`} style={{ height: 34, fontSize: 12.5 }} disabled={busy}
          onClick={() => void action(chooseSharedJsonSource, '已连接数据文件夹')}>{connected ? '更换文件夹' : '打开文件夹'}</button>
        {connected && <button className="btn btn-ghost danger" style={{ height: 34, fontSize: 12.5 }} disabled={busy}
          onClick={() => void action(removeSharedJsonSource, '已断开连接，当前数据保留在本地')}>断开连接</button>}
      </div>
    </div>
  )
}
