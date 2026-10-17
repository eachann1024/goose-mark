import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const VIDEO_SRC = 'media/ai-create-pixel.mp4'
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const DURATION = 720
const VOLUME = 0.35

type Phase = 'idle' | 'opening' | 'open' | 'closing'

/** 方块在视口中的位置 → 全屏层的 clip-path inset。 */
function insetFor(el: HTMLElement | null): string {
  if (!el) return 'inset(50% 50% 50% 50%)'
  const r = el.getBoundingClientRect()
  const w = window.innerWidth
  const h = window.innerHeight
  return `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px round 12px)`
}

/** 像素风播放键：阶梯三角形，与像素动画视觉一致。 */
function PixelPlay() {
  return (
    <svg viewBox="0 0 10 12" width="30" height="36" shapeRendering="crispEdges" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 0h2v1h2v1h2v1h2v1h2v4H8v1H6v1H4v1H2v1H0z"
      />
    </svg>
  )
}

export function AIIntroVideo() {
  const boxRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  const close = useCallback(() => {
    if (phaseRef.current !== 'open' && phaseRef.current !== 'opening') return
    const layer = layerRef.current
    videoRef.current?.pause()
    setPhase('closing')
    if (!layer) { setPhase('idle'); return }
    const from = getComputedStyle(layer).clipPath
    layer.getAnimations().forEach((a) => a.cancel())
    const anim = layer.animate(
      [{ clipPath: from && from !== 'none' ? from : 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetFor(boxRef.current) }],
      { duration: DURATION, easing: EASE, fill: 'forwards' }
    )
    anim.onfinish = () => setPhase('idle')
  }, [])

  const open = useCallback(() => {
    if (phaseRef.current !== 'idle') return
    setPhase('opening')
  }, [])

  // 全屏层挂载后执行展开动画，结束后开始播放
  useEffect(() => {
    if (phase !== 'opening') return
    const layer = layerRef.current
    if (!layer) return
    const anim = layer.animate(
      [{ clipPath: insetFor(boxRef.current) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
      { duration: DURATION, easing: EASE, fill: 'forwards' }
    )
    anim.onfinish = () => {
      if (phaseRef.current !== 'opening') return
      setPhase('open')
      const v = videoRef.current
      if (!v) return
      v.volume = VOLUME
      v.currentTime = 0
      void v.play().catch(() => close())
    }
  }, [phase, close])

  // Esc 关闭（捕获阶段拦截，避免触发页面级 Esc 返回）
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase, close])

  const active = phase !== 'idle'

  return (
    <>
      <button
        ref={boxRef}
        type="button"
        className={`ai-intro-box${active ? ' is-active' : ''}`}
        aria-label="播放介绍视频"
        onClick={open}
      >
        <span className="ai-intro-play"><PixelPlay /></span>
      </button>
      {active && createPortal(
        <div
          ref={layerRef}
          className="ai-intro-layer"
          style={{ clipPath: insetFor(boxRef.current) }}
          onClick={close}
        >
          <video
            ref={videoRef}
            className="ai-intro-video"
            src={VIDEO_SRC}
            preload="auto"
            playsInline
            onEnded={close}
          />
          <button
            type="button"
            className={`ai-intro-close${phase === 'open' ? ' on' : ''}`}
            aria-label="关闭"
            onClick={(e) => { e.stopPropagation(); close() }}
          >
            <svg viewBox="0 0 8 8" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
              <path fill="currentColor" d="M0 0h2v1h1v1h2V1h1V0h2v2H7v1H6v2h1v1h1v2H6V7H5V6H3v1H2v1H0V6h1V5h1V3H1V2H0z" />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
