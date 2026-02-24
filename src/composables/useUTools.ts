import type { Bookmark } from '@/types/bookmark'
import { getTemplateLabel } from '@/lib/utils'

const FEATURE_PREFIX = 'bm_tpl:'

type OverCmd = { type: 'over'; label: string; minLength?: number; icon?: string }
type FeatureCmd = string | OverCmd
type UToolsFeature = { code: string; explain: string; cmds: FeatureCmd[]; icon?: string }

const toSvgDataUrlFromText = (text: string): string => {
  const display = text.trim() ? text.trim().slice(0, 2).toUpperCase() : '•'
  const palette = ['#0f172a', '#1f2937', '#111827', '#0b3d2e', '#3b2f2f']
  const colorIndex = Math.abs([...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % palette.length
  const bg = palette[colorIndex]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="24" fill="${bg}"/>
      <text x="64" y="68" text-anchor="middle" font-size="56" font-weight="700" fill="#fff" font-family="system-ui, -apple-system, sans-serif">${display}</text>
    </svg>
  `
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const toDataUrlFromText = (text: string): string | null => {
  try {
    const canvas = document.createElement('canvas')
    const size = 128
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return toSvgDataUrlFromText(text)

    const palette = ['#0f172a', '#1f2937', '#111827', '#0b3d2e', '#3b2f2f']
    const colorIndex = Math.abs([...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % palette.length
    ctx.fillStyle = palette[colorIndex]
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 56px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const display = text.trim() ? text.trim().slice(0, 2).toUpperCase() : '•'
    ctx.fillText(display, size / 2, size / 2)

    return canvas.toDataURL('image/png')
  } catch {
    return toSvgDataUrlFromText(text)
  }
}

// 全局缓存已处理的书签签名，避免重复处理
const processedBookmarks = new Map<string, string>()

const getIconSignature = (bookmark: Bookmark) => {
  const icon = bookmark.icon
  if (!icon) return ''
  if (icon.type === 'file') return `file:${icon.path || ''}`
  if (icon.type === 'remote') return `remote:${icon.cache || icon.src || ''}`
  if (icon.type === 'custom') return `custom:${icon.data || ''}`
  if (icon.type === 'text') return `text:${icon.value || ''}`
  return ''
}

const fetchIconAsDataUrl = async (url: string): Promise<string | null> => {
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const getFeatureIcon = async (bookmark: Bookmark): Promise<string | null> => {
  const icon = bookmark.icon
  if (icon) {
    if (icon.type === 'custom' && icon.data) return icon.data
    if (icon.type === 'file' && icon.path) return `file://${icon.path}`
    if (icon.type === 'remote') {
      if (icon.cache) return icon.cache
      if (icon.src) {
        const dataUrl = await fetchIconAsDataUrl(icon.src)
        if (dataUrl) {
          icon.cache = dataUrl
          bookmark.iconMatchedAt = Date.now()
          return dataUrl
        }
      }
    }
    if (icon.type === 'text' && icon.value) return toDataUrlFromText(icon.value)
  }
  return toDataUrlFromText(bookmark.title || bookmark.url)
}

const getBookmarkSignature = (bookmark: Bookmark) => {
  const allow = bookmark.allowUniversal ? '1' : '0'
  const title = bookmark.title || ''
  const url = bookmark.url || ''
  const iconSig = getIconSignature(bookmark)
  const iconStatus = `${bookmark.iconMatchedAt || 0}|${bookmark.iconMatchFailedAt || 0}`
  return `${allow}|${title}|${url}|${iconSig}|${iconStatus}`
}

type SyncFeatureOptions = {
  force?: boolean
}

export function useUTools() {
  const isTemplateBookmark = (b: Bookmark) => typeof b.title === 'string'
    && !!b.title.trim()
    && typeof b.url === 'string'
    && /{[^}]+}/.test(b.url)

  const isUniversalBookmark = (b: Bookmark) => !!b.allowUniversal

  const syncFeatures = async (bookmarks: Bookmark[], options: SyncFeatureOptions = {}) => {
    const ut = window.utools
    if (!ut?.setFeature || !ut?.getFeatures || !ut?.removeFeature) return

    // 1. 获取现有特性
    const existingFeatures = ut.getFeatures()
      .filter(f => typeof f.code === 'string' && f.code.startsWith(FEATURE_PREFIX))

    if (options.force) {
      existingFeatures.forEach(f => ut.removeFeature!(f.code))
      processedBookmarks.clear()
    }

    // 2. 筛选并去重当前需要的书签
    const desired = bookmarks.filter(b => isTemplateBookmark(b) || isUniversalBookmark(b))
    const seenCmd = new Set<string>()
    const unique = desired.filter(b => {
      const cmd = b.title.trim()
      if (!cmd || seenCmd.has(cmd)) return false
      seenCmd.add(cmd)
      return true
    })

    // 3. 计算需要删除的特性（存在但不再需要的）
    const currentCodes = new Set(unique.map(b => `${FEATURE_PREFIX}${b.id}`))
    const toRemove = existingFeatures.filter(f => !currentCodes.has(f.code))

    // 4. 删除不再需要的特性，并清理对应的缓存
    toRemove.forEach(f => {
      ut.removeFeature!(f.code)
      const bookmarkId = f.code.slice(FEATURE_PREFIX.length)
      processedBookmarks.delete(bookmarkId)
    })

    // 5. 只处理新增的书签，避免重复处理
    const toProcess = options.force
      ? unique
      : unique.filter(b => processedBookmarks.get(b.id) !== getBookmarkSignature(b))

    // 6. 串行注册新增的特性
    for (const b of toProcess) {
      const cmd = b.title.trim()
      const code = `${FEATURE_PREFIX}${b.id}`
      const label = getTemplateLabel(b.url)
      const explain = `搜索：${b.title}${label ? `（${label}）` : ''}`

      const cmds: FeatureCmd[] = []
      let overCmd: OverCmd | null = null

      if (b.allowUniversal === true) {
        overCmd = { type: 'over', label: cmd, minLength: 1 }
        cmds.push(overCmd)
      } else {
        cmds.push(cmd)
      }

      const feature: UToolsFeature = {
        code,
        explain,
        cmds
      }

      const iconDataUrl = await getFeatureIcon(b)

      if (iconDataUrl) {
        feature.icon = iconDataUrl
        if (overCmd) overCmd.icon = iconDataUrl
      }

      ut.setFeature(feature)
      processedBookmarks.set(b.id, getBookmarkSignature(b))
    }
  }

  const getEnterText = (payload: unknown): string => {
    if (typeof payload === 'string') return payload
    if (!payload || typeof payload !== 'object') return ''
    if ('text' in payload) {
      const text = (payload as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    }
    return ''
  }

  const getWindowType = () => {
    try {
      return window.utools?.getWindowType?.()
    } catch {
      return undefined
    }
  }

  const isDetachedWindowNow = () => {
    const type = getWindowType()
    return type === 'detach' || type === 'browser'
  }

  const setExpendHeight = (height: number) => {
    if (typeof window.utools?.setExpendHeight === 'function') {
      window.utools.setExpendHeight(height)
    }
  }

  return {
    FEATURE_PREFIX,
    syncFeatures,
    getEnterText,
    isDetachedWindowNow,
    setExpendHeight
  }
}
