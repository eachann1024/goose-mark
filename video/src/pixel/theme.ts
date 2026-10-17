export const W = 1080
export const H = 1080
export const FPS = 60
export const TOTAL = 1860

export const PITCH = 12
export const CELLS = 90
export const DOT = 8
export const DOT_R = 2

export const BG = '#0B0B0D'
export const DOT_OFF = '#18181C'
export const DIM = '#4A4A52'
export const INK = '#F2EFE6'
export const ACCENT = '#FF5A1F'
/** 仅镜 6 未选中分组用：DIM 与 INK 之间的亮度 */
export const DIM_HI = '#9A9AA4'

/** 四角禁区边长 */
export const CORNER = 200

export type Role = 'H' | 'B' | 'U' | 'N'

const CJK = '"PingFang SC","Hiragino Sans GB","Heiti SC",sans-serif'
const MONO = '"Menlo","SF Mono","Courier New",monospace'

export const FONTS: Record<Role, { family: string; weight: number; size: number; spacing: number; step: number; dot: number }> = {
  H: { family: CJK, weight: 600, size: 100, spacing: 6, step: 4, dot: 4 },
  B: { family: CJK, weight: 500, size: 48, spacing: 3, step: 3, dot: 3 },
  U: { family: MONO, weight: 700, size: 44, spacing: 0, step: 3, dot: 3 },
  N: { family: MONO, weight: 700, size: 260, spacing: -4, step: 8, dot: 6.4 },
}

/** 镜头表 */
export const SHOT_FROM = [0, 210, 420, 660, 900, 1140, 1380, 1620] as const
export const SHOT_END = TOTAL
export const shotIndex = (f: number) => {
  let k = 0
  for (let i = 0; i < SHOT_FROM.length; i++) if (f >= SHOT_FROM[i]) k = i
  return k
}

export const TITLES: (string | null)[] = [
  '丢一段话进来',
  'AI 先找到网址',
  '抓取图标与描述',
  '外语翻成中文',
  '标题短 描述准',
  '放进正确分组',
  '要不要新建 你定',
  null,
]

/** 标题基线（全片统一）；标题 100px 字高约 244–340 */
export const TITLE_BASE = 330
export const TITLE_MAX_W = 888
/** 内容区：标题下 72px 起，到 840 */
export const CONTENT_TOP = 408
export const CONTENT_BOT = 840
