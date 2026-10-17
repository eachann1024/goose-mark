import { ACCENT, DIM, DOT_OFF, INK, PITCH, SHOT_END, SHOT_FROM, TITLES, TITLE_BASE, TITLE_MAX_W, W } from './theme'
import { IN, OUT, TITLE_IN, TITLE_OUT, clamp01, lerp } from './motion'
import {
  absDots,
  concatDots,
  ICON,
  iconHalf,
  placeCenter,
  placeLeft,
  sampleText,
  type Dots,
  type Painter,
  type Placed,
} from './dots'

/* ───────── 标题 ───────── */

const titleCache = new Map<number, { pl: Placed; maxDist: number; mid: number }>()
const titleOf = (idx: number) => {
  let t = titleCache.get(idx)
  if (t) return t
  const text = TITLES[idx]!
  const sp = sampleText(text, 'H')
  if (sp.w > TITLE_MAX_W) throw new Error(`title too wide: ${text} ${sp.w}`)
  const pl = placeCenter(sp, W / 2, TITLE_BASE)
  const mid = (sp.pad + sp.w / 2) / sp.step
  let maxDist = 0
  for (let i = 0; i < sp.n; i++) maxDist = Math.max(maxDist, Math.abs(sp.gx[i] + 0.5 - mid))
  t = { pl, maxDist, mid }
  titleCache.set(idx, t)
  return t
}

export const drawTitle = (p: Painter, idx: number, f: number, exit = true) => {
  if (!TITLES[idx]) return
  const from = SHOT_FROM[idx]
  const next = idx < SHOT_FROM.length - 1 ? SHOT_FROM[idx + 1] : SHOT_END
  const inS = from + 6
  const outS = next - TITLE_OUT
  if (f < inS) return
  const t = titleOf(idx)
  let r: number
  if (f >= outS && exit) r = t.maxDist * (1 - IN(clamp01((f - outS) / TITLE_OUT)))
  else r = t.maxDist * OUT(clamp01((f - inS) / TITLE_IN))
  if (f >= outS && exit && r <= 0) return
  const settled = f >= inS + TITLE_IN && !(f >= outS && exit)
  p.sprite(t.pl, (x, _y, i) => {
    const d = Math.abs(t.pl.sp.gx[i] + 0.5 - t.mid)
    if (settled) return INK
    if (d > r + 0.001) return null
    return r - d < 2.5 ? DIM : INK
  })
}

/* ───────── 通用 ───────── */

/** 左→右擦入：t=0 全暗，t=1 全亮 */
export const wipe = (x0: number, x1: number, t: number) => (x: number) => x <= x0 + (x1 - x0) * t + 0.001
/** 左→右擦除：t=0 全亮，t=1 全暗 */
export const unwipe = (x0: number, x1: number, t: number) => (x: number) => x > x0 + (x1 - x0) * t

export const spanOf = (pl: Placed) => [pl.ox + pl.sp.pad, pl.ox + pl.sp.pad + pl.sp.w] as const

export type Rect = [number, number, number, number]
export const rectLerp = (a: Rect, b: Rect, t: number): Rect => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
  Math.round(lerp(a[3], b[3], t)),
]
export const WIN: Rect = [18, 34, 72, 70]
export const CARD: Rect = [13, 34, 77, 52]
export const THUMB: Rect = [27, 35, 62, 52]
export const ICON_POS = [21, 40] as const

/* ───────── 镜 1/2 正文 ───────── */

export type BodyPart = { pl: Placed; url: boolean; line: number }
let bodyCache: { parts: BodyPart[]; dots: Dots[]; urlDots: Dots; urlCenter: Placed; lines: { x0: number; x1: number; top: number; bot: number }[] } | null = null

export const BODY_BASE = [520, 596, 672, 748]
export const URL_BASE = 632

export const body = () => {
  if (bodyCache) return bodyCache
  const X = 170
  const rows: [string, string?][] = [
    ['昨天同事推荐我看看这个，说是'],
    ['最近在用的启动器 ', 'raycast.com'],
    ['据说能把搜索、剪贴板和窗口'],
    ['管理都装进一个小工具里面'],
  ]
  const parts: BodyPart[] = []
  const lines: { x0: number; x1: number; top: number; bot: number }[] = []
  rows.forEach((row, k) => {
    const b = sampleText(row[0], 'B')
    const pb = placeLeft(b, X, BODY_BASE[k])
    parts.push({ pl: pb, url: false, line: k })
    let x1 = X + b.w
    if (row[1]) {
      const u = sampleText(row[1], 'U')
      const pu = placeLeft(u, X + b.w, BODY_BASE[k])
      parts.push({ pl: pu, url: true, line: k })
      x1 = X + b.w + u.w
    }
    lines.push({ x0: X, x1, top: BODY_BASE[k] - 44, bot: BODY_BASE[k] + 10 })
  })
  const dots = parts.map((q) => absDots(q.pl))
  const ui = parts.findIndex((q) => q.url)
  const urlSp = parts[ui].pl.sp
  const urlCenter = placeCenter(urlSp, W / 2, URL_BASE)
  bodyCache = { parts, dots, urlDots: dots[ui], urlCenter, lines }
  return bodyCache
}

/* ───────── 浏览器窗口内容 ───────── */

const NUM_OPT = { px: 160, step: 6, dot: 4.8 }
const NUM_BASE = 774
const LABEL_BASE = 832
const numbers = () => {
  const a = sampleText('20', 'N', NUM_OPT)
  const b = sampleText('150', 'N', NUM_OPT)
  const GAP = 120
  const x0 = (W - (a.w + GAP + b.w)) / 2
  const la = sampleText('标题', 'B')
  const lb = sampleText('描述', 'B')
  return {
    n20: placeLeft(a, x0, NUM_BASE),
    n150: placeLeft(b, x0 + a.w + GAP, NUM_BASE),
    l20: placeCenter(la, x0 + a.w / 2, LABEL_BASE),
    l150: placeCenter(lb, x0 + a.w + GAP + b.w / 2, LABEL_BASE),
  }
}

let winCache: ReturnType<typeof buildWin> | null = null
const buildWin = () => {
  const U = (s: string, x: number, b: number) => placeLeft(sampleText(s, 'U'), x, b)
  const B = (s: string, x: number, b: number) => placeLeft(sampleText(s, 'B'), x, b)
  const long = ['一款让你用键盘', '快速启动应用、', '搜索文件、管理', '窗口和剪贴板的', '效率工具，还能', '通过扩展接入服务']
  const desc2 = ['一键启动一切的效率工具', '应用 文件 窗口 剪贴板']
  return {
    titleEn: U('Raycast', 372, 514),
    subEn: [U('Your shortcut', 252, 640), U('to everything', 252, 690)],
    titleZh: B('Raycast', 372, 514),
    subZh: B('一键启动一切的效率工具', 252, 640),
    long: long.map((s, k) => B(s, 372, 566 + 50 * k)),
    titleCard: B('Raycast', 312, 466),
    desc2: desc2.map((s, k) => B(s, 312, 528 + 58 * k)),
    ...numbers(),
  }
}
export const winC = () => (winCache ??= buildWin())

/** 窗口框 + 固定部件。parts 控制各部件擦入进度（0..1） */
export const BAR_ROWS = [60, 63, 66]
export const BAR_LEN = [46, 40, 30]
export const drawChrome = (p: Painter, t: number) => {
  const [c0, r0, c1] = WIN
  const lim = c0 + 1 + (c1 - c0 - 2) * t
  ;[2, 4, 6].forEach((d) => {
    if (c0 + d + 0.5 <= lim) p.cell(c0 + d, r0 + 2, DIM)
  })
  for (let c = c0 + 1; c < c1 - 1; c++) if (c + 0.5 <= lim) p.cell(c, r0 + 4, DIM)
}
export const drawBars = (p: Painter, t: number[]) => {
  BAR_ROWS.forEach((r, k) => {
    const n = Math.round(BAR_LEN[k] * (t[k] ?? 0))
    for (let c = 0; c < n; c++) p.cell(21 + c, r, DIM)
  })
}
export const drawIcon = (p: Painter, c0: number, r0: number, t: number, color = INK) => {
  p.bitmap(ICON, c0, r0, { '#': color }, (x) => t >= 1 || x < t * 8)
}

/* ───────── 缩略卡片 ───────── */

export const THUMB_W = 35 * PITCH
export const THUMB_H = 17 * PITCH
export const drawThumb = (p: Painter, x: number, y: number, content: number) => {
  for (let r = 0; r < 17; r++)
    for (let c = 0; c < 35; c++) {
      const edge = r === 0 || r === 16 || c === 0 || c === 34
      p.cellPx(x + c * PITCH, y + r * PITCH, edge ? INK : DOT_OFF)
    }
  if (content <= 0) return
  const lim = content * 35
  p.bitmapPx(iconHalf, x + 2 * PITCH, y + 2 * PITCH, { '#': INK })
  const bar = (r: number, c0: number, len: number, col: string) => {
    for (let c = 0; c < len; c++) if (c0 + c <= lim) p.cellPx(x + (c0 + c) * PITCH, y + r * PITCH, col)
  }
  bar(3, 8, 12, INK)
  bar(8, 3, 28, DIM)
  bar(10, 3, 22, DIM)
  bar(12, 3, 15, DIM)
}

export { ACCENT, concatDots }
