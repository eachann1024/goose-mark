import { Easing, spring } from 'remotion'
import { FPS } from './theme'
import cues from './cues.json'

export const CUES = cues as {
  cursorStart: [number, number]
  moves: { start: number; dur: number; to: [number, number]; bend: number }[]
  clicks: number[]
  keys: number[]
  whoosh: number[]
  chime: number[]
}

/* 三次贝塞尔 */
export const OUT = Easing.bezier(0.22, 1, 0.36, 1)
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1)
export const IN = Easing.bezier(0.64, 0, 0.78, 0)

/* 弹簧：damping = 2ζ√(k·m) */
export const dampingFromRatio = (zeta: number, k: number, m: number) => 2 * zeta * Math.sqrt(k * m)
const SPRINGS = {
  SOFT: { stiffness: 120, mass: 1, zeta: 1.0 },
  BOUNCY: { stiffness: 260, mass: 0.8, zeta: 0.45 },
  FLOAT: { stiffness: 60, mass: 1.2, zeta: 0.3 },
} as const
type SpringName = keyof typeof SPRINGS
export const spr = (name: SpringName, frame: number) => {
  if (frame <= 0) return 0
  const s = SPRINGS[name]
  return spring({
    frame,
    fps: FPS,
    config: { stiffness: s.stiffness, mass: s.mass, damping: dampingFromRatio(s.zeta, s.stiffness, s.mass) },
  })
}
export const SOFT = (f: number) => spr('SOFT', f)
export const BOUNCY = (f: number) => spr('BOUNCY', f)
export const FLOAT = (f: number) => spr('FLOAT', f)

/* 时长 */
export const D = { PRESS: 6, RELEASE: 10, RIPPLE: 24, TYPE: 2, EXPAND: 24, CUT: 24 } as const

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const prog = (f: number, start: number, dur: number) => clamp01((f - start) / dur)
export const lerp = (x: number, y: number, t: number) => x + (y - x) * t
export const ease = (curve: (t: number) => number, f: number, start: number, dur: number) => curve(prog(f, start, dur))

/** 按下 6 帧 → 回弹 10 帧（返回 0..1 的按下深度） */
export const press = (f: number, at: number) => {
  if (f < at || f >= at + D.PRESS + D.RELEASE) return 0
  if (f < at + D.PRESS) return OUT((f - at) / D.PRESS)
  return 1 - BOUNCY(f - at - D.PRESS)
}

/** 弧线鼠标轨迹：二次贝塞尔，控制点沿法线偏移 bend */
export const cursorAt = (f: number): [number, number] => {
  let [x, y] = CUES.cursorStart
  for (const m of CUES.moves) {
    if (f < m.start) break
    const t = INOUT(clamp01((f - m.start) / m.dur))
    const [tx, ty] = m.to
    const mx = (x + tx) / 2
    const my = (y + ty) / 2
    const dx = tx - x
    const dy = ty - y
    const len = Math.hypot(dx, dy) || 1
    const cx = mx + (-dy / len) * m.bend
    const cy = my + (dx / len) * m.bend
    const u = 1 - t
    const nx = u * u * x + 2 * u * t * cx + t * t * tx
    const ny = u * u * y + 2 * u * t * cy + t * t * ty
    x = nx
    y = ny
  }
  return [x, y]
}

/** 固定种子随机 */
export const mulberry32 = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
