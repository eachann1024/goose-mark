import { ACCENT, DIM, INK } from '../theme'
import { IN, INOUT, OUT, SNAP, lerp, prog } from '../motion'
import { absDots, concatDots, pairDots } from '../dots'
import type { Painter } from '../dots'
import {
  CARD,
  THUMB,
  WIN,
  drawBars,
  drawChrome,
  drawIcon,
  drawThumb,
  drawTitle,
  rectLerp,
  spanOf,
  unwipe,
  winC,
  wipe,
} from '../scene'

export const COMPRESS_START = 48
export const COMPRESS_DUR = 32
export const N20_START = 100
export const N150_START = 130

let pr: { P: ReturnType<typeof pairDots>; minx: number; maxx: number } | null = null
const getPair = () => {
  if (pr) return pr
  const w = winC()
  const A = concatDots(w.long.map(absDots))
  const B = concatDots(w.desc2.map(absDots))
  const P = pairDots(A, B)
  let minx = 1e9
  let maxx = -1e9
  for (let i = 0; i < P.n; i++) {
    minx = Math.min(minx, P.ax[i])
    maxx = Math.max(maxx, P.ax[i])
  }
  pr = { P, minx, maxx }
  return pr
}

/** 镜 5：描述从右向左被压缩成 2 行；ACCENT 数字 SNAP 弹入 */
export const drawP5 = (p: Painter, f: number) => {
  const u = f - 900
  const w = winC()

  // 框：窗口 → 卡片 → 缩略卡
  let rect = WIN
  if (u >= 204) rect = rectLerp(CARD, THUMB, INOUT(prog(u, 204, 24)))
  else if (u >= COMPRESS_START) rect = rectLerp(WIN, CARD, INOUT(prog(u, COMPRESS_START, 40)))
  if (u >= 228) {
    drawThumb(p, THUMB[0] * 12, THUMB[1] * 12, OUT(prog(u, 228, 12)))
  } else {
    p.frame(rect[0], rect[1], rect[2], rect[3], INK)
    const out = IN(prog(u, 192, 12))
    const ct = (x0: number, x1: number) => (u >= 192 ? unwipe(x0, x1, out) : () => true)

    // 窗口部件的退出
    if (u < 48) {
      drawChrome(p, u < 36 ? 1 : 1 - IN(prog(u, 36, 12)))
      const t = 1 - IN(prog(u, 0, 12))
      if (u < 12) {
        const [a0, a1] = spanOf(w.subZh)
        p.sprite(w.subZh, (x) => (unwipe(a0, a1, 1 - t)(x) ? INK : null))
      }
      drawBars(p, [t, t, t])
    }

    // 图标、标题
    const e = INOUT(prog(u, COMPRESS_START, 40))
    const ic = Math.round(lerp(21, 16, e))
    const ir = Math.round(lerp(40, 36, e))
    const iconT = u >= 192 ? 1 - out : 1
    drawIcon(p, ic, ir, iconT)
    const dx = Math.round((w.titleCard.ox - w.titleZh.ox) * e)
    const dy = Math.round((w.titleCard.oy - w.titleZh.oy) * e)
    const [t0, t1] = spanOf(w.titleZh)
    p.sprite({ ...w.titleZh, ox: w.titleZh.ox + dx, oy: w.titleZh.oy + dy }, (x) => (ct(t0 + dx, t1 + dx)(x) ? INK : null))

    // 长描述 / 压缩
    if (u < COMPRESS_START) {
      w.long.forEach((pl, k) => {
        const [a0, a1] = spanOf(pl)
        const t = OUT(prog(u, 8 + 4 * k, 20))
        p.sprite(pl, (x) => (wipe(a0, a1, t)(x) ? INK : null))
      })
    } else {
      const { P, minx, maxx } = getPair()
      const [c0, c1] = [w.desc2[0].ox, w.desc2[0].ox + 560]
      for (let i = 0; i < P.n; i++) {
        const delay = 8 * (1 - (P.ax[i] - minx) / (maxx - minx || 1))
        const t = INOUT(prog(u, COMPRESS_START + delay, COMPRESS_DUR))
        const x = lerp(P.ax[i], P.bx[i], t)
        const y = lerp(P.ay[i], P.by[i], t)
        if (u >= 192 && !unwipe(c0, c1 + 300, out)(x)) continue
        p.dot(x, y, 3, INK)
      }
    }
  }

  // 数字
  const num = (pl: typeof w.n20, lab: typeof w.n20, labCol: string, start: number, from: number) => {
    let s = 0
    let dx = 0
    if (u >= 186) {
      const t = IN(prog(u, 186, 12))
      if (t >= 1) return
      dx = Math.round(from * t)
      s = 1
    } else {
      if (u <= start) return
      s = SNAP(u - start)
      dx = Math.round(from * (1 - s))
    }
    void s
    p.sprite({ ...pl, ox: pl.ox + dx }, ACCENT)
    p.sprite({ ...lab, ox: lab.ox + dx }, labCol)
  }
  num(w.n20, w.l20, INK, N20_START, -340)
  num(w.n150, w.l150, DIM, N150_START, 574)

  drawTitle(p, 4, f)
}
