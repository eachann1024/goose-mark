import { isSamePage, usableText } from './quality'
import { requestMetadataText } from './request'

export type PageMetadata = {
  title: string | null
  description: string | null
  provider: 'page' | 'jina'
}

export async function readPageMetadata(url: string, timeoutMs: number): Promise<PageMetadata | null> {
  const response = await requestMetadataText(url, timeoutMs, 'html')
  if (!response || !isSamePage(response.url, url)) return null
  if (response.contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(response.contentType)) return null
  const doc = new DOMParser().parseFromString(response.text, 'text/html')
  const meta = (keys: string[]) => {
    for (const key of keys) {
      for (const node of doc.head.querySelectorAll('meta')) {
        const name = (node.getAttribute('name') || node.getAttribute('property') || '').toLowerCase()
        if (name === key) {
          const text = usableText(node.getAttribute('content'))
          if (text) return text
        }
      }
    }
    return null
  }
  const title = usableText(doc.title) || meta(['og:title', 'twitter:title'])
  const description = meta(['description', 'og:description', 'twitter:description'])
  return title || description ? { title, description, provider: 'page' } : null
}

// 只读取目标页面，不以域名联想或百科搜索结果补写简介。
export async function readJinaMetadata(url: string, timeoutMs: number): Promise<PageMetadata | null> {
  const response = await requestMetadataText(`https://r.jina.ai/${url}`, timeoutMs, 'json')
  if (!response) return null
  try {
    const payload = JSON.parse(response.text)
    const data = payload?.data
    if (payload?.code !== 200 || !data || !isSamePage(data.url, url)) return null
    const title = usableText(data.title)
    const description = usableText(data.description)
    return title || description ? { title, description, provider: 'jina' } : null
  } catch {
    return null
  }
}
