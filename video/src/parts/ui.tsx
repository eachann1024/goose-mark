import React from 'react'
import { ACCENT, FAINT, HAIRLINE, INK, PAPER, SANS } from '../theme'

/** 纸面卡片：无渐变、无玻璃、无重投影 */
export const Paper: React.FC<{
  children?: React.ReactNode
  style?: React.CSSProperties
  radius?: number
  bg?: string
  border?: string
  borderWidth?: number
}> = ({ children, style, radius = 22, bg = PAPER, border = HAIRLINE, borderWidth = 1 }) => (
  <div
    style={{
      position: 'absolute',
      background: bg,
      border: `${borderWidth}px solid ${border}`,
      borderRadius: radius,
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
)

/** 细线 */
export const Rule: React.FC<{ left: number; top: number; width: number; color?: string; height?: number; opacity?: number }> = ({
  left,
  top,
  width,
  color = INK,
  height = 1,
  opacity = 0.15,
}) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width,
      height,
      background: color,
      opacity,
    }}
  />
)

/** 强调色勾选：落位弹簧 + 2° 过冲 */
export const Check: React.FC<{
  size?: number
  top?: number
  left?: number
  progress: number
  color?: string
  strokeWidth?: number
}> = ({ size = 44, top = 0, left = 0, progress, color = ACCENT, strokeWidth = 6 }) => {
  const draw = Math.max(0, Math.min(1, progress / 0.55))
  const land = Math.max(0, Math.min(1.2, (progress - 0.25) / 0.75))
  const len = 42
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={{
        position: 'absolute',
        top,
        left,
        overflow: 'visible',
        transform: `rotate(${(1 - land) * -14}deg) scale(${0.7 + Math.min(1.06, land) * 0.3})`,
        transformOrigin: '50% 50%',
      }}
    >
      <path
        d="M11 25.5 L20.5 35 L37 14"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - draw)}
      />
    </svg>
  )
}

/** 印章：落位时 2° 过冲 */
export const Seal: React.FC<{
  text: string
  progress: number
  top: number
  left: number
  size?: number
  color?: string
  ink?: string
}> = ({ text, progress, top, left, size = 132, color = ACCENT, ink = ACCENT }) => {
  const p = Math.max(0, Math.min(1.15, progress))
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        borderRadius: size * 0.16,
        border: `${Math.max(3, size * 0.035)}px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ink,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: size * 0.42,
        letterSpacing: '0.02em',
        transform: `rotate(${-8 + p * 8 - (p > 1 ? (p - 1) * 9 : 0)}deg) scale(${0.86 + p * 0.14})`,
        opacity: Math.min(1, p * 4),
        transformOrigin: '50% 50%',
      }}
    >
      {text}
    </div>
  )
}

/** 设置开关 */
export const Toggle: React.FC<{ on: boolean; left: number; top: number; dark?: boolean }> = ({ on, left, top, dark }) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width: 74,
      height: 42,
      borderRadius: 21,
      background: on ? ACCENT : 'transparent',
      border: `2px solid ${on ? ACCENT : dark ? 'rgba(251,250,246,0.4)' : FAINT}`,
      boxSizing: 'border-box',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 4,
        left: on ? 74 - 2 - 30 - 4 : 4,
        width: 30,
        height: 30,
        borderRadius: 15,
        background: on ? '#FFFFFF' : dark ? 'rgba(251,250,246,0.6)' : 'rgba(22,21,18,0.35)',
      }}
    />
  </div>
)
