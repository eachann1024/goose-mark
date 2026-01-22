import type { Bookmark } from '@/types/bookmark'

const FEATURE_PREFIX = 'bm_tpl:'

type OverCmd = { type: 'over'; label: string; minLength?: number; icon?: string }
type FeatureCmd = string | OverCmd
type UToolsFeature = { code: string; explain: string; cmds: FeatureCmd[]; icon?: string }

const toDataUrlFromText = (text: string): string | null => {
  try {
    const canvas = document.createElement('canvas')
    const size = 128
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

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
    return null
  }
}

// 全局缓存已处理的书签ID，避免重复处理
const processedBookmarks = new Set<string>()

export function useUTools() {
  const getTemplateLabel = (url: string) => {
    const label = (url.match(/{([^}]+)}/)?.[1] ?? '').trim()
    return label || '搜索内容'
  }

  const isTemplateBookmark = (b: Bookmark) => typeof b.title === 'string'
    && !!b.title.trim()
    && typeof b.url === 'string'
    && /{[^}]+}/.test(b.url)

  const isUniversalBookmark = (b: Bookmark) => !!b.allowUniversal

  const syncFeatures = async (bookmarks: Bookmark[]) => {
    const ut = window.utools
    if (!ut?.setFeature || !ut?.getFeatures || !ut?.removeFeature) return

    // 1. 获取现有特性
    const existingFeatures = ut.getFeatures()
      .filter(f => typeof f.code === 'string' && f.code.startsWith(FEATURE_PREFIX))

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
    const toProcess = unique.filter(b => !processedBookmarks.has(b.id))

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

      // 统一使用文字图标
      const iconDataUrl = toDataUrlFromText(b.title || b.url)

      if (iconDataUrl) {
        feature.icon = iconDataUrl
        if (overCmd) overCmd.icon = iconDataUrl
        // 标记为已处理
        processedBookmarks.add(b.id)
      }

      ut.setFeature(feature)
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
    getTemplateLabel,
    setExpendHeight
  }
}
