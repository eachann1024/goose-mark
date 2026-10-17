import React, { useId } from 'react'
import { ACCENT, INK } from '../theme'

/** 极淡点阵底纹：缓慢漂移，给纯色底一点印刷质感 */
export const DotField: React.FC<{
  pitch?: number
  color?: string
  opacity?: number
  drift?: number
  r?: number
}> = ({ pitch = 32, color = INK, opacity = 0.055, drift = 0, r = 1.1 }) => {
  const id = useId().replace(/:/g, '')
  const span = pitch * 40
  return (
    <div style={{ position: 'absolute', inset: -pitch * 2, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -drift % pitch, top: (-drift * 0.6) % pitch }}>
        <svg width={span} height={span}>
          <defs>
            <pattern id={`df-${id}`} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
              <circle cx={pitch / 2} cy={pitch / 2} r={r} fill={color} />
            </pattern>
          </defs>
          <rect width={span} height={span} fill={`url(#df-${id})`} opacity={opacity} />
        </svg>
      </div>
    </div>
  )
}

/** 四角定位括号：按顺时针错开生长 */
export const CornerBrackets: React.FC<{
  left: number
  top: number
  width: number
  height: number
  progress: number
  color?: string
  size?: number
  thickness?: number
  gap?: number
}> = ({ left, top, width, height, progress, color = ACCENT, size = 22, thickness = 3, gap = 14 }) => {
  const x0 = left - gap
  const y0 = top - gap
  const x1 = left + width + gap
  const y1 = top + height + gap
  const at = (i: number) => Math.max(0, Math.min(1, (progress - i * 0.14) * 2.4))
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y0,
          width: size,
          height: thickness,
          background: color,
          transform: `scaleX(${at(0)})`,
          transformOrigin: '0% 50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y0,
          width: thickness,
          height: size,
          background: color,
          transform: `scaleY(${at(0)})`,
          transformOrigin: '50% 0%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x1 - size,
          top: y0,
          width: size,
          height: thickness,
          background: color,
          transform: `scaleX(${at(1)})`,
          transformOrigin: '100% 50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x1 - thickness,
          top: y0,
          width: thickness,
          height: size,
          background: color,
          transform: `scaleY(${at(1)})`,
          transformOrigin: '50% 0%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x1 - size,
          top: y1 - thickness,
          width: size,
          height: thickness,
          background: color,
          transform: `scaleX(${at(2)})`,
          transformOrigin: '100% 50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x1 - thickness,
          top: y1 - size,
          width: thickness,
          height: size,
          background: color,
          transform: `scaleY(${at(2)})`,
          transformOrigin: '50% 100%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y1 - thickness,
          width: size,
          height: thickness,
          background: color,
          transform: `scaleX(${at(3)})`,
          transformOrigin: '0% 50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y1 - size,
          width: thickness,
          height: size,
          background: color,
          transform: `scaleY(${at(3)})`,
          transformOrigin: '50% 100%',
        }}
      />
    </>
  )
}

const SPARK = [
  [0, 0, 4.4],
  [0, -12, 2.8],
  [12, 0, 2.8],
  [0, 12, 2.8],
  [-12, 0, 2.8],
  [-8, -8, 1.8],
  [8, -8, 1.8],
  [-8, 8, 1.8],
  [8, 8, 1.8],
]

/** 半调点阵小星：强调落点的节拍装饰 */
export const Sparkle: React.FC<{ left: number; top: number; progress: number; color?: string; scale?: number; fade?: number }> = ({
  left,
  top,
  progress,
  color = ACCENT,
  scale = 1,
  fade = 1,
}) => {
  const p = Math.max(0, Math.min(1.12, progress))
  const S = 40
  return (
    <div
      style={{
        position: 'absolute',
        left: left - S,
        top: top - S,
        width: S * 2,
        height: S * 2,
        transform: `scale(${p * scale})`,
        transformOrigin: '50% 50%',
        opacity: Math.min(1, p * 3) * Math.max(0, Math.min(1, fade)),
      }}
    >
      <svg width={S * 2} height={S * 2} viewBox={`${-S} ${-S} ${S * 2} ${S * 2}`}>
        <g fill={color}>
          {SPARK.map(([dx, dy, r], i) => (
            <circle key={i} cx={dx} cy={dy} r={r} />
          ))}
        </g>
      </svg>
    </div>
  )
}

/** 将划线：从左向右写出来 */
export const Underline: React.FC<{ left: number; top: number; width: number; progress: number; color?: string; height?: number }> = ({
  left,
  top,
  width,
  progress,
  color = ACCENT,
  height = 3,
}) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width,
      height,
      background: color,
      transform: `scaleX(${Math.max(0, Math.min(1, progress))})`,
      transformOrigin: '0% 50%',
    }}
  />
)

/** 竖向强调导轨：从上往下生长，前端带一个点 */
export const AccentRail: React.FC<{
  left: number
  top: number
  height: number
  progress: number
  color?: string
  width?: number
}> = ({ left, top, height, progress, color = ACCENT, width = 2.5 }) => {
  const p = Math.max(0, Math.min(1, progress))
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          background: color,
          transform: `scaleY(${p})`,
          transformOrigin: '50% 0%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: left + width / 2 - 5,
          top: top + height * p - 5,
          width: 10,
          height: 10,
          borderRadius: 5,
          background: color,
          opacity: p > 0 && p < 1 ? 1 : 0,
        }}
      />
    </>
  )
}

/** 半调网点渐变方块：印刷印版装饰 */
export const HalftoneSwatch: React.FC<{ left: number; top: number; cell?: number; cols?: number; color?: string; progress: number }> = ({
  left,
  top,
  cell = 12,
  cols = 4,
  color = INK,
  progress,
}) => {
  const p = Math.max(0, Math.min(1, progress))
  const dots: React.ReactNode[] = []
  for (let y = 0; y < cols; y++) {
    for (let x = 0; x < cols; x++) {
      const t = (x / (cols - 1) + y / (cols - 1)) / 2
      const r = (cell / 2 - 0.5) * Math.sqrt(Math.min(1, 0.06 + t * p))
      dots.push(<circle key={`${x}-${y}`} cx={x * cell + cell / 2} cy={y * cell + cell / 2} r={Math.max(0.4, r)} fill={color} />)
    }
  }
  return (
    <svg width={cols * cell} height={cols * cell} style={{ position: 'absolute', left, top, opacity: 0.5 }}>
      {dots}
    </svg>
  )
}

/** 节拍刻度：装饰性节拍条，点亮当前拍 */
export const BeatTicks: React.FC<{
  left: number
  top: number
  count?: number
  gap?: number
  progress: number
  color?: string
}> = ({ left, top, count = 8, gap = 14, progress, color = ACCENT }) => (
  <>
    {new Array(count).fill(0).map((_: unknown, i: number) => {
      const p = Math.max(0, Math.min(1, progress * count - i))
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: left + i * gap,
            top,
            width: 2,
            height: 10 + 10 * p,
            background: i / count < progress ? color : INK,
            opacity: i / count < progress ? 0.9 : 0.16,
          }}
        />
      )
    })}
  </>
)
