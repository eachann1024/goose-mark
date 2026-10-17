import { ACCENT, DIM, INK, W } from '../theme'
import { IN, OUT, SNAP, clamp01, prog } from '../motion'
import { makeBitmap, placeLeft, sampleText } from '../dots'
import type { Bitmap, Painter, Placed } from '../dots'
import { drawTitle } from '../scene'

export const KNOB_START = 90
export const IMPLODE_START = 222
const IMPLODE_DUR = 10
const IMPLODE_SPREAD = 8
const TW = 22
const TH = 8
const KD = 6
const ROWS = [{ r0: 41, base: 556 }, { r0: 54, base: 712 }]
const LABEL_GAP = 72

/** 胶囊外框（边缘）与内部（全部点） */
const inCap = (x: number, y: number) => {
  const cx = Math.min(Math.max(x + 0.5, 4), TW - 4)
  return (x + 0.5 - cx) ** 2 + (y + 0.5 - TH / 2) ** 2 <= 4.05 ** 2
}
const CAP: Bitmap = makeBitmap(TW, TH, (x, y) => (inCap(x, y) ? '#' : '.'))
const CAP_EDGE: Bitmap = makeBitmap(TW, TH, (x, y) =>
  inCap(x, y) && (!inCap(x - 1, y) || !inCap(x + 1, y) || !inCap(x, y - 1) || !inCap(x, y + 1)) ? '#' : '.',
)
const KNOB: Bitmap = makeBitmap(KD, KD, (x, y) => ((x + 0.5 - KD / 2) ** 2 + (y + 0.5 - KD / 2) ** 2 <= 3.1 ** 2 ? '#' : '.'))

let cache: { labels: Placed[]; col: number } | null = null
const get = () => {
  if (cache) return cache
  const s = ['允许新建主分组', '允许新建子分组'].map((t) => sampleText(t, 'B'))
  const lw = Math.max(...s.map((q) => q.w))
  const total = lw + LABEL_GAP + TW * 12
  const x0 = Math.round((W - total) / 2 / 12) * 12
  cache = {
    labels: s.map((sp, k) => placeLeft(sp, x0, ROWS[k].base)),
    col: Math.round((x0 + lw + LABEL_GAP) / 12),
  }
  return cache
}

const drawSwitch = (p: Painter, col: number, r0: number, knobX: number, fill: number, vis: number) => {
  const lim = col + vis * (TW + 1)
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++) {
      if (col + x >= lim || CAP[y][x] === '.') continue
      if (x < Math.round(fill * TW)) p.cell(col + x, r0 + y, ACCENT)
      else if (CAP_EDGE[y][x] === '#') p.cell(col + x, r0 + y, DIM)
    }
  if (vis < 1) return
  p.bitmap(KNOB, col + knobX, r0 + 1, { '#': INK })
}

/** 镜 7：开关拨动；末尾每个亮点沿直线飞向中心（IN，远的先走） */
export const drawP7 = (p: Painter, f: number) => {
  const u = f - 1380
  if (u >= IMPLODE_START) {
    p.xf = (pp, x, y, s) => {
      const cx = x + s / 2
      const cy = y + s / 2
      const d = Math.hypot(cx - 540, cy - 540)
      const delay = IMPLODE_SPREAD * (1 - clamp01(d / 540))
      const t = IN(prog(u, IMPLODE_START + delay, IMPLODE_DUR))
      if (t >= 1) return false
      pp.tx = Math.round(x + (540 - cx) * t)
      pp.ty = Math.round(y + (540 - cy) * t)
      pp.ts = s
      return true
    }
  }
  const { labels, col } = get()
  const wipeT = OUT(prog(u, 12, 24))
  labels.forEach((pl) => {
    const x0 = pl.ox + pl.sp.pad
    p.sprite(pl, (x) => (x <= x0 + wipeT * (pl.sp.w + 4) ? INK : null))
  })
  const vis = OUT(prog(u, 18, 24))
  drawSwitch(p, col, ROWS[0].r0, 1, 0, vis)
  const s = u >= KNOB_START ? SNAP(u - KNOB_START) : 0
  const knob = Math.min(TW - KD - 1, Math.round(1 + (TW - KD - 2) * s))
  drawSwitch(p, col, ROWS[1].r0, knob, Math.min(1, s), vis)
  drawTitle(p, 6, f, false)
  p.xf = null
}
