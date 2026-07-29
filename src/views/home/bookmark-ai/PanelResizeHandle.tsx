import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'

const STORAGE_KEY = 'goose-marks.bookmark-ai.panel-width'
const MIN_WIDTH = 320
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 400
const KEYBOARD_STEP = 16

function clampWidth(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
}

function readWidth() {
  const raw = Number(getPersistentItem(STORAGE_KEY))
  return Number.isFinite(raw) ? clampWidth(raw) : DEFAULT_WIDTH
}

function applyWidth(width: number) {
  const root = document.querySelector<HTMLElement>('.goose-home')
  root?.style.setProperty('--bookmark-ai-panel-width', `${width}px`)
}

export function PanelResizeHandle() {
  const [width, setWidth] = useState(readWidth)
  const [isNarrow, setIsNarrow] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  const updateWidth = useCallback((next: number, persist = false) => {
    const clamped = clampWidth(next)
    widthRef.current = clamped
    setWidth(clamped)
    applyWidth(clamped)
    if (persist) utoolsStorage.setItem(STORAGE_KEY, String(clamped))
  }, [])

  useEffect(() => {
    applyWidth(widthRef.current)
    const media = window.matchMedia('(max-width:720px)')
    const sync = () => setIsNarrow(media.matches)
    sync()
    if (typeof media.addEventListener === 'function') media.addEventListener('change', sync)
    else media.addListener(sync)
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', sync)
      else media.removeListener(sync)
    }
  }, [])

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      updateWidth(drag.startWidth + drag.startX - event.clientX)
    }
    const finish = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      updateWidth(widthRef.current, true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [updateWidth])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isNarrow || event.button !== 0) return
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startWidth: widthRef.current }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isNarrow) return
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = widthRef.current + KEYBOARD_STEP
    else if (event.key === 'ArrowRight') next = widthRef.current - KEYBOARD_STEP
    else if (event.key === 'Home') next = MIN_WIDTH
    else if (event.key === 'End') next = MAX_WIDTH
    if (next === null) return
    event.preventDefault()
    updateWidth(next, true)
  }

  return (
    <div
      className="bookmark-ai-resize-handle"
      role="separator"
      aria-label="调整 AI 面板宽度"
      aria-orientation="vertical"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={width}
      aria-valuetext={`${width} 像素`}
      tabIndex={isNarrow ? -1 : 0}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => !isNarrow && updateWidth(DEFAULT_WIDTH, true)}
      onKeyDown={handleKeyDown}
      title="拖动调整宽度；方向键微调；双击恢复默认"
    />
  )
}
