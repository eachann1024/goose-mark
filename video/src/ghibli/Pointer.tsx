import React from 'react'
import { ACCENT, CLOUD, CLOUD_SH, DEEP, SANS, a } from './theme'
import { CUES, D, OUT, cursorAt, press } from './motion'

/** macOS 白色箭头指针 + 点击涟漪 */
export const Pointer: React.FC<{ f: number; visible: boolean }> = ({ f, visible }) => {
  if (!visible) return null
  const [x, y] = cursorAt(f)
  let p = 0
  for (const c of CUES.clicks) p = Math.max(p, press(f, c))
  const s = 1 - 0.1 * p
  return (
    <>
      {CUES.clicks.map((c) => {
        const u = (f - c) / D.RIPPLE
        if (u < 0 || u > 1) return null
        const e = OUT(u)
        const [cx, cy] = cursorAt(c)
        return (
          <svg key={c} width={140} height={140} style={{ position: 'absolute', left: cx - 70, top: cy - 70, overflow: 'visible' }}>
            <circle cx={70} cy={70} r={10 + 42 * e} fill="none" stroke={ACCENT} strokeWidth={5 - 3 * e} opacity={1 - u} />
            <circle cx={70} cy={70} r={8 * (1 - e)} fill={ACCENT} opacity={1 - u} />
          </svg>
        )
      })}
      <svg
        width={60}
        height={70}
        viewBox="-2 -2 30 35"
        style={{
          position: 'absolute',
          left: x - 4,
          top: y - 4,
          overflow: 'visible',
          transform: `scale(${s})`,
          transformOrigin: '4px 4px',
        }}
      >
        <path d="M 2 2 L 2 25 L 7.6 19.6 L 11.4 28.4 L 15.6 26.6 L 11.8 18 L 19.6 18 Z" fill={a(DEEP, 0.28)} transform="translate(1.4 2)" />
        <path d="M 2 2 L 2 25 L 7.6 19.6 L 11.4 28.4 L 15.6 26.6 L 11.8 18 L 19.6 18 Z" fill={CLOUD} stroke={DEEP} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </>
  )
}

/** 键帽：p 为按下深度 0..1 */
export const Keycap: React.FC<{ label: string; w: number; p: number; style?: React.CSSProperties }> = ({ label, w, p, style }) => {
  return (
    <div style={{ position: 'relative', width: w, height: 120, ...style }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 10,
          width: w,
          height: 108,
          borderRadius: 22,
          background: CLOUD_SH,
          border: `3px solid ${DEEP}`,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translateY(${8 * p}px)`,
          width: w,
          height: 108,
          borderRadius: 22,
          background: CLOUD,
          border: `3px solid ${DEEP}`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 44,
          color: DEEP,
        }}
      >
        {label}
      </div>
    </div>
  )
}
