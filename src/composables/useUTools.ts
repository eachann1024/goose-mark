
import type { Bookmark } from '@/types/bookmark'

const FEATURE_PREFIX = 'bm_tpl:'

type OverCmd = { type: 'over'; label: string; minLength?: number; icon?: string }
type FeatureCmd = string | OverCmd
type UToolsFeature = { code: string; explain: string; cmds: FeatureCmd[]; icon?: string }

type NativeImage = { isEmpty(): boolean; toPNG(): Buffer }
type ElectronModule = { nativeImage?: { createFromBuffer(buffer: Buffer): NativeImage } }

const getNodeRequire = () => (window as unknown as { require?: NodeRequire }).require

const toPngBuffer = (buffer: Buffer): Buffer | null => {
  try {
    const req = getNodeRequire()
    const electron = req?.('electron') as unknown as ElectronModule | undefined
    const nativeImage = electron?.nativeImage
    if (!nativeImage) return null
    const image = nativeImage.createFromBuffer(buffer)
    if (image.isEmpty()) return null
    return image.toPNG()
  } catch {
    return null
  }
}

const getFileExt = (pathOrUrl: string) => {
  const lower = pathOrUrl.toLowerCase()
  if (lower.endsWith('.png')) return '.png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '.jpg'
  if (lower.endsWith('.ico')) return '.ico'
  if (lower.endsWith('.svg')) return '.svg'
  return ''
}

// 获取图标保存目录
const getIconDir = (): string | null => {
  try {
    const ut = window.utools
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
    const fs = (window as unknown as { require?: NodeRequire }).require?.('fs')
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
    const req = (window as unknown as { require?: NodeRequire }).require
    const fs = req?.('fs')
    const path = req?.('path')
    if (!fs || !path) return null
    
    const pngPath = path.join(iconDir, `${bookmarkId}.png`)
    if (fs.existsSync(pngPath)) return pngPath
    
    // 下载图标
    const response = await fetch(url)
    if (!response.ok) return null
    
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const pngBuffer = toPngBuffer(buffer)
    if (pngBuffer) {
      fs.writeFileSync(pngPath, pngBuffer)
      return pngPath
    }

    const ext = getFileExt(url) || '.png'
    const rawPath = path.join(iconDir, `${bookmarkId}${ext}`)
    fs.writeFileSync(rawPath, buffer)
    return rawPath
  } catch {
    return null
  }
}

const saveFileIconToLocal = async (filePath: string, bookmarkId: string): Promise<string | null> => {
  const iconDir = getIconDir()
  if (!iconDir) return null
  if (!ensureDir(iconDir)) return null

  try {
    const req = getNodeRequire()
    const fs = req?.('fs')
    const path = req?.('path')
    if (!fs || !path) return null

    const pngPath = path.join(iconDir, `${bookmarkId}.png`)
    if (fs.existsSync(pngPath)) return pngPath

    const buf: Buffer = fs.readFileSync(filePath)
    if (filePath.toLowerCase().endsWith('.png')) {
      fs.writeFileSync(pngPath, buf)
      return pngPath
    }

    const pngBuffer = toPngBuffer(buf)
    if (pngBuffer) {
      fs.writeFileSync(pngPath, pngBuffer)
      return pngPath
    }

    const ext = getFileExt(filePath) || '.png'
    const rawPath = path.join(iconDir, `${bookmarkId}${ext}`)
    fs.writeFileSync(rawPath, buf)
    return rawPath
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
      
      const iconPath = b.icon?.type === 'remote' && b.icon.src
        ? await saveIconToLocal(b.icon.src, b.id)
        : b.icon?.type === 'file' && b.icon.path
          ? await saveFileIconToLocal(b.icon.path, b.id)
          : null

      if (iconPath) {
        feature.icon = iconPath
        if (overCmd) overCmd.icon = iconPath
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
