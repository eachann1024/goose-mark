import { ACCENT, DIM, DIM_HI, INK, W } from '../theme'
import { OUT, SETTLE, SNAP, clamp01, prog } from '../motion'
import { placeLeft, sampleText } from '../dots'
import type { Painter, Placed } from '../dots'
import { THUMB, drawThumb, drawTitle } from '../scene'

export const FLIGHT_START = 44
export const LAND = 90

const GAP = 96
const SLOT_COLS = 37
const SLOT_ROWS = 19
const HEAD_BASE = 468
const GROUP_BASE = [468, 636, 804]

let cache: {
  groups: Placed[]
  header: Placed
  ring: [number, number][]
  land: { x: number; y: number }
  conn: [number, number, number]
} | null = null
const get = () => {
  if (cache) return cache
  const o = { px: 56 }
  const names = ['开发', '设计', '阅读']
  const sps = names.map((s) => sampleText(s, 'B', o))
  const leftW = Math.max(...sps.map((s) => s.w))
  const head = sampleText('效率工具 · 新建', 'B', o)
  const rightW = Math.max(SLOT_COLS * 12, head.w)
  const x0 = Math.round((W - (leftW + GAP + rightW)) / 2 / 4) * 4
  const R = Math.round((x0 + leftW + GAP) / 12) * 12
  const c0 = R / 12
  const r0 = 43
  const ring: [number, number][] = []
  const c1 = c0 + SLOT_COLS
  const r1 = r0 + SLOT_ROWS
  for (let c = c0; c < c1; c++) ring.push([c, r0])
  for (let r = r0 + 1; r < r1; r++) ring.push([c1 - 1, r])
  for (let c = c1 - 2; c >= c0; c--) ring.push([c, r1 - 1])
  for (let r = r1 - 2; r > r0; r--) ring.push([c0, r])
  cache = {
    groups: sps.map((sp, k) => placeLeft(sp, x0, GROUP_BASE[k])),
    header: placeLeft(head, R, HEAD_BASE),
    ring,
    land: { x: (c0 + 1) * 12, y: (r0 + 1) * 12 },
    conn: [Math.ceil((x0 + leftW + 24) / 12), c0 - 2, Math.round((HEAD_BASE - 20) / 12)],
  }
  return cache
}
export const THUMB_LAND = () => get().land

/** 镜 6：卡片沿弧线飞入新建的子分组行，落地 SNAP 回弹 */
export const drawP6 = (p: Painter, f: number) => {
  const u = f - 1140
  const g = get()

  g.groups.forEach((pl, k) => {
    const t = OUT(prog(u, 6 + 4 * k, 24))
    const x0 = pl.ox + pl.sp.pad
    p.sprite(pl, (x) => (x <= x0 + t * (pl.sp.w + 4) ? (k === 0 ? INK : DIM_HI) : null))
  })

  // 连接点线 + 新建行（逐行点亮）
  const [a, b, row] = g.conn
  const ct = OUT(prog(u, 50, 24))
  for (let c = a; c <= b; c++) if ((c - a) % 2 === 0 && c <= a + ct * (b - a)) p.cell(c, row, ACCENT)
  const h = g.header
  const rt = OUT(prog(u, 54, 24))
  const top = h.oy + 8
  p.sprite(h, (_x, y) => (y - top <= rt * 72 ? ACCENT : null))

  // 槽位框
  const n = Math.round(OUT(prog(u, 60, 36)) * g.ring.length)
  for (let i = 0; i < n; i++) p.cell(g.ring[i][0], g.ring[i][1], DIM)

  // 缩略卡
  const rx = THUMB[0] * 12
  const ry = THUMB[1] * 12
  let x = rx
  let y = ry
  if (u >= FLIGHT_START) {
    const L = g.land
    const s = SETTLE(u - FLIGHT_START)
    x = rx + (L.x - rx) * s
    const arc = -50 * Math.sin(Math.PI * clamp01(s))
    const hover = u < LAND ? 16 * clamp01(s) : 16 * (1 - SNAP(u - LAND))
    y = ry + (L.y - ry) * s + arc - hover
  }
  drawThumb(p, Math.round(x), Math.round(y), 1)

  drawTitle(p, 5, f)
}
