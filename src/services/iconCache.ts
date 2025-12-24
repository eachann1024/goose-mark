import type { IconSource, Bookmark } from '@/types/bookmark'

type UBrowserApi = {
  goto: (url: string) => {
    wait: (ms: number) => {
      evaluate: <T>(fn: () => T) => {
        run: (opts: { width: number; height: number; show: boolean }) => Promise<T[]>
      }
    }
  }
}

type UToolsIconApi = {
  ubrowser?: UBrowserApi
}

// 检测是否在 uTools 环境
const isUToolsEnv = () => typeof window !== 'undefined' && !!(window as any).utools

// 图标 API 基础地址（从环境变量或默认值获取）
const getIconApiBase = () => {
  const shareApiUrl = import.meta.env.VITE_SHARE_API_URL || 'http://43.142.149.157:3001/api/share'
  return shareApiUrl.replace('/api/share', '')
}

const ICON_API_URL = `${getIconApiBase()}/api/icon`

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

// 默认不自动取色，背景留空，必要时由用户手动选择

/**
 * 从 DuckDuckGo Icons 服务获取图标（回退方案）
 * 快速稳定，适合作为兜底
 * 注意：Web 端浏览器 CORS 限制会阻止此请求，仅在 uTools 环境有效
 */
const fetchIconFromDuckDuckGo = async (host: string): Promise<string | null> => {
  // Web 端跳过，避免 CORS 错误
  if (!isUToolsEnv()) {
    return null
  }

  try {
    const ddgUrl = `https://icons.duckduckgo.com/ip3/${host}.ico`
    const response = await fetch(ddgUrl, { method: 'HEAD' })
    if (response.ok) {
      return ddgUrl
    }
    return null
  } catch (e) {
    // 静默失败，避免控制台噪音
    return null
  }
}

/**
 * 从网页 HTML 获取图标链接（uTools ubrowser 优先方案）
 * 优先级：apple-touch-icon > SVG > icon/shortcut icon > og:image
 * 注意：仅在 uTools 环境有效
 */
const fetchIconFromPage = async (url: string): Promise<string | null> => {
  const utoolsApi = window.utools as unknown as UToolsIconApi | undefined
  if (!utoolsApi?.ubrowser) return null

  try {
    const result = await utoolsApi.ubrowser
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
    // 静默失败，避免控制台噪音
    return null
  }
}

/**
 * 从后端代理获取图标（Web 端专用）
 * 通过后端绕过 CORS 限制，获取 base64 格式的图标数据
 */
const fetchIconFromProxy = async (url: string): Promise<string | null> => {
  // uTools 环境不使用代理
  if (isUToolsEnv()) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)  // 10秒超时，后端需要从外部获取图标

  try {
    const response = await fetch(`${ICON_API_URL}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    clearTimeout(timer)

    if (!response.ok) return null

    const data = await response.json()
    return data.icon || null
  } catch {
    return null
  }
}

/**
 * 获取图标（多策略）
 *
 * uTools 环境：
 *   1. ubrowser 解析 HTML（优先）
 *   2. DuckDuckGo Icons（回退）
 *
 * Web 环境：
 *   1. 后端代理 API
 *   2. 文本图标 fallback
 */
export const fetchAndCacheIcon = async (url: string, _force = false): Promise<IconSource | null> => {
  if (!url) return null

  // 如果包含模板占位符 {xxx}，直接取 Origin，避免参数残留导致页面加载异常或搜索不到
  let targetUrl = url
  const hasTemplate = /{[^}]+}/.test(url)

  if (hasTemplate) {
    try {
      // 临时移除占位符以便解析
      const temp = url.replace(/{[^}]+}/g, 'x')
      const u = new URL(/^https?:\/\//i.test(temp) ? temp : 'https://' + temp)
      targetUrl = u.origin
    } catch {
      targetUrl = url.replace(/{[^}]+}/g, '')
    }
  }

  // 确保 URL 有协议
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl
  }

  let host: string
  try {
    host = new URL(targetUrl).host
  } catch {
    return null
  }

  if (isUToolsEnv()) {
    // uTools 环境：原有策略
    // 策略 1：ubrowser 解析 HTML
    const pageIcon = await fetchIconFromPage(targetUrl)
    if (pageIcon) {
      return { type: 'remote', src: pageIcon, fetchedAt: Date.now() }
    }

    // 策略 2：DuckDuckGo Icons 兜底
    const ddgIcon = await fetchIconFromDuckDuckGo(host)
    if (ddgIcon) {
      return { type: 'remote', src: ddgIcon, fetchedAt: Date.now() }
    }
  } else {
    // Web 环境：使用后端代理 API
    const proxyIcon = await fetchIconFromProxy(targetUrl)
    if (proxyIcon) {
      return { type: 'remote', src: proxyIcon, fetchedAt: Date.now() }
    }
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
