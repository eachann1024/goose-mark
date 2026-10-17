import React from 'react'
import { CLOUD, CLOUD_SH, DEEP, FOREST, H, MEADOW, SKY_LOW, SKY_TOP, W } from './theme'
import { mulberry32 } from './motion'

/** 共享 SVG 滤镜：水彩毛边（固定种子）与纸纹 */
export const Filters: React.FC = () => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      <filter id="wc" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves={3} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="wc3" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={11} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={3} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} result="n" />
        <feColorMatrix
          in="n"
          type="matrix"
          values="0 0 0 0 0.122  0 0 0 0 0.239  0 0 0 0 0.169  1.6 0 0 0 -0.4"
        />
      </filter>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={SKY_TOP} />
        <stop offset="0.62" stopColor={SKY_LOW} />
      </linearGradient>
    </defs>
  </svg>
)

/** 纸纹噪点：全屏固定，opacity 0.06 */
export const Grain: React.FC = () => (
  <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none' }}>
    <rect width={W} height={H} filter="url(#grain)" />
  </svg>
)

type Puff = [number, number, number]
const Cloud: React.FC<{ puffs: Puff[]; x: number; y: number; id: string }> = ({ puffs, x, y, id }) => {
  const bottom = Math.max(...puffs.map((p) => p[1] + p[2] * 0.55))
  return (
    <g transform={`translate(${x.toFixed(2)} ${y})`} filter="url(#wc)">
      {puffs.map(([cx, cy, r], i) => (
        <circle key={`s${i}`} cx={cx} cy={cy} r={r} fill={CLOUD_SH} />
      ))}
      <clipPath id={id}>
        <rect x={-600} y={-600} width={1400} height={600 + bottom - 22} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        {puffs.map(([cx, cy, r], i) => (
          <circle key={`c${i}`} cx={cx - r * 0.08} cy={cy - r * 0.16} r={r * 0.93} fill={CLOUD} />
        ))}
      </g>
    </g>
  )
}

/* 积雨云 */
const TOWER: Puff[] = [
  [0, 0, 70], [-80, 40, 64], [80, 34, 72], [-150, 96, 58], [150, 92, 66], [-40, 90, 82], [50, 100, 86],
  [0, -80, 66], [-50, -40, 58], [56, -46, 60], [10, -150, 56], [-30, -200, 44], [36, -196, 46],
  [-220, 140, 46], [220, 140, 50], [-100, 140, 70], [100, 146, 72], [0, 150, 80],
]
const SMALL_A: Puff[] = [[0, 0, 40], [-50, 16, 32], [52, 12, 36], [-96, 30, 24], [96, 28, 26], [0, 24, 42]]
const SMALL_B: Puff[] = [[0, 0, 30], [-40, 12, 24], [42, 10, 28], [0, 18, 32], [-72, 22, 18], [78, 20, 20]]

/* 樟树树冠：多层圆团 */
const CANOPY: Puff[] = (() => {
  const r = mulberry32(42)
  const out: Puff[] = []
  for (let i = 0; i < 26; i++) {
    const ang = r() * Math.PI
    const rad = 60 + r() * 130
    out.push([Math.cos(ang) * rad * 1.35, -Math.sin(ang) * rad * 0.9 + 40, 44 + r() * 34])
  }
  out.push([0, -40, 110], [-120, 10, 80], [120, 14, 84])
  return out
})()

/** 草叶：固定位置，低频正弦摆动 */
const BLADES = (() => {
  const r = mulberry32(99)
  const out: { x: number; y: number; h: number; lean: number; ph: number }[] = []
  for (let i = 0; i < 70; i++) {
    const x = r() * W
    const y = 930 + r() * 150
    out.push({ x, y, h: 26 + r() * 34, lean: (r() - 0.5) * 14, ph: r() * Math.PI * 2 })
  }
  return out
})()

const jit = (seed: number, n: number, amp: number) => {
  const r = mulberry32(seed)
  return Array.from({ length: n }, () => (r() - 0.5) * amp)
}
const J1 = jit(5, 40, 5)

/** 起伏线：固定抖动 */
const ridgePts = (y0: number, amp: number, freq: number, phase: number, seed: number) => {
  const j = jit(seed, 30, 3)
  const pts: string[] = []
  for (let i = 0; i <= 28; i++) {
    const x = -40 + (i / 28) * (W + 80)
    const y = y0 + Math.sin(x * freq + phase) * amp + j[i]
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return pts
}
const ridge = (y0: number, amp: number, freq: number, phase: number, seed: number) =>
  `M -40 ${H + 40} L ${ridgePts(y0, amp, freq, phase, seed).join(' L ')} L ${W + 40} ${H + 40} Z`
const ridgeLine = (y0: number, amp: number, freq: number, phase: number, seed: number) =>
  `M ${ridgePts(y0, amp, freq, phase, seed).join(' L ')}`

const FAR = ridge(600, 16, 0.006, 0.4, 1)
const MID = ridge(650, 12, 0.004, 1.8, 2)
const MID_L = ridgeLine(650, 12, 0.004, 1.8, 2)
const FRONT = ridge(905, 26, 0.005, 2.6, 3)
const FRONT_L = ridgeLine(905, 26, 0.005, 2.6, 3)

/** 稻田：透视条带 */
const Paddies: React.FC = () => {
  const rows = [672, 694, 720, 750, 786, 828, 876]
  return (
    <g filter="url(#wc3)">
      {rows.slice(0, -1).map((y, i) => (
        <path
          key={i}
          d={`M -40 ${y + J1[i]} L ${W + 40} ${y + J1[i + 7]} L ${W + 40} ${rows[i + 1] + J1[i + 8]} L -40 ${rows[i + 1] + J1[i + 1]} Z`}
          fill={i % 2 ? MEADOW : FOREST}
          opacity={i % 2 ? 1 : 0.55}
        />
      ))}
      {rows.map((y, i) => (
        <path key={`l${i}`} d={`M -40 ${y + J1[i]} L ${W + 40} ${y + J1[i + 7]}`} stroke={DEEP} strokeWidth={2.5} opacity={0.5} />
      ))}
      {[180, 420, 660, 900].map((x, i) => (
        <path key={`v${i}`} d={`M ${540 + (x - 540) * 0.35} 672 L ${540 + (x - 540) * 1.6} 876`} stroke={DEEP} strokeWidth={2.5} opacity={0.35} />
      ))}
      {[[240, 760, 90], [700, 740, 120], [860, 812, 80], [380, 846, 110]].map(([x, y, w], i) => (
        <rect key={`g${i}`} x={x} y={y} width={w} height={5} rx={2.5} fill={SKY_LOW} opacity={0.8} />
      ))}
    </g>
  )
}

export const Landscape: React.FC<{ t: number; front?: boolean }> = ({ t }) => {
  const drift = t * 0.15
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      <rect width={W} height={H} fill="url(#sky)" />
      <Cloud id="c1" puffs={TOWER} x={760 + drift} y={300} />
      <Cloud id="c2" puffs={SMALL_A} x={180 + drift} y={150} />
      <Cloud id="c3" puffs={SMALL_B} x={470 + drift} y={96} />
      <Cloud id="c4" puffs={SMALL_B} x={-60 + drift} y={420} />
      <g filter="url(#wc)">
        <path d={FAR} fill={FOREST} opacity={0.42} />
      </g>
      {/* 樟树 */}
      <g transform="translate(300 470)" filter="url(#wc)">
        <path d="M -26 190 C -20 120 -14 80 -8 30 L 10 30 C 16 80 22 130 34 190 Z" fill={DEEP} />
        <path d="M -8 70 C -40 40 -70 30 -100 20 M 8 60 C 40 36 80 30 110 24" stroke={DEEP} strokeWidth={10} fill="none" strokeLinecap="round" />
        {CANOPY.map(([x, y, r], i) => (
          <circle key={`o${i}`} cx={x} cy={y} r={r + 3} fill={DEEP} />
        ))}
        {CANOPY.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={FOREST} />
        ))}
        {CANOPY.filter((_, i) => i % 3 === 0).map(([x, y, r], i) => (
          <circle key={`h${i}`} cx={x - r * 0.25} cy={y - r * 0.3} r={r * 0.5} fill={MEADOW} opacity={0.55} />
        ))}
      </g>
      <g filter="url(#wc)">
        <path d={MID} fill={MEADOW} />
        <path d={MID_L} stroke={DEEP} strokeWidth={2.5} fill="none" opacity={0.7} />
      </g>
      <Paddies />
    </svg>
  )
}

/** 前景草坡（独立图层，可压在窗口之上） */
export const FrontSlope: React.FC<{ t: number }> = ({ t }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
    <g filter="url(#wc)">
      <path d={FRONT} fill={MEADOW} />
      <path d={ridge(990, 20, 0.007, 0.9, 4)} fill={FOREST} opacity={0.45} />
      <path d={FRONT_L} stroke={DEEP} strokeWidth={3} fill="none" />
    </g>
    <g stroke={DEEP} strokeWidth={2.5} strokeLinecap="round" fill="none">
      {BLADES.map((b, i) => {
        const sway = Math.sin(t * 0.035 + b.ph) * 5
        const tipX = b.x + b.lean + sway
        return <path key={i} d={`M ${b.x.toFixed(1)} ${b.y.toFixed(1)} Q ${(b.x + b.lean * 0.3).toFixed(1)} ${(b.y - b.h * 0.6).toFixed(1)} ${tipX.toFixed(1)} ${(b.y - b.h).toFixed(1)}`} opacity={0.75} />
      })}
    </g>
  </svg>
)
