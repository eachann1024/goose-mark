import { ACCENT, INK } from '../theme'
import { INOUT, OUT, SETTLE, lerp, prog } from '../motion'
import { ICON } from '../dots'
import type { Painter } from '../dots'
import { WIN, body, drawBars, drawChrome, drawIcon, drawTitle, spanOf, unwipe, winC, wipe } from '../scene'

export const COLLAPSE_START = 6
export const COLLAPSE_DUR = 24
export const EXPAND_START = 30

/** 镜 3：网址收成横线 → SETTLE 展开为浏览器窗口，内容依次出现 */
export const drawP3 = (p: Painter, f: number) => {
  const u = f - 420
  const b = body()
  const w = winC()
  const base = b.parts.find((q) => q.url)!
  const tgt = b.urlCenter
  void base
  const urlD = (() => {
    // 居中后的网址点
    const d = b.urlDots
    const ox = tgt.ox - base.pl.ox
    const oy = tgt.oy - base.pl.oy
    const x = new Float32Array(d.n)
    const y = new Float32Array(d.n)
    for (let i = 0; i < d.n; i++) {
      x[i] = d.x[i] + ox
      y[i] = d.y[i] + oy
    }
    return { x, y, n: d.n, size: d.size, order: d.order }
  })()

  if (u < EXPAND_START) {
    const t = INOUT(prog(u, COLLAPSE_START, COLLAPSE_DUR))
    const lineY = 51 * 12 + 6 - urlD.size / 2
    const x0 = WIN[0] * 12 + 2
    const span = (WIN[2] - WIN[0]) * 12 - 4
    // 按 x 序均匀分布到整条线上
    const ord = new Int32Array(urlD.n)
    const idx = Array.from({ length: urlD.n }, (_, i) => i).sort((a, c) => urlD.x[a] - urlD.x[c])
    idx.forEach((v, r) => (ord[v] = r))
    for (let i = 0; i < urlD.n; i++) {
      const tx = x0 + (ord[i] / (urlD.n - 1)) * span
      p.dot(lerp(urlD.x[i], tx, t), lerp(urlD.y[i], lineY, t), urlD.size, ACCENT)
    }
  } else {
    const s = SETTLE(u - EXPAND_START)
    const [c0, r0, c1, r1] = WIN
    const totalH = r1 - r0
    const h = Math.max(1, Math.min(totalH, Math.round(1 + (totalH - 1) * s)))
    const rt = 51 - Math.floor((h - 1) / 2)
    const rb = rt + h
    p.frame(c0, rt, c1, rb, s < 0.55 ? ACCENT : INK)
    if (h === 1) for (let c = c0; c < c1; c++) p.cell(c, rt, ACCENT)
    // 内容依次出现
    const t = (start: number) => OUT(prog(u, start, 20))
    {
      drawChrome(p, t(62))
      drawIcon(p, 21, 40, t(70))
      const te = t(80)
      const [a0, a1] = spanOf(w.titleEn)
      p.sprite(w.titleEn, (x) => (wipe(a0, a1, te)(x) ? INK : null))
      const st = t(90)
      w.subEn.forEach((pl) => {
        const [s0, s1] = spanOf(pl)
        p.sprite(pl, (x) => (wipe(s0, s1, st)(x) ? INK : null))
      })
      drawBars(p, [t(100), t(108), t(116)])
    }
  }
  void unwipe
  void ICON
  drawTitle(p, 2, f)
}
