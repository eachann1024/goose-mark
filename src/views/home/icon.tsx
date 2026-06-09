import type { LucideIcon } from 'lucide-react'
import {
  Search, List, LayoutGrid, Plus, Settings, MoonStar, Sun, Trash2, Pin, X,
  ArrowLeft, FileText, Sparkles, WandSparkles, Lightbulb, Check, ExternalLink,
  Globe, Copy, Pencil, Folder, Database, RefreshCw, Info, MessageSquare,
  Upload, Download, Cpu, ChevronDown, Inbox
} from 'lucide-react'

/**
 * 图标助手 —— 把设计稿 app.js 里的 data-lucide="xxx" 名称映射到 lucide-react 组件。
 * 统一给每个图标加上 className="lucide"，匹配 home.css 里 `.goose-home svg.lucide`
 * 的字号/线宽规则（stroke-width 1.75），还原设计稿的图标观感。
 */
const MAP: Record<string, LucideIcon> = {
  search: Search,
  list: List,
  'layout-grid': LayoutGrid,
  plus: Plus,
  settings: Settings,
  'moon-star': MoonStar,
  sun: Sun,
  'trash-2': Trash2,
  pin: Pin,
  x: X,
  'arrow-left': ArrowLeft,
  'file-text': FileText,
  sparkles: Sparkles,
  'wand-sparkles': WandSparkles,
  lightbulb: Lightbulb,
  check: Check,
  'external-link': ExternalLink,
  globe: Globe,
  copy: Copy,
  pencil: Pencil,
  folder: Folder,
  database: Database,
  'refresh-cw': RefreshCw,
  info: Info,
  'message-square': MessageSquare,
  upload: Upload,
  download: Download,
  cpu: Cpu,
  'chevron-down': ChevronDown,
  inbox: Inbox
}

export interface IcoProps {
  name: keyof typeof MAP | string
  className?: string
}

/** 渲染一个 lucide 图标，尺寸继承父级 font-size（width/height = 1em，见 home.css）。 */
export function Ico({ name, className }: IcoProps) {
  const Cmp = MAP[name]
  if (!Cmp) return null
  return <Cmp className={['lucide', className].filter(Boolean).join(' ')} />
}
