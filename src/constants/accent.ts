/**
 * 强调色预设 —— 用户可在设置里切换主操作/选中/链接的强调色。
 * 值为 HSL 三元组（"H S% L%"），注入 --primary / --ring 时用 hsl() 包裹。
 * 'coral' 为默认（与 index.css 的珊瑚一致），选它即不覆盖、走 CSS 默认。
 */
export interface AccentPreset {
  id: string
  name: string
  /** 亮色模式 HSL 三元组 */
  light: string
  /** 暗色模式 HSL 三元组（通常略提亮以保证对比度） */
  dark: string
  /** swatch 预览色（hex，便于选择器渲染） */
  swatch: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'coral',    name: '珊瑚', light: '15 63.1% 59.6%',  dark: '19 67.5% 62.5%', swatch: '#d97757' },
  { id: 'indigo',   name: '靛蓝', light: '243 58% 60%',     dark: '243 70% 72%',    swatch: '#5b6be8' },
  { id: 'emerald',  name: '翡翠', light: '162 63% 41%',     dark: '162 58% 52%',    swatch: '#16a085' },
  { id: 'rose',     name: '玫红', light: '337 72% 56%',     dark: '337 76% 66%',    swatch: '#e0457b' },
  { id: 'amber',    name: '琥珀', light: '36 80% 52%',      dark: '40 84% 60%',     swatch: '#e0922f' },
  { id: 'graphite', name: '石墨', light: '240 4% 46%',      dark: '240 5% 64%',     swatch: '#6b6b73' },
]

const PRESET_MAP = new Map(ACCENT_PRESETS.map(p => [p.id, p]))

export const DEFAULT_ACCENT_ID = 'coral'

export function getAccentPreset(id: string): AccentPreset {
  return PRESET_MAP.get(id) || PRESET_MAP.get(DEFAULT_ACCENT_ID)!
}
