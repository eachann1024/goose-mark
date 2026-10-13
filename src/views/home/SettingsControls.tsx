import type * as React from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Ico } from './icon'

/* ---------- 通用分段选择控件（模块级，避免 SettingsContent 每次渲染重建） ---------- */
export function Seg<T extends string>({
  opts,
  value,
  onChange
}: {
  opts: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="radio-seg">
      {opts.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}



/**
 * 设置页自定义下拉（替代原生 select，避免系统蓝底 option；视觉对齐 .select + ctx-menu）
 */
export function SettingsSelect({
  value,
  options,
  onChange,
  icon = 'cpu',
  wide
}: {
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
  icon?: string
  /** 更宽的触发器（模型名等长文本） */
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const selected = options.find((o) => o.id === value) ?? options[0]
  const display = selected?.label || selected?.id || value

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndRestoreFocus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [closeAndRestoreFocus, open])

  useEffect(() => {
    if (!open) return
    const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value))
    const frame = window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open, options, value])

  const handleOptionKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, index + 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = options.length - 1
    else if (event.key === 'Tab') {
      setOpen(false)
      return
    } else {
      return
    }
    event.preventDefault()
    optionRefs.current[nextIndex]?.focus()
  }, [options.length])

  return (
    <div className={`set-select${wide ? ' set-select--wide' : ''}${open ? ' open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="select set-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        title={display}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setOpen(true)
        }}
      >
        <Ico name={icon} />
        <span className="set-select-value">{display}</span>
        <Ico name="chevron-down" />
      </button>
      {open && (
        <div id={menuId} className="set-select-menu" role="listbox">
          {options.map((m, index) => {
            const on = m.id === value
            return (
              <button
                ref={(node) => { optionRefs.current[index] = node }}
                key={m.id}
                type="button"
                role="option"
                aria-selected={on}
                className={`set-select-opt${on ? ' on' : ''}`}
                title={m.label || m.id}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => {
                  onChange(m.id)
                  closeAndRestoreFocus()
                }}
              >
                <span className="set-select-opt-check">{on ? <Ico name="check" /> : null}</span>
                <span className="set-select-opt-label">{m.label || m.id}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
