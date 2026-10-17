import { ACCENT, INK, W } from '../theme'
import { OUT, SETTLE, lerp, mulberry32, prog } from '../motion'
import { GOOSE, absDots, placeCenter, sampleText } from '../dots'
import type { Painter } from '../dots'

type Logo = { tx: Float32Array; ty: Float32Array; size: Float32Array; color: string[]; bx: Float32Array; by: Float32Array; delay: Float32Array; n: number }
let logo: Logo | null = null

const GOOSE_C0 = 29
const GOOSE_R0 = 19

const build = (): Logo => {
  const tx: number[] = []
  const ty: number[] = []
  const size: number[] = []
  const color: string[] = []
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const ch = GOOSE[y][x]
      if (ch === '.') continue
      tx.push((GOOSE_C0 + x) * 12 + 2)
      ty.push((GOOSE_R0 + y) * 12 + 2)
      size.push(8)
      color.push(ch === 'b' ? ACCENT : INK)
    }
  const push = (d: ReturnType<typeof absDots>, c: string) => {
    for (let i = 0; i < d.n; i++) {
      tx.push(d.x[i])
      ty.push(d.y[i])
      size.push(d.size)
      color.push(c)
    }
  }
  push(absDots(placeCenter(sampleText('鹅的书签', 'H'), W / 2, 744)), INK)
  const o = { px: 56 }
  const ai = sampleText('AI', 'B', o)
  const cj = sampleText(' 创建', 'B', o)
  const left = W / 2 - (ai.w + cj.w) / 2
  const base = placeCenter(ai, 0, 842).oy
  const pa = { sp: ai, ox: Math.round(left / 4) * 4 - ai.pad, oy: base }
  const pc = { sp: cj, ox: Math.round((left + ai.w) / 4) * 4 - cj.pad, oy: base }
  push(absDots(pa), ACCENT)
  push(absDots(pc), INK)

  const n = tx.length
  const r = mulberry32(8080)
  const bx = new Float32Array(n)
  const by = new Float32Array(n)
  const delay = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = 90 + 270 * Math.sqrt(r())
    bx[i] = 540 + Math.cos(a) * d
    by[i] = 540 + Math.sin(a) * d
    delay[i] = r() * 24
  }
  return { tx: Float32Array.from(tx), ty: Float32Array.from(ty), size: Float32Array.from(size), color, bx, by, delay, n }
}

/** 镜 8：中心爆开的点 SETTLE 聚合成标 */
export const drawP8 = (p: Painter, f: number) => {
  const u = f - 1620
  if (u < 1) return
  const L = (logo ??= build())
  const burst = OUT(prog(u, 0, 24))
  for (let i = 0; i < L.n; i++) {
    const s = SETTLE(u - 30 - L.delay[i])
    let x: number
    let y: number
    if (s >= 1) {
      x = L.tx[i]
      y = L.ty[i]
    } else {
      const sx = lerp(540, L.bx[i], burst)
      const sy = lerp(540, L.by[i], burst)
      x = lerp(sx, L.tx[i], s)
      y = lerp(sy, L.ty[i], s)
    }
    p.dot(x, y, L.size[i], L.color[i])
  }
}
