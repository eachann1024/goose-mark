import type { IconSource, Bookmark } from '@/types/bookmark'

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
  if (icon.type === 'custom') return icon.data
  return null
}

const fetchIconFromProxy = async (url: string): Promise<{ icon: string | null; title?: string | null; description?: string | null } | null> => {
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

  // 通过 proxy 获取图标和元信息
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
    // 即使没有图标，也返回元信息
    return {
      type: 'remote',
      src: '',
      fetchedAt: Date.now(),
      title: result.title,
      description: result.description
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
