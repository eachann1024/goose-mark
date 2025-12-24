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

const isUToolsEnv = () => typeof window !== 'undefined' && !!(window as any).utools

const getIconApiBase = () => {
  if (import.meta.env.VITE_SHARE_API_URL) {
    return import.meta.env.VITE_SHARE_API_URL.replace('/api/share', '')
  }
  if (import.meta.env.DEV) {
    return '' 
  }
  return 'http://43.142.149.157:3001'
}

const ICON_API_URL = `${getIconApiBase()}/api/icon`

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

const fetchIconFromDuckDuckGo = async (host: string): Promise<string | null> => {
  if (!isUToolsEnv()) return null

  try {
    const ddgUrl = `https://icons.duckduckgo.com/ip3/${host}.ico`
    const response = await fetch(ddgUrl, { method: 'HEAD' })
    if (response.ok) return ddgUrl
    return null
  } catch {
    return null
  }
}

const fetchIconAndMetadataFromPage = async (url: string): Promise<{ icon: string | null; title: string | null; description: string | null } | null> => {
  const utoolsApi = window.utools as unknown as UToolsIconApi | undefined
  if (!utoolsApi?.ubrowser) return null

  try {
    const result = await utoolsApi.ubrowser
      .goto(url)
      .wait(1500)
      .evaluate(() => {
        const metadata = {
          icon: null as string | null,
          title: (document.title || '').trim(),
          description: '' as string | null
        }

        const descTag = document.querySelector<HTMLMetaElement>('meta[name="description"]') || 
                      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')
        metadata.description = descTag?.content?.trim() || ''

        const icons: { href: string; priority: number; size: number }[] = []

        document.querySelectorAll<HTMLLinkElement>('link[rel*="apple-touch-icon"]').forEach(link => {
          if (link.href) {
            const sizeMatch = link.sizes?.value?.match(/(\d+)/)
            const size = sizeMatch ? parseInt(sizeMatch[1]) : 180
            icons.push({ href: link.href, priority: 3, size })
          }
        })

        document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach(link => {
          if (link.href) {
            const sizeMatch = link.sizes?.value?.match(/(\d+)/)
            const size = sizeMatch ? parseInt(sizeMatch[1]) : 32
            const isSvg = link.href.endsWith('.svg') || link.type === 'image/svg+xml'
            icons.push({ href: link.href, priority: isSvg ? 2.5 : 2, size: isSvg ? 999 : size })
          }
        })

        const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content
        if (ogImage) {
          icons.push({ href: ogImage, priority: 1, size: 512 })
        }

        icons.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority
          return b.size - a.size
        })

        metadata.icon = icons[0]?.href || null
        return metadata
      })
      .run({ width: 1024, height: 768, show: false })

    if (result && result.length > 0) {
      const data = result[0] as any
      return {
        icon: data.icon || null,
        title: data.title || null,
        description: data.description || null
      }
    }
    return null
  } catch {
    return null
  }
}

const fetchIconFromProxy = async (url: string): Promise<{ icon: string | null; title?: string | null; description?: string | null } | null> => {
  if (isUToolsEnv()) return null

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

  let host: string
  try {
    host = new URL(targetUrl).host
  } catch {
    return null
  }

  if (isUToolsEnv()) {
    const pageResult = await fetchIconAndMetadataFromPage(targetUrl)
    if (pageResult) {
      return { 
        type: 'remote', 
        src: pageResult.icon || '', 
        fetchedAt: Date.now(),
        title: pageResult.title,
        description: pageResult.description
      }
    }

    const ddgIcon = await fetchIconFromDuckDuckGo(host)
    if (ddgIcon) {
      return { type: 'remote', src: ddgIcon, fetchedAt: Date.now() }
    }
  } else {
    const result = await fetchIconFromProxy(targetUrl)
    if (result && result.icon) {
      return { 
        type: 'remote', 
        src: result.icon, 
        fetchedAt: Date.now(),
        title: result.title,
        description: result.description
      }
    } else if (result) {
       return {
         type: 'remote',
         src: '', 
         fetchedAt: Date.now(),
         title: result.title,
         description: result.description
       }
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
