import React from 'react'
import { useCurrentFrame } from 'remotion'
import { INK, MONO, SANS, SERIF } from '../theme'
import { textSpring } from '../lib/anim'

export type Chunk = { t: string; k?: 'sans' | 'serif'; c?: string }
export type TitleLines = Chunk[][]

/**
 * 双轨制标题：陈述词无衬线 700 / 强调词衬线 Italic 400，同字号同行混排。
 * 逐词 stagger 3 帧，Y +40 → 0。
 */
export const BigTitle: React.FC<{
  lines: TitleLines
  top: number
  left?: number
  size?: number
  start?: number
  ink?: string
  align?: 'left' | 'center'
  lineHeight?: number
}> = ({ lines, top, left = 0, size = 92, start = 0, ink = INK, align = 'left', lineHeight = 1.16 }) => {
  const frame = useCurrentFrame()

  let idx = 0
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: '100%',
        textAlign: align,
        color: ink,
        fontSize: size,
        lineHeight,
        fontKerning: 'normal',
        paddingBottom: size * 0.16,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: 'nowrap' }}>
          {line.map((chunk, ci) => {
            const delay = start + idx * 3
            idx += 1
            const p = textSpring(frame, delay)
            const style: React.CSSProperties =
              chunk.k === 'serif'
                ? { fontFamily: SERIF, fontWeight: 400, fontStyle: 'italic', letterSpacing: 0 }
                : { fontFamily: SANS, fontWeight: 700, letterSpacing: '-0.03em' }
            return (
              <span
                key={ci}
                style={{
                  ...style,
                  display: 'inline-block',
                  color: chunk.c ?? ink,
                  transform: `translateY(${(1 - p) * 40}px)`,
                  opacity: Math.min(1, p * 1.9),
                }}
              >
                {chunk.t}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** 辅助注释：等宽 400 / 24px / 字距 +0.08em */
export const Mono: React.FC<{
  children: React.ReactNode
  top?: number
  left?: number
  right?: number
  size?: number
  color?: string
  opacity?: number
  center?: boolean
}> = ({ children, top, left, right, size = 24, color = INK, opacity = 0.62, center }) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: center ? 0 : left,
      right,
      width: center ? '100%' : undefined,
      textAlign: center ? 'center' : undefined,
      fontFamily: MONO,
      fontWeight: 400,
      fontSize: size,
      letterSpacing: '0.08em',
      color,
      opacity,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </div>
)
