import { ACCENT, DIM } from '../theme'
import { INOUT, SETTLE, lerp, prog } from '../motion'
import type { Painter } from '../dots'
import { body, drawTitle } from '../scene'

export const SCAN_START = 30
export const SCAN_DUR = 60
export const SCAN_Y0 = 462
export const SCAN_Y1 = 772
export const MOVE_START = 96

export const scanY = (u: number) => lerp(SCAN_Y0, SCAN_Y1, INOUT(prog(u, SCAN_START, SCAN_DUR)))

/** 镜 2：扫描提取（ACCENT 扫描线自上而下），网址 SETTLE 移到画面正中 */
export const drawP2 = (p: Painter, f: number) => {
  const u = f - 210
  const b = body()
  const ys = scanY(u)
  const scanning = u >= SCAN_START
  const s = SETTLE(u - MOVE_START)
  b.parts.forEach((q, i) => {
    if (q.url) return
    p.dots(b.dots[i], (_x, y) => (scanning && y + 1.6 < ys ? null : DIM))
  })
  // 网址：扫过变 ACCENT，再移到正中
  const ud = b.urlDots
  const tgt = b.urlCenter
  const ux = tgt.ox - b.parts.find((q) => q.url)!.pl.ox
  const uy = tgt.oy - b.parts.find((q) => q.url)!.pl.oy
  const dx = Math.round(ux * s)
  const dy = Math.round(uy * s)
  p.dots(ud, (_x, y) => (scanning && y + 1.6 < ys ? ACCENT : DIM), dx, dy)
  if (u >= SCAN_START && u < SCAN_START + SCAN_DUR + 4) {
    const r = Math.round(ys / 12)
    const cols = [6, 84]
    for (let rr = r - 1; rr <= r + 1; rr++) for (let c = cols[0]; c <= cols[1]; c++) p.cell(c, rr, ACCENT)
  }
  drawTitle(p, 1, f)
}
