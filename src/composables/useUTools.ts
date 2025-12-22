
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

const getMimeFromPath = (pathOrUrl: string) => {
  const lower = pathOrUrl.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}

const bufferToDataUrl = (buffer: Buffer, mime: string) => {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

const toDataUrlFromRemote = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type')
    const mime = contentType && contentType.includes('/') ? contentType : getMimeFromPath(url)
    return bufferToDataUrl(buffer, mime)
  } catch {
    return null
  }
}

const toDataUrlFromFile = async (filePath: string): Promise<string | null> => {
  try {
    const req = getNodeRequire()
    const fs = req?.('fs')
    if (!fs) return null
    const buf: Buffer = fs.readFileSync(filePath)
    const mime = getMimeFromPath(filePath)
    return bufferToDataUrl(buf, mime)
  } catch {
    return null
  }
}

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
    
    existingCodes.forEach(code => ut.removeFeature!(code))

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
      
      // 优先使用书签设置的图标，否则 fallback 到文字图标
      let iconDataUrl = b.icon?.type === 'remote' && b.icon.src
        ? await toDataUrlFromRemote(b.icon.src)
        : b.icon?.type === 'file' && b.icon.path
          ? await toDataUrlFromFile(b.icon.path)
          : b.icon?.type === 'text'
            ? toDataUrlFromText(b.icon.value || b.title || b.url)
            : null
      
      // fallback: 没有图标时生成文字图标
      if (!iconDataUrl) {
        iconDataUrl = toDataUrlFromText(b.title || b.url)
      }

      if (iconDataUrl) {
        feature.icon = iconDataUrl
        if (overCmd) overCmd.icon = iconDataUrl
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
