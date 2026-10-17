import { INK } from '../theme'
import { FIRM, INOUT, lerp, mulberry32, prog } from '../motion'
import { absDots, concatDots, pairDots } from '../dots'
import type { Painter } from '../dots'
import { WIN, drawBars, drawChrome, drawIcon, drawTitle, winC } from '../scene'

export const SCATTER_START = 60
export const SCATTER_DUR = 24
export const REFORM_START = 84
export const REFORM_DUR = 48

let pairs: { title: ReturnType<typeof pairDots>; sub: ReturnType<typeof pairDots>; offT: Float32Array; offS: Float32Array } | null = null
const offsets = (n: number, seed: number) => {
  const r = mulberry32(seed)
  const o = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = 60 * Math.sqrt(r())
    o[i * 2] = Math.cos(a) * d
    o[i * 2 + 1] = Math.sin(a) * d
  }
  return o
}
export const getPairs = () => {
  if (pairs) return pairs
  const w = winC()
  const title = pairDots(absDots(w.titleEn), absDots(w.titleZh))
  const sub = pairDots(concatDots(w.subEn.map(absDots)), absDots(w.subZh))
  pairs = { title, sub, offT: offsets(title.n, 4101), offS: offsets(sub.n, 4102) }
  return pairs
}

const drawPairs = (p: Painter, u: number, P: ReturnType<typeof pairDots>, off: Float32Array) => {
  const sc = INOUT(prog(u, SCATTER_START, SCATTER_DUR))
  const rf = u >= REFORM_START ? FIRM(u - REFORM_START, REFORM_DUR) : 0
  for (let i = 0; i < P.n; i++) {
    const sx = P.ax[i] + off[i * 2] * sc
    const sy = P.ay[i] + off[i * 2 + 1] * sc
    p.dot(lerp(sx, P.bx[i], rf), lerp(sy, P.by[i], rf), 3.2, INK)
  }
}

/** 镜 4：粒子重组（英文 → 中文） */
export const drawP4 = (p: Painter, f: number) => {
  const u = f - 660
  p.frame(WIN[0], WIN[1], WIN[2], WIN[3], INK)
  drawChrome(p, 1)
  drawIcon(p, 21, 40, 1)
  drawBars(p, [1, 1, 1])
  const P = getPairs()
  drawPairs(p, u, P.title, P.offT)
  drawPairs(p, u, P.sub, P.offS)
  drawTitle(p, 3, f)
}
