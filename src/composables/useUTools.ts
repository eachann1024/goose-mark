
import type { Bookmark } from '@/types/bookmark'

const FEATURE_PREFIX = 'bm_tpl:'

// 获取图标保存目录
const getIconDir = (): string | null => {
  try {
    const ut = window.utools as any
    if (!ut?.getPath) return null
    const userData = ut.getPath('userData')
    if (!userData) return null
    return `${userData}/bookmark-icons`
  } catch {
    return null
  }
}

// 确保目录存在
const ensureDir = (dir: string): boolean => {
  try {
    const fs = (window as any).require?.('fs')
    if (!fs) return false
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return true
  } catch {
    return false
  }
}

// 下载图标并保存为本地文件
const saveIconToLocal = async (url: string, bookmarkId: string): Promise<string | null> => {
  if (!url) return null
  
  const iconDir = getIconDir()
  if (!iconDir) return null
  if (!ensureDir(iconDir)) return null
  
  try {
    const fs = (window as any).require?.('fs')
    const path = (window as any).require?.('path')
    if (!fs || !path) return null
    
    // 确定文件扩展名
    let ext = '.png'
    if (url.includes('.ico')) ext = '.ico'
    else if (url.includes('.svg')) ext = '.svg'
    else if (url.includes('.jpg') || url.includes('.jpeg')) ext = '.jpg'
    
    const iconPath = path.join(iconDir, `${bookmarkId}${ext}`)
    
    // 如果文件已存在，直接返回路径
    if (fs.existsSync(iconPath)) {
      return iconPath
    }
    
    // 下载图标
    const response = await fetch(url)
    if (!response.ok) return null
    
    const buffer = await response.arrayBuffer()
    fs.writeFileSync(iconPath, Buffer.from(buffer))
    
    return iconPath
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

    // 2. 筛选并去重
    const desired = bookmarks.filter(b => isTemplateBookmark(b) || isUniversalBookmark(b))
    const seenCmd = new Set<string>()
    const unique = desired.filter(b => {
      const cmd = b.title.trim()
      if (!cmd || seenCmd.has(cmd)) return false
      seenCmd.add(cmd)
      return true
    })

    // 3. 串行注册所有特性
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
      
      // 保存图标为本地文件
      if (b.icon && b.icon.type === 'remote' && b.icon.src) {
        const iconPath = await saveIconToLocal(b.icon.src, b.id)
        if (iconPath) feature.icon = iconPath
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
