import { DIM } from '../theme'
import { OUT, prog } from '../motion'
import type { Painter } from '../dots'
import { body, drawTitle } from '../scene'

/** 镜 1：逐列打字点亮 */
export const drawP1 = (p: Painter, f: number) => {
  const b = body()
  b.parts.forEach((q, i) => {
    const L = b.lines[q.line]
    const t = OUT(prog(f, 12 + 38 * q.line, 48))
    const front = L.x0 + t * (L.x1 - L.x0)
    p.dots(b.dots[i], (x) => (x <= front ? DIM : null))
  })
  drawTitle(p, 0, f)
}
