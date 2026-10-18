import { normalizePageUrl } from '@/services/metadata/quality'

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

const BLOCKED_HOSTS = ['bing.com', 'duckduckgo.com', 'microsoft.com', 'msn.com', 'live.com']

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function decodeBingTarget(href: string) {
  try {
    const url = new URL(href, 'https://www.bing.com')
    const raw = url.searchParams.get('u')
    if (!raw) return null
    const payload = raw.replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = atob(padded)
    return decoded.startsWith('http') ? decoded : null
  } catch {
    return null
  }
}

function unwrapHref(href: string) {
  const raw = decodeEntities(href).trim()
  if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return null
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw
  try {
    const url = new URL(absolute, 'https://www.bing.com')
    const uddg = url.searchParams.get('uddg')
    if (uddg) return uddg
    if (url.hostname.endsWith('bing.com') && url.pathname.startsWith('/ck/')) return decodeBingTarget(url.href)
    return url.href
  } catch {
    return null
  }
}

function acceptUrl(raw: string) {
  const url = normalizePageUrl(raw)
  if (!url) return null
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return null
    return url
  } catch {
    return null
  }
}

function pushHit(hits: SearchHit[], seen: Set<string>, href: string, title: string, snippet = '') {
  const url = acceptUrl(unwrapHref(href) || '')
  const name = stripTags(title)
  if (!url || seen.has(url) || name.length < 2) return
  seen.add(url)
  hits.push({ title: name.slice(0, 120), url, snippet: stripTags(snippet).slice(0, 180) })
}

function parseAnchors(html: string, pattern: RegExp, snippetAfter = 0) {
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(pattern)) {
    const snippet = snippetAfter > 0 ? html.slice(match.index ?? 0, (match.index ?? 0) + snippetAfter) : ''
    const snippetMatch = snippet.match(/class="[^"]*(?:result__snippet|b_lineclamp|b_caption)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|p|div)>/i)
    pushHit(hits, seen, match[1] || '', match[2] || '', snippetMatch?.[1] || '')
    if (hits.length >= 8) break
  }
  return hits
}

export function parseSearchHtml(html: string): SearchHit[] {
  const bing = parseAnchors(
    html,
    /<li[^>]*class="[^"]*b_algo[^"]*"[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    1200
  )
  if (bing.length) return bing
  const ddg = parseAnchors(
    html,
    /<a\b(?=[^>]*class="[^"]*result__a)[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    900
  )
  if (ddg.length) return ddg
  return parseAnchors(html, /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
}

async function fetchHtml(url: string) {
  if (typeof window !== 'undefined' && window.gooseWeb?.fetchText) {
    const result = await window.gooseWeb.fetchText(url, {
      timeoutMs: 8000,
      maxBytes: 1_500_000,
      maxDecodedBytes: 2_000_000,
      accept: 'html'
    })
    return result.text
  }
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`网页请求失败（HTTP ${response.status}）`)
  return response.text()
}

/** 用搜索引擎查找网站；依次尝试必应中文、必应、DuckDuckGo */
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const encoded = encodeURIComponent(q)
  const endpoints = [
    `https://cn.bing.com/search?q=${encoded}&ensearch=0`,
    `https://www.bing.com/search?q=${encoded}&setlang=zh-Hans`,
    `https://html.duckduckgo.com/html/?q=${encoded}`
  ]
  for (const endpoint of endpoints) {
    try {
      const html = await fetchHtml(endpoint)
      const hits = parseSearchHtml(html)
      if (hits.length) return hits
    } catch {
      // 换下一个搜索源
    }
  }
  return []
}
