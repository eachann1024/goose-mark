
import type { Bookmark } from '@/types/bookmark'

const FEATURE_PREFIX = 'bm_tpl:'

// 图标 base64 缓存
const iconBase64Cache = new Map<string, string>()

// 将远程图片 URL 转换为 base64
const urlToBase64 = async (url: string): Promise<string | null> => {
  if (!url) return null
  
  // 已经是 base64 格式
  if (url.startsWith('data:')) return url
  
  // 检查缓存
  if (iconBase64Cache.has(url)) {
    return iconBase64Cache.get(url)!
  }
  
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        if (base64) iconBase64Cache.set(url, base64)
        resolve(base64 || null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

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

    // 1. 先清理所有旧的 bm_tpl: 特性
    const existingCodes = ut.getFeatures()
      .map(f => f.code)
      .filter(c => typeof c === 'string' && c.startsWith(FEATURE_PREFIX))
    
    existingCodes.forEach(code => ut.removeFeature(code))

    // 2. 筛选并去重（同步处理，避免并发竞争）
    const desired = bookmarks.filter(b => isTemplateBookmark(b) || isUniversalBookmark(b))
    const seenCmd = new Set<string>()
    const unique = desired.filter(b => {
      const cmd = b.title.trim()
      if (!cmd || seenCmd.has(cmd)) return false
      seenCmd.add(cmd)
      return true
    })

    // 3. 串行注册所有特性（确保图标正确设置）
    for (const b of unique) {
      const cmd = b.title.trim()
      const code = `${FEATURE_PREFIX}${b.id}`
      const label = getTemplateLabel(b.url)
      const explain = `搜索：${b.title}${label ? `（${label}）` : ''}`
      
      const cmds: any[] = []
      
      if (b.allowUniversal === true) {
        cmds.push({ 
          type: 'over', 
          label: cmd,
          minLength: 1
        })
      } else {
        cmds.push(cmd)
      }
      
      const feature: { code: string; explain: string; cmds: any[]; icon?: string } = { 
        code, 
        explain, 
        cmds 
      }
      
      // 转换图标为 base64
      if (b.icon) {
        if (b.icon.type === 'remote' && b.icon.src) {
          const base64 = await urlToBase64(b.icon.src)
          if (base64) feature.icon = base64
        } else if (b.icon.type === 'file' && b.icon.path) {
          feature.icon = b.icon.path
        }
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
