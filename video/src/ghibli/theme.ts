export const W = 1080
export const H = 1080
export const FPS = 60
export const TOTAL = 2160
/** 末 120 帧定格：环境动画在此帧停住 */
export const FREEZE = 2040

export const SKY_TOP = '#5FA8D9'
export const SKY_LOW = '#BFE3F2'
export const CLOUD = '#FBF8EE'
export const CLOUD_SH = '#D9D6CC'
export const MEADOW = '#8DBF5A'
export const FOREST = '#3F7A3A'
export const DEEP = '#1F3D2B'
export const PAPER = '#F4EBD3'
export const ACCENT = '#E8602C'

/** 只用调色板颜色做半透明叠加 */
const RGB: Record<string, string> = {
  [SKY_TOP]: '95,168,217',
  [SKY_LOW]: '191,227,242',
  [CLOUD]: '251,248,238',
  [CLOUD_SH]: '217,214,204',
  [MEADOW]: '141,191,90',
  [FOREST]: '63,122,58',
  [DEEP]: '31,61,43',
  [PAPER]: '244,235,211',
  [ACCENT]: '232,96,44',
}
export const a = (hex: string, alpha: number) => `rgba(${RGB[hex]},${alpha})`

export const HAND = '"HanziPen SC","HanziPen TC",cursive'
export const SANS = '"PingFang SC","Hiragino Sans GB",sans-serif'
export const MONO = '"Menlo","SF Mono",monospace'

export const T_TITLE: React.CSSProperties = { fontFamily: HAND, fontWeight: 700, fontSize: 72, letterSpacing: 4, lineHeight: 1 }
export const T_BODY: React.CSSProperties = { fontFamily: SANS, fontWeight: 500, fontSize: 34, letterSpacing: 1, lineHeight: '48px' }
export const T_UI: React.CSSProperties = { fontFamily: SANS, fontWeight: 500, fontSize: 36, letterSpacing: 0, lineHeight: '48px' }
export const T_MONO: React.CSSProperties = { fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: 0, lineHeight: '42px' }
export const T_NUM: React.CSSProperties = { fontFamily: HAND, fontWeight: 700, fontSize: 160, letterSpacing: -2, lineHeight: '144px' }

/** 四角禁区 */
export const CORNER = 180

/** 镜头表起始帧 */
export const SHOT = [0, 210, 450, 690, 930, 1170, 1450, 1690, 1920] as const

export const TITLES: Record<number, string> = {
  3: '先找到链接',
  4: '把网站搬回来',
  5: '换成中文 · 说清用途',
  6: '放到该放的地方',
}

/* ── 窗口几何（屏幕坐标，镜 2/3/8 窗口静止于此） ── */
export const WIN = { x: 110, y: 210, w: 860, bottom: 890 }
export const INPUT_H1 = 104
export const INPUT_H3 = 200

/* 内部流程面板 */
export const PANEL = { x: 40, y: 196, w: 1000, h: 532 }

/* toast（窗口底部，内部镜头保持同一屏幕位置） */
export const TOAST = { x: 160, y: 736, w: 760, h: 140 }
export const CHIP_W = 168
export const CHIP_GAP = 12
export const CHIP_Y = 808
export const CHIP_H = 54
export const chipX = (i: number) => TOAST.x + 24 + i * (CHIP_W + CHIP_GAP)
export const STEPS = ['识别网址', '抓取网页', '翻译精简', '归入分组']
export const STAGE_TEXT = ['识别网址…', '抓取网页…', 'AI 整理中…', '保存中…']

export const PASTE_TEXT_A = '周末想做个手绘风流程图，朋友推荐了这个，链接在这：'
export const URL_TEXT = 'https://excalidraw.com'
export const PASTE_TEXT_B = ' 听说可以多人一起画'

export const ZH_TITLE = 'Excalidraw 手绘风白板'
export const ZH_DESC = '开源手绘风在线白板，用来画流程图、架构图和草图，支持多人实时协作。'
