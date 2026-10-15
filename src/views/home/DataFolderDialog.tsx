import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createSharedJsonSource, openSharedJsonSource, removeSharedJsonSource, useSharedJsonStatus } from '@/lib/sharedJson'
import './new-data-folder.css'

export function DataFolderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const { path, busy, phase } = useSharedJsonStatus()
  const [mode, setMode] = useState<'create' | 'existing'>(path ? 'existing' : 'create')
  const [selected, setSelected] = useState(path || '')
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
  const title = mode === 'create' ? '新建数据文件夹' : path ? '更改数据文件夹' : '使用已有文件夹'

  useEffect(() => {
    const previous = document.activeElement
    panel.current?.querySelector('input')?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    if (!locked && !panel.current?.contains(document.activeElement)) panel.current?.querySelector('input')?.focus()
  }, [locked])

  const chooseDirectory = async () => {
    if (running.current || busy) return
    running.current = true
    setPending('choosing')
    setError('')
    try {
      if (!window.utools?.showOpenDialog) throw new Error('当前环境不支持选择文件夹')
      const selected = await window.utools.showOpenDialog({
        title: mode === 'create' ? '选择保存位置' : '选择数据文件夹',
        buttonLabel: '选择',
        properties: ['openDirectory']
      })
      if (Array.isArray(selected) && typeof selected[0] === 'string' && selected[0].trim()) {
        if (mode === 'create') setDirectory(selected[0])
        else setSelected(selected[0])
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '选择位置失败，请重试')
    } finally {
      running.current = false
      setPending(null)
    }
  }

  const save = async () => {
    if (running.current || busy) return
    running.current = true
    setPending('saving')
    setError('')
    try {
      if (mode === 'create') {
        if (await createSharedJsonSource({ directory, name })) onSaved('已创建数据文件夹')
      } else if (selected === path && phase === 'connected') {
        onClose()
      } else if (await openSharedJsonSource(selected)) onSaved('已更改数据文件夹')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败，请重试')
    } finally {
      running.current = false
      setPending(null)
    }
  }

  const remove = async () => {
    if (running.current || busy) return
    running.current = true
    setPending('removing')
    setError('')
    try {
      if (await removeSharedJsonSource()) onSaved('已移除数据文件夹，当前书签保留在应用中')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '移除失败，请重试')
    } finally {
      running.current = false
      setPending(null)
    }
  }

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
            onClick={() => { setMode(mode === 'create' ? 'existing' : 'create'); setError('') }}>
            {mode === 'create' ? '使用已有文件夹' : '新建文件夹'}
          </button>
        </div>
        <div className="help-body">
          {mode === 'create' && <label className="field">
            <span className="lbl">文件夹名称</span>
            <input className="txt-input desc-input" value={name} disabled={locked}
              onChange={event => { setName(event.target.value); setError('') }} />
          </label>}
          <div className="field">
            <label className="lbl" htmlFor="new-data-folder-location">{mode === 'create' ? '保存位置' : '数据文件夹'}</label>
            <div className="new-data-folder-location">
              <input id="new-data-folder-location" className="txt-input desc-input" value={mode === 'create' ? directory : selected}
                title={mode === 'create' ? directory : selected} readOnly disabled={locked} placeholder="选择文件夹" />
              <button type="button" className="btn btn-outline" disabled={locked} onClick={() => void chooseDirectory()}>
                {pending === 'choosing' ? '选择中…' : '选择'}
              </button>
            </div>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="set-data-actions data-folder-footer">
            {path && <button type="button" className="btn btn-ghost danger data-folder-remove" disabled={locked}
              onClick={() => void remove()}>{pending === 'removing' ? '移除中…' : '移除'}</button>}
            <button type="button" className="btn btn-outline" disabled={locked} onClick={onClose}>取消</button>
            <button type="button" className="btn btn-primary"
              disabled={locked || (mode === 'create' ? !directory || !name.trim() : !selected)}
              onClick={() => void save()}>{pending === 'saving' ? '保存中…' : mode === 'create' ? '新建' : '保存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
