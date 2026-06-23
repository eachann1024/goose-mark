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
const ICON_FETCH_TIMEOUT_MS = 4000
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

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = ICON_FETCH_TIMEOUT_MS): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * uTools 端用 Node https/http 下载图片转 base64。
 * 普通网站 favicon 通常不返回 CORS 头，renderer 的 fetch 跨域会被拦（Failed to fetch），
 * 导致缓存补不上、图标只能用远程 URL，切换分组时 <img> 重新挂载就会闪。
 * preload.cjs 暴露了 window.require，Node 环境无 CORS 限制，可直接下载任意站点图标。
 */
const fetchImageViaNode = (url: string, redirectDepth = 0): Promise<string | null> => {
  const req = (window as unknown as { require?: (m: string) => any }).require
  if (typeof req !== 'function' || redirectDepth > 3) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = (v: string | null) => { if (settled) return; settled = true; resolve(v) }
    try {
      const lib = req(url.startsWith('https:') ? 'https' : 'http')
      const { Buffer } = req('buffer')
      const request = lib.get(url, (res: any) => {
        const status = res.statusCode || 0
        const location = res.headers?.location
        // 跟随重定向（favicon 常有 301/302）
        if (status >= 300 && status < 400 && location) {
          res.resume()
          let next: string
          try { next = new URL(location, url).href } catch { finish(null); return }
          if (settled) return
          settled = true
          resolve(fetchImageViaNode(next, redirectDepth + 1))
          return
        }
        if (status !== 200) { res.resume(); finish(null); return }
        const contentType = String(res.headers?.['content-type'] || '')
        if (!contentType.startsWith('image/')) { res.resume(); finish(null); return }
        const chunks: Uint8Array[] = []
        res.on('data', (c: Uint8Array) => chunks.push(c))
        res.on('end', () => finish(`data:${contentType.split(';')[0].trim()};base64,${Buffer.concat(chunks).toString('base64')}`))
        res.on('error', () => finish(null))
      })
      request.on('error', () => finish(null))
      request.setTimeout(ICON_FETCH_TIMEOUT_MS, () => { try { request.destroy() } catch {} finish(null) })
    } catch {
      finish(null)
    }
  })
}

export const fetchAsDataUrl = async (url: string): Promise<string | null> => {
  if (!url) return null
  if (isOriginInCooldown(url)) return null

  // uTools 端走 Node 下载，绕过 renderer 跨域 CORS 限制（renderer fetch 对无 CORS 头的 favicon 必失败，无需回退）
  if (typeof (window as unknown as { require?: unknown }).require === 'function') {
    const viaNode = await fetchImageViaNode(url)
    if (viaNode) clearOriginCooldown(url)
    return viaNode
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS)
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
  const timer = setTimeout(() => controller.abort(), 4000)
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

const buildTextIconValue = (text: string) => {
  const base = text.trim()
  return base ? base.slice(0, 4).toUpperCase() : '•'
}

const textIconFromBookmark = (bookmark: Bookmark): IconSource => {
  const base = bookmark.title.trim() || bookmark.url.trim()
  const text = buildTextIconValue(base)
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
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS)

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

type UToolsBrowserFetchResult = {
  icon: string | null
  cache: string | null
  title?: string | null
  description?: string | null
}

const hasFetchedPageData = (result: UToolsBrowserFetchResult | null | undefined) => {
  if (!result) return false
  return Boolean(result.icon || result.cache || result.title || result.description)
}

const fetchIconFromUToolsBrowser = async (url: string): Promise<UToolsBrowserFetchResult | null> => {
  if (isOriginInCooldown(url)) return null
  const utoolsApi = window.utools as unknown as { ubrowser?: any; createBrowserWindow?: any } | undefined
  const ubrowser = utoolsApi?.ubrowser

  if (ubrowser?.goto) {
    try {
      const runner = ubrowser.goto(url)
      if (runner?.wait && runner?.evaluate && runner?.run) {
        const result = await withTimeout(runner.wait(1000).evaluate(() => {
          const readDescription = () => {
            const candidates = [
              "meta[name='description']",
              "meta[property='og:description']",
              "meta[name='twitter:description']"
            ]
            for (const selector of candidates) {
              const meta = document.querySelector(selector)
              const content = meta?.getAttribute('content')?.trim()
              if (content) return content
            }
            return null
          }

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
          return {
            href: href || `${location.origin}/favicon.ico`,
            title: document.title?.trim() || null,
            description: readDescription()
          }
        }).run({ width: 800, height: 600, show: false }))
        if (!result) return null
        const payload = Array.isArray(result) ? (result[0] as { href?: string; title?: string | null; description?: string | null }) : undefined
        const href = payload?.href || null
        const cache = href ? await fetchAsDataUrl(href) : null
        const fetched = {
          icon: href,
          cache,
          title: payload?.title || null,
          description: payload?.description || null
        }
        if (hasFetchedPageData(fetched)) return fetched
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
      const payload = await withTimeout(exec(`
        (async () => {
          const readDescription = () => {
            const candidates = [
              "meta[name='description']",
              "meta[property='og:description']",
              "meta[name='twitter:description']"
            ]
            for (const selector of candidates) {
              const meta = document.querySelector(selector)
              const content = meta?.getAttribute('content')?.trim()
              if (content) return content
            }
            return null
          }

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
            if (!res.ok) return { href, status: res.status, dataUrl: "", title: document.title?.trim() || null, description: readDescription() }
            const blob = await res.blob()
            if (!blob.type.startsWith("image/")) return { href, status: 415, dataUrl: "", title: document.title?.trim() || null, description: readDescription() }
            const reader = new FileReader()
            const dataUrl = await new Promise(resolve => {
              reader.onload = () => resolve(reader.result || "")
              reader.onerror = () => resolve("")
              reader.readAsDataURL(blob)
            })
            return { href, status: res.status, dataUrl, title: document.title?.trim() || null, description: readDescription() }
          } catch {
            return { href, status: 0, dataUrl: "", title: document.title?.trim() || null, description: readDescription() }
          }
        })()
      `))
      if (!payload) return null
      const href = (payload as { href?: string })?.href
      const status = (payload as { status?: number })?.status
      const dataUrl = (payload as { dataUrl?: string })?.dataUrl
      const title = (payload as { title?: string | null })?.title || null
      const description = (payload as { description?: string | null })?.description || null
      if (href && typeof status === 'number' && shouldCooldownStatus(status)) {
        markOriginCooldown(href)
      }
      if (typeof href === 'string' && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
        clearOriginCooldown(href)
        return { icon: href, cache: dataUrl, title, description }
      }
      const fetched = {
        icon: typeof href === 'string' ? href : null,
        cache: typeof dataUrl === 'string' && dataUrl ? dataUrl : null,
        title,
        description
      }
      if (hasFetchedPageData(fetched)) return fetched
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

  if (typeof window !== 'undefined' && window.utools) {
    const utoolsResult = await fetchIconFromUToolsBrowser(targetUrl)
    if (utoolsResult?.title || utoolsResult?.description) {
      return {
        title: utoolsResult.title || null,
        description: utoolsResult.description || null
      }
    }
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

  let fetchedMeta: { title?: string | null; description?: string | null } = {}

  // uTools 环境优先用内置浏览器获取图标
  if (typeof window !== 'undefined' && window.utools) {
    const utoolsResult = await withTimeout(fetchIconFromUToolsBrowser(targetUrl), 4000)
    if (utoolsResult) {
      fetchedMeta = {
        title: utoolsResult.title || null,
        description: utoolsResult.description || null
      }
      if (import.meta.env.DEV) {
        console.log('✅ [AG-Verify] uTools Icon Base64:', utoolsResult.cache?.substring(0, 50) || 'none', 'Len:', utoolsResult.cache?.length || 0)
      }
      if (utoolsResult.icon && utoolsResult.cache) {
        return {
          type: 'remote',
          src: utoolsResult.icon,
          cache: utoolsResult.cache,
          fetchedAt: Date.now(),
          ...fetchedMeta
        }
      }
    }
  }

  if (fetchedMeta.title || fetchedMeta.description) {
    const fallbackText = fetchedMeta.title || (() => {
      try {
        return new URL(targetUrl).hostname.replace(/^www\./i, '')
      } catch {
        return targetUrl
      }
    })()
    return {
      type: 'text',
      value: buildTextIconValue(fallbackText),
      ...fetchedMeta
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
  const missing = bookmarks.filter((b) => !b.icon || b.icon.type === 'text')
  const CONCURRENCY = 6

  // 并发限制池：每次最多 CONCURRENCY 个并发 fetch
  let index = 0
  const worker = async () => {
    while (index < missing.length) {
      const bookmark = missing[index++]
      const icon = await fetchAndCacheIcon(bookmark.url)
      if (icon) {
        result.set(bookmark.id, icon)
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, missing.length) }, () => worker())
  await Promise.all(workers)

  return result
}

/**
 * 把"已有远程 URL、但还没缓存 base64"的图标抓成本地 base64。
 * 用于一次性回填存量书签与 web 兜底失败的图标，实现"成功一次永久本地化、之后不再联网"。
 * 返回 id -> base64 dataUrl 的映射，由调用方写回 store。
 */
export const backfillRemoteIconCache = async (bookmarks: Bookmark[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>()
  const targets = bookmarks.filter((b) => {
    const icon = b.icon
    return icon?.type === 'remote' && !!icon.src && !(icon.cache && icon.cache.startsWith('data:image/'))
  })
  if (targets.length === 0) return result

  const CONCURRENCY = 6
  let index = 0
  const worker = async () => {
    while (index < targets.length) {
      const bookmark = targets[index++]
      const icon = bookmark.icon as Extract<IconSource, { type: 'remote' }>
      const dataUrl = await fetchAsDataUrl(icon.src)
      if (dataUrl) result.set(bookmark.id, dataUrl)
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker())
  await Promise.all(workers)

  return result
}
