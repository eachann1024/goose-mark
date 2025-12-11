import type { IconSource, Bookmark } from '@/types/bookmark'

// 文本图标生成
const textIconFromBookmark = (bookmark: Bookmark): IconSource => {
  const base = bookmark.title.trim() || bookmark.url.trim()
  const text = base ? base.slice(0, 4).toUpperCase() : '•'
  return { type: 'text', value: text }
}

export const iconToDisplayUrl = (icon?: IconSource) => {
  if (!icon) return null
  if (icon.type === 'file') return `file://${icon.path}`
  if (icon.type === 'remote') return icon.src
  return null
}

const sampleTopLeftColor = async (url: string): Promise<string | undefined> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const cleanUp = () => {
      img.onload = null
      img.onerror = null
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, 1, 1)
          const data = ctx.getImageData(0, 0, 1, 1).data
          resolve(`rgb(${data[0]}, ${data[1]}, ${data[2]})`)
        } else {
          resolve(undefined)
        }
      } catch {
        resolve(undefined)
      } finally {
        cleanUp()
      }
    }
    img.onerror = () => {
      cleanUp()
      resolve(undefined)
    }
    img.src = url
    if (img.complete) {
      img.onload?.(null as unknown as Event)
    }
  })
}

const attachBgColor = async (icon: IconSource): Promise<IconSource> => {
  if (icon.type === 'remote') {
    const color = await sampleTopLeftColor(icon.src)
    return color ? { ...icon, bgColor: color } : icon
  }
  if (icon.type === 'file') {
    const color = await sampleTopLeftColor(`file://${icon.path}`)
    return color ? { ...icon, bgColor: color } : icon
  }
  return icon
}

/**
 * 从 DuckDuckGo Icons 服务获取图标（主要方案）
 * 快速稳定，适合大多数网站
 */
const fetchIconFromDuckDuckGo = async (host: string): Promise<string | null> => {
  try {
    const ddgUrl = `https://icons.duckduckgo.com/ip3/${host}.ico`
    const response = await fetch(ddgUrl, { method: 'HEAD' })
    if (response.ok) {
      return ddgUrl
    }
    return null
  } catch (e) {
    console.warn('[IconCache] fetchIconFromDuckDuckGo failed:', e)
    return null
  }
}

/**
 * 从网页 HTML 获取图标链接（uTools ubrowser 备选方案）
 * 优先级：apple-touch-icon > SVG > icon/shortcut icon > og:image
 */
const fetchIconFromPage = async (url: string): Promise<string | null> => {
  if (!window.utools?.ubrowser) return null
  
  try {
    const result = await window.utools.ubrowser
      .goto(url)
      .wait(2000)
      .evaluate(() => {
        const icons: { href: string; priority: number; size: number }[] = []
        
        // 1. apple-touch-icon
        document.querySelectorAll<HTMLLinkElement>('link[rel*="apple-touch-icon"]').forEach(link => {
          if (link.href) {
            const sizeMatch = link.sizes?.value?.match(/(\d+)/)
            const size = sizeMatch ? parseInt(sizeMatch[1]) : 180
            icons.push({ href: link.href, priority: 3, size })
          }
        })
        
        // 2. icon / shortcut icon
        document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach(link => {
          if (link.href) {
            const sizeMatch = link.sizes?.value?.match(/(\d+)/)
            const size = sizeMatch ? parseInt(sizeMatch[1]) : 32
            const isSvg = link.href.endsWith('.svg') || link.type === 'image/svg+xml'
            icons.push({ href: link.href, priority: isSvg ? 2.5 : 2, size: isSvg ? 999 : size })
          }
        })
        
        // 3. og:image
        const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content
        if (ogImage) {
          icons.push({ href: ogImage, priority: 1, size: 512 })
        }
        
        icons.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority
          return b.size - a.size
        })
        
        return icons[0]?.href || null
      })
      .run({ width: 1024, height: 768, show: false })
    
    return result && result.length > 0 ? (result[0] as string | null) : null
  } catch (e) {
    console.warn('[IconCache] fetchIconFromPage failed:', e)
    return null
  }
}

/**
 * 获取图标（多策略）
 * 1. DuckDuckGo Icons（快速）
 * 2. uTools ubrowser 解析 HTML（备选）
 */
export const fetchAndCacheIcon = async (url: string, _force = false): Promise<IconSource | null> => {
  if (!url) return null
  
  // 确保 URL 有协议
  let targetUrl = url
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl
  }
  
  let host: string
  try {
    host = new URL(targetUrl).host
  } catch {
    return null
  }
  
  // 策略 1：DuckDuckGo Icons
  const ddgIcon = await fetchIconFromDuckDuckGo(host)
  if (ddgIcon) {
    return attachBgColor({ type: 'remote', src: ddgIcon, fetchedAt: Date.now() })
  }
  
  // 策略 2：uTools ubrowser 解析 HTML
  const pageIcon = await fetchIconFromPage(targetUrl)
  if (pageIcon) {
    return attachBgColor({ type: 'remote', src: pageIcon, fetchedAt: Date.now() })
  }
  
  return null
}

export const ensureIconForBookmark = async (bookmark: Bookmark, force = false): Promise<IconSource | undefined> => {
  if (bookmark.icon && bookmark.icon.type !== 'text' && !force) {
    return bookmark.icon
  }
  
  const fetched = await fetchAndCacheIcon(bookmark.url, force)
  if (fetched) return fetched
  
  return textIconFromBookmark(bookmark)
}

export const bulkMatchMissing = async (bookmarks: Bookmark[]): Promise<Map<string, IconSource>> => {
  const result = new Map<string, IconSource>()
  
  for (const bookmark of bookmarks) {
    if (!bookmark.icon || bookmark.icon.type === 'text') {
      const icon = await fetchAndCacheIcon(bookmark.url)
      if (icon) {
        result.set(bookmark.id, icon)
      }
    }
  }
  
  return result
}
