export const W = 1080
export const H = 1080
export const M = 96
export const FPS = 60
export const BPM = 120

export const INK = '#161512'
export const PAPER = '#FFFFFF'
export const ACCENT = '#DA4A2B'
export const HAIRLINE = 'rgba(22,21,18,0.15)'
export const SOFT = 'rgba(22,21,18,0.52)'
export const FAINT = 'rgba(22,21,18,0.26)'

export const SANS = '"PingFang SC","Hiragino Sans GB","Heiti SC","Helvetica Neue",Arial,sans-serif'
export const SERIF = '"Songti SC","STSong","Georgia","Times New Roman",serif'
export const MONO = '"Menlo","SF Mono","Courier New",monospace'

/** 底色序列：全部高明度低饱和（L 92–97%），第 6 段为黑场，第 7 段品牌卡 */
export const SCENE_BG = ['#F7F5EF', '#EFF4F1', '#F1F3F8', '#F8F1EC', '#F3F0F5', '#F2F5EC', '#11100E', '#F9F8F3']

export type Shot = { id: number; from: number; len: number; bg: string }

const LENS = [420, 270, 240, 270, 210, 210, 180, 150]

export const SHOTS: Shot[] = LENS.reduce<Shot[]>((acc, len, i) => {
  const from = i === 0 ? 0 : acc[i - 1].from + acc[i - 1].len
  acc.push({ id: i, from, len, bg: SCENE_BG[i] })
  return acc
}, [])

export const TOTAL = SHOTS.reduce((n, s) => n + s.len, 0)

export const stills = SHOTS.map((s) => s.from)
export const midpoint = (s: Shot) => s.from + Math.round(s.len / 2)
export const lastFrame = (s: Shot) => s.from + s.len - 1
