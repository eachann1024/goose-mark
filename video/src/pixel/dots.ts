import { ACCENT, BG, CORNER, DOT, DOT_OFF, DOT_R, FONTS, PITCH, CELLS, W, H, type Role } from './theme'

/* ───────── 文字采样 ───────── */

export type Sprite = {
  gx: Int16Array
  gy: Int16Array
  n: number
  step: number
  dot: number
  /** 文字前进宽度（px） */
  w: number
  /** 左侧留白（px，step 的整数倍） */
  pad: number
  /** 基线所在行（以 step 计） */
  baseRow: number
  cols: number
  rows: number
}

let scratch: HTMLCanvasElement | null = null
const cache = new Map<string, Sprite>()

export type SampleOpts = { px?: number; step?: number; dot?: number }

export const sampleText = (text: string, role: Role, o: SampleOpts = {}): Sprite => {
  const F = FONTS[role]
  const px = o.px ?? F.size
  const step = o.step ?? F.step
  const dot = o.dot ?? F.dot
  const key = `${role}|${text}|${px}|${step}`
  const hit = cache.get(key)
  if (hit) return hit
  if (!scratch) scratch = document.createElement('canvas')
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!
  const font = `${F.weight} ${px}px ${F.family}`
  const spacing = (F.spacing * px) / F.size
  ctx.font = font
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`
  const w = ctx.measureText(text).width
  const pad = step * 2
  const cols = Math.ceil((w + pad * 2) / step)
  const baseline = Math.ceil((px * 1.05) / step) * step
  const rows = Math.ceil((baseline + px * 0.35) / step)
  scratch.width = cols * step
  scratch.height = rows * step
  ctx.font = font
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, pad, baseline)
  const img = ctx.getImageData(0, 0, cols * step, rows * step).data
  const gx: number[] = []
  const gy: number[] = []
  const area = step * step
  const stride = cols * step
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let a = 0
      for (let y = 0; y < step; y++) {
        let idx = ((r * step + y) * stride + c * step) * 4 + 3
        for (let x = 0; x < step; x++, idx += 4) a += img[idx]
      }
      if (a / area / 255 > 0.45) {
        gx.push(c)
        gy.push(r)
      }
    }
  }
  const sp: Sprite = {
    gx: Int16Array.from(gx),
    gy: Int16Array.from(gy),
    n: gx.length,
    step,
    dot,
    w,
    pad,
    baseRow: baseline / step,
    cols,
    rows,
  }
  cache.set(key, sp)
  return sp
}

export type Placed = { sp: Sprite; ox: number; oy: number }

/** 居中放置：x 方向以 cx 居中，基线对齐 baseline，坐标吸附到 step */
export const placeCenter = (sp: Sprite, cx: number, baseline: number): Placed => ({
  sp,
  ox: Math.round((cx - sp.w / 2) / sp.step) * sp.step - sp.pad,
  oy: Math.round(baseline / sp.step) * sp.step - sp.baseRow * sp.step,
})
export const placeLeft = (sp: Sprite, x: number, baseline: number): Placed => ({
  sp,
  ox: Math.round(x / sp.step) * sp.step - sp.pad,
  oy: Math.round(baseline / sp.step) * sp.step - sp.baseRow * sp.step,
})

/** 点的绝对坐标（左上角） */
export type Dots = { x: Float32Array; y: Float32Array; n: number; size: number; order?: Int32Array }
export const absDots = ({ sp, ox, oy }: Placed): Dots => {
  const x = new Float32Array(sp.n)
  const y = new Float32Array(sp.n)
  const off = (sp.step - sp.dot) / 2
  for (let i = 0; i < sp.n; i++) {
    x[i] = ox + sp.gx[i] * sp.step + off
    y[i] = oy + sp.gy[i] * sp.step + off
  }
  return { x, y, n: sp.n, size: sp.dot }
}

export const concatDots = (list: Dots[]): Dots => {
  const n = list.reduce((s, d) => s + d.n, 0)
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  let k = 0
  for (const d of list) {
    x.set(d.x, k)
    y.set(d.y, k)
    k += d.n
  }
  return { x, y, n, size: list[0]?.size ?? 3 }
}

export const sortedOrder = (d: Dots): Int32Array => {
  if (d.order) return d.order
  const idx = Array.from({ length: d.n }, (_, i) => i)
  idx.sort((a, b) => d.x[a] - d.x[b] || d.y[a] - d.y[b])
  d.order = Int32Array.from(idx)
  return d.order
}

/** 按 x 序把 A 的点映射到 B 的点（点数不同时重复/合并） */
export const pairDots = (A: Dots, B: Dots) => {
  const N = Math.max(A.n, B.n)
  const oa = sortedOrder(A)
  const ob = sortedOrder(B)
  const ax = new Float32Array(N)
  const ay = new Float32Array(N)
  const bx = new Float32Array(N)
  const by = new Float32Array(N)
  for (let j = 0; j < N; j++) {
    const a = oa[Math.floor((j * A.n) / N)]
    const b = ob[Math.floor((j * B.n) / N)]
    ax[j] = A.x[a]
    ay[j] = A.y[a]
    bx[j] = B.x[b]
    by[j] = B.y[b]
  }
  return { ax, ay, bx, by, n: N }
}

/* ───────── 位图 ───────── */

/** 行字符串：'.' 熄灭；其他字符见 map */
export type Bitmap = string[]
export const makeBitmap = (w: number, h: number, fn: (x: number, y: number) => string): Bitmap =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => fn(x, y)).join(''))

export const ICON: Bitmap = [
  '..####..',
  '.#....#.',
  '#..##..#',
  '#.####.#',
  '#.####.#',
  '#..##..#',
  '.#....#.',
  '..####..',
]

export const iconHalf: Bitmap = Array.from({ length: 4 }, (_, y) =>
  Array.from({ length: 4 }, (_, x) => {
    const c = [ICON[y * 2][x * 2], ICON[y * 2][x * 2 + 1], ICON[y * 2 + 1][x * 2], ICON[y * 2 + 1][x * 2 + 1]]
    return c.filter((v) => v !== '.').length >= 2 ? '#' : '.'
  }).join(''),
)

/** 32×32 右朝向侧面鹅：# INK，b ACCENT（喙），眼为熄灭点；身体只露上半部分 */
const distSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
const NECK: [number, number][] = [
  [21, 7],
  [16.5, 9],
  [12.5, 12.5],
  [11.5, 17],
  [14.5, 21],
  [19.5, 24],
]
export const GOOSE: Bitmap = makeBitmap(32, 32, (x, y) => {
  const cx = x + 0.5
  const cy = y + 0.5
  // 喙：3 行楔形
  const beak = (y === 5 && x >= 25 && x <= 26) || (y === 6 && x >= 25 && x <= 29) || (y === 7 && x >= 25 && x <= 27)
  if (beak) return 'b'
  // 眼：熄灭点
  if (x === 22 && y === 5) return '.'
  const head = ((cx - 22) / 4.1) ** 2 + ((cy - 6) / 4.1) ** 2 <= 1
  let neck = false
  for (let i = 0; i < NECK.length - 1 && !neck; i++) {
    const k = i / (NECK.length - 2)
    const r = 1.9 + 0.8 * k
    neck = distSeg(cx, cy, NECK[i][0], NECK[i][1], NECK[i + 1][0], NECK[i + 1][1]) <= r
  }
  const body = cy >= 24 && ((cx - 16.5) / 14.5) ** 2 + ((cy - 33.5) / 10) ** 2 <= 1
  return head || neck || body ? '#' : '.'
})

/* ───────── Painter ───────── */

export type Xf = (p: Painter, x: number, y: number, s: number) => boolean

/** 四角裁剪保险：QA 时可临时关闭以检查真实内容 */
export const GUARD = { on: true }

export class Painter {
  clipped = 0
  xf: Xf | null = null
  tx = 0
  ty = 0
  ts = 0
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  begin() {
    const c = this.ctx
    c.fillStyle = BG
    c.fillRect(0, 0, W, H)
    c.fillStyle = DOT_OFF
    c.beginPath()
    for (let r = 0; r < CELLS; r++) for (let q = 0; q < CELLS; q++) c.roundRect(q * PITCH + 2, r * PITCH + 2, DOT, DOT, DOT_R)
    c.fill()
    this.clipped = 0
    this.xf = null
  }

  dot(x: number, y: number, s: number, color: string) {
    if (this.xf) {
      if (!this.xf(this, x, y, s)) return
      x = this.tx
      y = this.ty
      s = this.ts
    }
    if (GUARD.on && color !== DOT_OFF) {
      const x1 = x + s
      const y1 = y + s
      const left = x < CORNER
      const right = x1 > W - CORNER
      const top = y < CORNER
      const bot = y1 > H - CORNER
      if ((left || right) && (top || bot)) {
        this.clipped++
        return
      }
    }
    const c = this.ctx
    c.fillStyle = color
    // 文字像素（≤5px）画成整数对齐的实心方块，避免圆角与抗锯齿发糊
    if (s <= 5) {
      c.fillRect(Math.round(x), Math.round(y), Math.round(s), Math.round(s))
      return
    }
    c.beginPath()
    c.roundRect(x, y, s, s, s * 0.25)
    c.fill()
  }

  cell(cx: number, cy: number, color: string) {
    if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return
    this.dot(cx * PITCH + 2, cy * PITCH + 2, DOT, color)
  }

  /** 以 px 为单位的格子位（可离格） */
  cellPx(x: number, y: number, color: string) {
    this.dot(x + 2, y + 2, DOT, color)
  }

  frame(c0: number, r0: number, c1: number, r1: number, color: string) {
    for (let c = c0; c < c1; c++) {
      this.cell(c, r0, color)
      this.cell(c, r1 - 1, color)
    }
    for (let r = r0 + 1; r < r1 - 1; r++) {
      this.cell(c0, r, color)
      this.cell(c1 - 1, r, color)
    }
  }

  clear(c0: number, r0: number, c1: number, r1: number) {
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) this.cell(c, r, DOT_OFF)
  }

  bitmap(bm: Bitmap, c0: number, r0: number, colors: Record<string, string>, visible?: (c: number, r: number) => boolean) {
    for (let y = 0; y < bm.length; y++)
      for (let x = 0; x < bm[y].length; x++) {
        const ch = bm[y][x]
        if (ch === '.') continue
        if (visible && !visible(x, y)) continue
        this.cell(c0 + x, r0 + y, colors[ch] ?? colors['#'])
      }
  }

  bitmapPx(bm: Bitmap, x0: number, y0: number, colors: Record<string, string>) {
    for (let y = 0; y < bm.length; y++)
      for (let x = 0; x < bm[y].length; x++) {
        const ch = bm[y][x]
        if (ch === '.') continue
        this.cellPx(x0 + x * PITCH, y0 + y * PITCH, colors[ch] ?? colors['#'])
      }
  }

  sprite(pl: Placed, color: string | ((x: number, y: number, i: number) => string | null)) {
    const { sp, ox, oy } = pl
    const off = (sp.step - sp.dot) / 2
    for (let i = 0; i < sp.n; i++) {
      const x = ox + sp.gx[i] * sp.step + off
      const y = oy + sp.gy[i] * sp.step + off
      const c = typeof color === 'string' ? color : color(x, y, i)
      if (c) this.dot(x, y, sp.dot, c)
    }
  }

  dots(d: Dots, color: string | ((x: number, y: number, i: number) => string | null), dx = 0, dy = 0) {
    for (let i = 0; i < d.n; i++) {
      const c = typeof color === 'string' ? color : color(d.x[i], d.y[i], i)
      if (c) this.dot(d.x[i] + dx, d.y[i] + dy, d.size, c)
    }
  }
}

export const lit = (color: string) => color
export { ACCENT }
