import type { IconSource, Bookmark } from '@/types/bookmark'

const getIconApiBase = () => {
  if (import.meta.env.VITE_SHARE_API_URL) {
    return import.meta.env.VITE_SHARE_API_URL.replace('/api/share', '')
  }
  if (import.meta.env.DEV) {
    return ''
  }
  return ''
}

const ICON_API_URL = getIconApiBase() ? `${getIconApiBase()}/api/icon` : ''
const isDataUrl = (value: string) => value.startsWith('data:image/')
const FAVICON_COOLDOWN_MS = 10 * 60 * 1000
const faviconOriginCooldowns = new Map<string, number>()

const shouldCooldownStatus = (status: number) => status >= 400 && status < 500

const getUrlOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const isOriginInCooldown = (url: string): boolean => {
  const origin = getUrlOrigin(url)
  if (!origin) return false
  const until = faviconOriginCooldowns.get(origin)
  if (!until) return false
  if (until <= Date.now()) {
    faviconOriginCooldowns.delete(origin)
    return false
  }
  return true
}

const markOriginCooldown = (url: string) => {
  const origin = getUrlOrigin(url)
  if (!origin) return
  faviconOriginCooldowns.set(origin, Date.now() + FAVICON_COOLDOWN_MS)
}

const clearOriginCooldown = (url: string) => {
  const origin = getUrlOrigin(url)
  if (!origin) return
  faviconOriginCooldowns.delete(origin)
}

const blobToDataUrl = (blob: Blob): Promise<string | null> => new Promise((resolve) => {
  const reader = new FileReader()
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
  reader.onerror = () => resolve(null)
  reader.readAsDataURL(blob)
})

export const fetchAsDataUrl = async (url: string): Promise<string | null> => {
  if (!url) return null
  if (isOriginInCooldown(url)) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) {
      if (shouldCooldownStatus(response.status)) {
        markOriginCooldown(url)
      }
      return null
    }
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    const dataUrl = await blobToDataUrl(blob)
    if (dataUrl) clearOriginCooldown(url)
    return dataUrl
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const isHtmlDocument = async (url: string): Promise<boolean> => {
  if (!url) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' }
    })
    if (!response.ok) return false
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('text/html') || contentType.includes('application/xhtml+xml')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const buildFaviconUrl = (url: string): string | null => {
  try {
    const target = new URL(url)
    return `${target.origin}/favicon.ico`
  } catch {
    return null
  }
}

const fetchIconDirect = async (url: string): Promise<{ icon: string; cache: string } | null> => {
  const faviconUrl = buildFaviconUrl(url)
  if (!faviconUrl) return null
  const dataUrl = await fetchAsDataUrl(faviconUrl)
  if (!dataUrl) return null
  return { icon: faviconUrl, cache: dataUrl }
}

const textIconFromBookmark = (bookmark: Bookmark): IconSource => {
  const base = bookmark.title.trim() || bookmark.url.trim()
  const text = base ? base.slice(0, 4).toUpperCase() : '•'
  return { type: 'text', value: text }
}

export const iconToDisplayUrl = (icon?: IconSource) => {
  if (!icon) return null
  if (icon.type === 'file') return `file://${icon.path}`
  if (icon.type === 'remote') return icon.cache || icon.src
  if (icon.type === 'custom') return icon.data
  return null
}

const fetchIconFromProxy = async (url: string): Promise<{ icon: string | null; title?: string | null; description?: string | null } | null> => {
  if (!ICON_API_URL) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(`${ICON_API_URL}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    clearTimeout(timer)

    if (!response.ok) return null

    const data = await response.json()
    return {
      icon: data.icon || null,
      title: data.title || null,
      description: data.description || null
    }
  } catch {
    return null
  }
}

const fetchIconFromUToolsBrowser = async (url: string): Promise<{ icon: string; cache: string } | null> => {
  if (isOriginInCooldown(url)) return null
  const utoolsApi = window.utools as unknown as { ubrowser?: any; createBrowserWindow?: any } | undefined
  const ubrowser = utoolsApi?.ubrowser

  if (ubrowser?.goto) {
    try {
      const runner = ubrowser.goto(url)
      if (runner?.wait && runner?.evaluate && runner?.run) {
        const result = await runner.wait(1000).evaluate(() => {
          // 多选择器匹配，优先级从高到低
          const selectors = [
            "link[rel='icon']",
            "link[rel='shortcut icon']",
            "link[rel='apple-touch-icon']",
            "link[rel='fluid-icon']",
            "link[href*='favicon']",
            "link[href*='icon']"
          ]
          let href: string | null = null
          for (const sel of selectors) {
            const link = document.querySelector(sel) as HTMLLinkElement | null
            if (link?.href) {
              href = link.href
              break
            }
          }
          return { href: href || `${location.origin}/favicon.ico` }
        }).run({ width: 800, height: 600, show: false })
        const href = Array.isArray(result) ? (result[0] as { href?: string })?.href : undefined
        const cache = href ? await fetchAsDataUrl(href) : null
        if (href && cache) return { icon: href, cache }
      }
    } catch {}
  }

  const canOpenHtml = await isHtmlDocument(url)
  if (!canOpenHtml) return null

  let browserWindow: { close?: () => void; destroy?: () => void; webContents?: { executeJavaScript?: (code: string) => Promise<unknown> } } | undefined
  try {
    browserWindow = utoolsApi?.createBrowserWindow?.(url, { show: false })
    const exec = browserWindow?.webContents?.executeJavaScript
    if (exec) {
      const payload = await exec(`
        (async () => {
          const selectors = [
            "link[rel='icon']",
            "link[rel='shortcut icon']",
            "link[rel='apple-touch-icon']",
            "link[rel='fluid-icon']",
            "link[href*='favicon']",
            "link[href*='icon']"
          ]
          let href = null
          for (const sel of selectors) {
            const link = document.querySelector(sel)
            if (link?.href) {
              href = link.href
              break
            }
          }
          if (!href) href = location.origin + "/favicon.ico"
          try {
            const res = await fetch(href)
            if (!res.ok) return { href, status: res.status, dataUrl: "" }
            const blob = await res.blob()
            if (!blob.type.startsWith("image/")) return { href, status: 415, dataUrl: "" }
            const reader = new FileReader()
            const dataUrl = await new Promise(resolve => {
              reader.onload = () => resolve(reader.result || "")
              reader.onerror = () => resolve("")
              reader.readAsDataURL(blob)
            })
            return { href, status: res.status, dataUrl }
          } catch {
            return { href, status: 0, dataUrl: "" }
          }
        })()
      `)
      const href = (payload as { href?: string })?.href
      const status = (payload as { status?: number })?.status
      const dataUrl = (payload as { dataUrl?: string })?.dataUrl
      if (href && typeof status === 'number' && shouldCooldownStatus(status)) {
        markOriginCooldown(href)
      }
      if (typeof href === 'string' && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
        clearOriginCooldown(href)
        return { icon: href, cache: dataUrl }
      }
    }
  } catch {}
  finally {
    try {
      browserWindow?.close?.()
    } catch {}
    try {
      browserWindow?.destroy?.()
    } catch {}
  }

  return null
}

/** 获取页面元信息（标题、描述），用于快速保存等场景 */
export const fetchPageMeta = async (url: string): Promise<{ title: string | null; description: string | null }> => {
  if (!url) return { title: null, description: null }

  let targetUrl = url
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl
  }

  try {
    new URL(targetUrl)
  } catch {
    return { title: null, description: null }
  }

  const result = await fetchIconFromProxy(targetUrl)
  return {
    title: result?.title || null,
    description: result?.description || null
  }
}

export const fetchAndCacheIcon = async (url: string, _force = false): Promise<(IconSource & { title?: string | null; description?: string | null }) | null> => {
  if (!url) return null

  let targetUrl = url
  const hasTemplate = /{[^}]+}/.test(url)

  if (hasTemplate) {
    try {
      const temp = url.replace(/{[^}]+}/g, 'x')
      const u = new URL(/^https?:\/\//i.test(temp) ? temp : 'https://' + temp)
      targetUrl = u.origin
    } catch {
      targetUrl = url.replace(/{[^}]+}/g, '')
    }
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl
  }

  try {
    new URL(targetUrl)
  } catch {
    return null
  }

  // uTools 环境优先用内置浏览器获取图标
  if (typeof window !== 'undefined' && window.utools) {
    const utoolsResult = await fetchIconFromUToolsBrowser(targetUrl)
    if (utoolsResult) {
      if (import.meta.env.DEV) {
        console.log('✅ [AG-Verify] uTools Icon Base64:', utoolsResult.cache.substring(0, 50) + '...', 'Len:', utoolsResult.cache.length)
      }
      return {
        type: 'remote',
        src: utoolsResult.icon,
        cache: utoolsResult.cache,
        fetchedAt: Date.now()
      }
    }
  }

  // Web 端直接兜底 favicon
  const direct = await fetchIconDirect(targetUrl)
  if (direct) {
    if (import.meta.env.DEV) {
      console.log('✅ [AG-Verify] Web Icon Base64:', direct.cache?.substring(0, 50) + '...', 'Len:', direct.cache?.length)
    }
    return {
      type: 'remote',
      src: direct.icon,
      cache: direct.cache,
      fetchedAt: Date.now()
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
