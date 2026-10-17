import { Easing, spring } from 'remotion'
import { FPS } from './theme'

export const OUT = Easing.bezier(0.16, 1, 0.3, 1)
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1)
export const IN = Easing.bezier(0.7, 0, 0.84, 0)

/** damping = 2ζ√(k·m)，k=180，m=1 */
export const DAMP = { SNAP: 14.76, SETTLE: 22.81, FIRM: 26.83 } as const

const spr = (frame: number, damping: number, durationInFrames?: number) => {
  if (frame <= 0) return 0
  const s = spring({ frame, fps: FPS, config: { mass: 1, stiffness: 180, damping }, durationInFrames })
  return Math.abs(s - 1) < 0.003 ? 1 : s
}
export const SNAP = (frame: number) => spr(frame, DAMP.SNAP)
export const SETTLE = (frame: number) => spr(frame, DAMP.SETTLE)
export const FIRM = (frame: number, dur?: number) => spr(frame, DAMP.FIRM, dur)

export const BEAT = 30
export const TITLE_IN = 18
export const TITLE_OUT = 12
export const STAGGER = 0.6

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const prog = (f: number, start: number, dur: number) => clamp01((f - start) / dur)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
