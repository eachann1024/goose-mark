import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion'
import { BG, H, PITCH, CELLS, SHOT_FROM, W, shotIndex } from './theme'
import { Painter } from './dots'
import { drawP1 } from './shots/P1'
import { drawP2 } from './shots/P2'
import { drawP3 } from './shots/P3'
import { drawP4 } from './shots/P4'
import { drawP5 } from './shots/P5'
import { drawP6 } from './shots/P6'
import { drawP7 } from './shots/P7'
import { drawP8 } from './shots/P8'

const DRAW = [drawP1, drawP2, drawP3, drawP4, drawP5, drawP6, drawP7, drawP8]

export const renderFrame = (p: Painter, f: number) => {
  p.begin()
  DRAW[shotIndex(f)](p, f)
}

const WAVE_START = SHOT_FROM[6]
const WAVE_LEN = 12

const mk = () => {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return c
}
let oldCv: HTMLCanvasElement | null = null
let blankCv: HTMLCanvasElement | null = null

/** 镜 6→7 硬切：全屏按列波浪翻转 12 帧（整列拷贝，无重采样） */
const drawWave = (ctx: CanvasRenderingContext2D, p: Painter, f: number) => {
  renderFrame(p, f)
  const u = f - WAVE_START
  if (u < 0 || u >= WAVE_LEN) return
  oldCv ??= mk()
  blankCv ??= mk()
  const po = new Painter(oldCv.getContext('2d')!)
  renderFrame(po, WAVE_START - 1)
  const pb = new Painter(blankCv.getContext('2d')!)
  pb.begin()
  for (let c = 0; c < CELLS; c++) {
    const s = (c / (CELLS - 1)) * 8
    const src = u < s ? oldCv : u < s + 3 ? blankCv : null
    if (src) ctx.drawImage(src, c * PITCH, 0, PITCH, H, c * PITCH, 0, PITCH, H)
  }
}

export const PixelVideo: React.FC = () => {
  const frame = useCurrentFrame()
  const ref = useRef<HTMLCanvasElement>(null)
  const [handle] = useState(() => delayRender('pixel fonts'))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([
      document.fonts.load('600 100px "PingFang SC"', '丢一段话'),
      document.fonts.load('500 48px "PingFang SC"', '丢一段话'),
      document.fonts.load('700 44px "Menlo"', 'raycast'),
      document.fonts.load('700 260px "Menlo"', '0123456789'),
    ])
      .catch(() => undefined)
      .then(() => {
        setReady(true)
        continueRender(handle)
      })
  }, [handle])

  useLayoutEffect(() => {
    if (!ready || !ref.current) return
    const ctx = ref.current.getContext('2d')!
    const p = new Painter(ctx)
    drawWave(ctx, p, frame)
  }, [frame, ready])

  return (
    <AbsoluteFill style={{ background: BG }}>
      <canvas ref={ref} width={W} height={H} style={{ width: W, height: H, display: 'block' }} />
      <Audio src={staticFile('audio/pixel.wav')} />
    </AbsoluteFill>
  )
}
