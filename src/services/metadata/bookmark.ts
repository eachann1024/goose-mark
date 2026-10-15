import type { IconSource } from '@/types/bookmark'
import { fetchAndCacheIcon } from '@/services/iconCache'
import { fetchMetadataFromNetwork, isLoginOrAccessWallText } from '@/services/metadataFallback'
import { metadataEvidence } from './evidence'

export async function readBookmarkPage(url: string) {
  let pageTitle = ''
  let pageDesc = ''
  let icon: IconSource | null = null
  try {
    const fetched = await fetchAndCacheIcon(url, true)
    pageTitle = typeof fetched?.title === 'string' ? fetched.title.trim() : ''
    pageDesc = typeof fetched?.description === 'string' ? fetched.description.trim() : ''
    if (pageTitle && (!metadataEvidence({ url, title: pageTitle }).title || isLoginOrAccessWallText(pageTitle))) {
      pageTitle = ''
    }
    if (pageDesc && isLoginOrAccessWallText(pageDesc)) pageDesc = ''
    if (fetched) {
      const next: Record<string, unknown> = { type: fetched.type }
      if ('src' in fetched && fetched.src) next.src = fetched.src
      if ('path' in fetched && fetched.path) next.path = fetched.path
      if ('value' in fetched && fetched.value) next.value = fetched.value
      if ('cache' in fetched && fetched.cache) next.cache = fetched.cache
      if ('data' in fetched && fetched.data) next.data = fetched.data
      if ('bgColor' in fetched && fetched.bgColor) next.bgColor = fetched.bgColor
      if ('fetchedAt' in fetched && fetched.fetchedAt) next.fetchedAt = fetched.fetchedAt
      icon = next as IconSource
    }
    // 缺失信息只从目标页面补全。
    if (!pageTitle || !pageDesc) {
      const fallback = await fetchMetadataFromNetwork(url)
      if (fallback) {
        if (
          !pageTitle &&
          fallback.title &&
          metadataEvidence({ url, title: fallback.title }).title &&
          !isLoginOrAccessWallText(fallback.title)
        ) {
          pageTitle = fallback.title
        }
        if (!pageDesc && fallback.description && !isLoginOrAccessWallText(fallback.description)) {
          pageDesc = fallback.description
        }
      }
    }
  } catch (err) {
    console.warn('[metadata] 页面读取失败:', err)
  }

  return { pageTitle, pageDesc, icon }
}
