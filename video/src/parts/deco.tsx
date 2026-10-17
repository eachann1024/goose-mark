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
