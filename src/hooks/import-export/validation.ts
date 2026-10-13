import type { IconSource } from '@/types/bookmark'


export const DEFAULT_GROUP_ID = 'g-default'

export const DEFAULT_SUB_ID = 'sg-default'

export const DEFAULT_GROUP_NAME = '默认'

export const DEFAULT_SUB_NAME = '未分类'

export const TRASH_SUB_ID = 'sg-trash'

export const MAX_CATEGORY_DEPTH = 10


export const uid = (prefix = 'id') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}


export const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}


export const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}


export const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}


export const toTs = (value: unknown, fallback: number) => {
  const parsed = asNumber(value)
  // 允许 0 作为合法时间戳（如 Unix epoch），只排除 null、非有限数、负数
  if (parsed === null || !Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed < 1e12 ? Math.round(parsed * 1000) : Math.round(parsed)
}


export const sanitizeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_')


export const isSupportedBookmarkUrl = (url: string): boolean => {
  const value = url.trim()
  if (!value) return false
  if (/^https?:\/\//i.test(value)) return true

  // 明确拒绝其他 scheme（如 file://、javascript: 等）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false

  // 无协议写法：域名/localhost + 可选路径（支持模板变量）
  if (/\s/.test(value)) return false
  if (/^localhost(?::\d+)?(?:\/|$|\?)/i.test(value)) return true
  if (/^(?:[\w-]+\.)+[\w-]{2,}(?::\d+)?(?:\/|$|\?)/i.test(value)) return true
  return false
}


export const sanitizeIcon = (rawIcon: unknown, fallbackText: string): IconSource | undefined => {
  const icon = asObject(rawIcon)
  if (!icon) return undefined

  const type = asNonEmptyString(icon.type)
  if (!type) return undefined

  if (type === 'file') {
    const path = asNonEmptyString(icon.path)
    if (!path) return undefined
    const hash = asNonEmptyString(icon.hash) ?? undefined
    const fetchedAt = asNumber(icon.fetchedAt) ?? undefined
    const bgColor = asNonEmptyString(icon.bgColor) ?? undefined
    return { type: 'file', path, hash, fetchedAt, bgColor }
  }

  if (type === 'remote') {
    const src = asNonEmptyString(icon.src)
    if (!src) return undefined
    const cache = asNonEmptyString(icon.cache) ?? undefined
    const fetchedAt = asNumber(icon.fetchedAt) ?? undefined
    const bgColor = asNonEmptyString(icon.bgColor) ?? undefined
    return { type: 'remote', src, cache, fetchedAt, bgColor }
  }

  if (type === 'custom') {
    const data = asNonEmptyString(icon.data)
    if (!data) return undefined
    const bgColor = asNonEmptyString(icon.bgColor) ?? undefined
    return { type: 'custom', data, bgColor }
  }

  if (type === 'text') {
    const value = asNonEmptyString(icon.value) || asNonEmptyString(icon.text) || fallbackText
    const bgColor = asNonEmptyString(icon.bgColor) ?? undefined
    return { type: 'text', value: value.slice(0, 4), bgColor }
  }

  // 网址精灵 icon.type = image 时，降级为文本图标
  const text = asNonEmptyString(icon.text)
  if (text) {
    return { type: 'text', value: text.slice(0, 4) }
  }

  return undefined
}
