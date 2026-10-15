import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createSharedJsonSource, openSharedJsonSource, removeSharedJsonSource, useSharedJsonStatus } from '@/lib/sharedJson'
import './new-data-folder.css'

export function DataFolderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const { path, busy, phase } = useSharedJsonStatus()
  const [mode, setMode] = useState<'create' | 'existing'>(path ? 'existing' : 'create')
  const [name, setName] = useState('goose-marks')
  const [directory, setDirectory] = useState(() => {
    try { return window.utools?.getPath('documents') || '' }
    catch { return '' }
  })
  const [pending, setPending] = useState<'choosing' | 'saving' | 'removing' | null>(null)
  const [error, setError] = useState('')
  const running = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const locked = pending !== null || busy
  const canReconnect = !!path && phase !== 'connected'
  const title = mode === 'create' ? '新建数据文件夹' : '更改数据文件夹'

  useEffect(() => {
    const previous = document.activeElement
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    if (locked) return
    const field = panel.current?.querySelector<HTMLElement>(mode === 'create' ? 'input:not(:disabled)' : 'button.btn-primary:not(:disabled)')
    field?.focus()
  }, [locked, mode])

  const run = async (kind: 'choosing' | 'saving' | 'removing', action: () => Promise<void>, fallback: string) => {
    if (running.current || busy) return
    running.current = true
    setPending(kind)
    setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : fallback) }
    finally {
      running.current = false
      setPending(null)
    }
  }

  const pickDirectory = async (dialogTitle: string) => {
    if (!window.utools?.showOpenDialog) throw new Error('当前环境不支持选择文件夹')
    const picked = await window.utools.showOpenDialog({ title: dialogTitle, buttonLabel: '选择', properties: ['openDirectory'] })
    return Array.isArray(picked) && typeof picked[0] === 'string' ? picked[0].trim() : ''
  }

  const chooseAndOpen = () => run('choosing', async () => {
    const selected = await pickDirectory('选择数据文件夹')
    if (!selected) return
    if (selected === path && phase === 'connected') { onClose(); return }
    if (await openSharedJsonSource(selected)) onSaved(path ? '已更改数据文件夹' : '已设置数据文件夹')
  }, '选择文件夹失败，请重试')

  const chooseCreateLocation = () => run('choosing', async () => {
    const selected = await pickDirectory('选择保存位置')
    if (selected) setDirectory(selected)
  }, '选择位置失败，请重试')

  const reconnect = () => run('saving', async () => {
    if (path && await openSharedJsonSource(path)) onSaved('已重新连接数据文件夹')
  }, '重新连接失败，请重试')

  const create = () => run('saving', async () => {
    if (await createSharedJsonSource({ directory, name })) onSaved('已创建数据文件夹')
  }, '新建失败，请重试')

  const remove = () => run('removing', async () => {
    if (await removeSharedJsonSource()) onSaved('已移除数据文件夹，当前书签保留在应用中')
  }, '移除失败，请重试')

  const showExisting = () => {
    setError('')
    if (path) setMode('existing')
    else void chooseAndOpen()
  }

  const showCreate = () => { setMode('create'); setError('') }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!running.current && !busy) onClose()
    }
    if (event.key !== 'Tab') return
    const controls = panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)')
    if (!controls?.length) { event.preventDefault(); return }
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return (
    <div className="help-backdrop" onKeyDown={onKeyDown}
      onMouseDown={event => { if (event.target === event.currentTarget && !running.current && !busy) onClose() }}>
      <div ref={panel} className="help-panel" role="dialog" aria-modal="true" aria-label={title} aria-busy={locked}>
        <div className="help-header">
          <span className="help-title">{title}</span>
          <button type="button" className="btn btn-ghost" disabled={locked}
            onClick={() => mode === 'create' ? showExisting() : showCreate()}>
            {mode === 'create' ? '使用已有文件夹' : '新建文件夹'}
          </button>
        </div>
        <div className="help-body">
          {mode === 'create' ? <>
            <label className="field">
              <span className="lbl">文件夹名称</span>
              <input className="txt-input desc-input" value={name} disabled={locked}
                onChange={event => { setName(event.target.value); setError('') }}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void create() } }} />
            </label>
            <div className="field">
              <label className="lbl" htmlFor="new-data-folder-location">保存位置</label>
              <div className="new-data-folder-location">
                <input id="new-data-folder-location" className="txt-input desc-input" value={directory}
                  title={directory} readOnly disabled={locked} placeholder="选择文件夹" />
                <button type="button" className="btn btn-outline" disabled={locked} onClick={() => void chooseCreateLocation()}>
                  {pending === 'choosing' ? '选择中…' : '选择'}
                </button>
              </div>
            </div>
          </> : path && <div className="data-folder-path" title={path}>{path}</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="set-data-actions data-folder-footer">
            {path && <button type="button" className="btn btn-ghost danger data-folder-remove" disabled={locked}
              onClick={() => void remove()}>{pending === 'removing' ? '移除中…' : '移除'}</button>}
            <button type="button" className="btn btn-outline" disabled={locked} onClick={onClose}>取消</button>
            {mode === 'existing' && canReconnect && <button type="button" className="btn btn-outline" disabled={locked}
              onClick={() => void chooseAndOpen()}>{pending === 'choosing' ? '选择中…' : '选择文件夹'}</button>}
            {mode === 'existing' ? <button type="button" className="btn btn-primary" disabled={locked}
              onClick={() => void (canReconnect ? reconnect() : chooseAndOpen())}>
              {pending === 'saving' ? '重新连接中…' : pending === 'choosing' && !canReconnect ? '选择中…' : canReconnect ? '重新连接' : '选择文件夹'}
            </button> : <button type="button" className="btn btn-primary" disabled={locked || !directory || !name.trim()}
              onClick={() => void create()}>{pending === 'saving' ? '新建中…' : '新建'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
