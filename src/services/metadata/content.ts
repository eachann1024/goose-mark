import { requestMetadataText } from './request'
import { usableText } from './quality'

const MAX_CHARS = 4000
const NOISE_SELECTOR = 'script,style,nav,footer,header,aside,noscript,svg,iframe,form,template'

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
}

async function readHtmlContent(url: string, timeoutMs: number): Promise<string> {
  const response = await requestMetadataText(url, timeoutMs, 'html')
  if (!response) return ''
  if (response.contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(response.contentType)) return ''
  const doc = new DOMParser().parseFromString(response.text, 'text/html')
  doc.querySelectorAll(NOISE_SELECTOR).forEach((node) => node.remove())
  const root = doc.querySelector('main') || doc.querySelector('article') || doc.body
  return compact(root?.textContent || '')
}

async function readJinaContent(url: string, timeoutMs: number): Promise<string> {
  const response = await requestMetadataText(`https://r.jina.ai/${url}`, timeoutMs, 'json')
  if (!response) return ''
  try {
    const content = JSON.parse(response.text)?.data?.content
    return typeof content === 'string' ? compact(content) : ''
  } catch {
    return ''
  }
}

/** 抓取页面正文纯文本（约 4000 字）；HTML 取不到时用 Jina Reader 兜底，都失败返回空串 */
export async function fetchPageContent(url: string, timeoutMs = 8000): Promise<string> {
  const html = await readHtmlContent(url, timeoutMs).catch(() => '')
  if (html.length >= 80 && usableText(html)) return html
  const reader = await readJinaContent(url, timeoutMs).catch(() => '')
  return reader || html
}
