import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createSharedJsonSource, useSharedJsonStatus } from '@/lib/sharedJson'
import './new-data-folder.css'

export function NewDataFolderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('goose-marks')
  const [directory, setDirectory] = useState(() => {
    try { return window.utools?.getPath('documents') || '' }
    catch { return '' }
  })
  const [pending, setPending] = useState<'choosing' | 'creating' | null>(null)
  const [error, setError] = useState('')
  const busy = useSharedJsonStatus(state => state.busy)
  const running = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const locked = pending !== null || busy

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
        title: '选择保存位置',
        buttonLabel: '选择此位置',
        properties: ['openDirectory']
      })
      if (Array.isArray(selected) && typeof selected[0] === 'string' && selected[0].trim()) {
        setDirectory(selected[0])
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '选择位置失败，请重试')
    } finally {
      running.current = false
      setPending(null)
    }
  }

  const create = async () => {
    if (running.current || busy) return
    running.current = true
    setPending('creating')
    setError('')
    try {
      if (await createSharedJsonSource({ directory, name })) onCreated()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '创建失败，请重试')
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
      <div ref={panel} className="help-panel" role="dialog" aria-modal="true" aria-label="新建数据文件夹" aria-busy={locked}>
        <div className="help-header"><span className="help-title">新建数据文件夹</span></div>
        <div className="help-body">
          <label className="field">
            <span className="lbl">文件夹名称</span>
            <input className="txt-input desc-input" value={name} disabled={locked}
              onChange={event => { setName(event.target.value); setError('') }} />
          </label>
          <div className="field">
            <label className="lbl" htmlFor="new-data-folder-location">保存位置</label>
            <div className="new-data-folder-location">
              <input id="new-data-folder-location" className="txt-input desc-input" value={directory}
                title={directory} readOnly disabled={locked} placeholder="选择保存位置" />
              <button type="button" className="btn btn-outline" disabled={locked} onClick={() => void chooseDirectory()}>
                {pending === 'choosing' ? '选择中…' : '选择位置'}
              </button>
            </div>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="set-data-actions">
            <button type="button" className="btn btn-outline" disabled={locked} onClick={onClose}>取消</button>
            <button type="button" className="btn btn-primary" disabled={locked || !directory || !name.trim()}
              onClick={() => void create()}>{pending === 'creating' ? '创建中…' : '创建并连接'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
