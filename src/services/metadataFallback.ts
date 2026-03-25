type SearchFallbackResult = {
  title: string | null
  description: string | null
  provider: 'duckduckgo'
}

type NodeModuleLike = {
  request?: (...args: any[]) => any
  get?: (...args: any[]) => any
}

const getNodeModule = (name: string): NodeModuleLike | null => {
  if (typeof window !== 'undefined' && window.require) {
    try {
      return window.require(name)
    } catch {
      return null
    }
  }
  return null
}

const decodeHtml = (value: string) => value
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x2F;/gi, '/')
  .replace(/&#x27;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const stripHtml = (value: string) => decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())

const requestTextViaFetch = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml'
      }
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const requestTextViaNode = (url: string, timeoutMs: number): Promise<string | null> => {
  return new Promise((resolve) => {
    const https = getNodeModule('https')
    const http = getNodeModule('http')
    try {
      const target = new URL(url)
      const mod = target.protocol === 'http:' ? http : https
      if (!mod?.request) {
        resolve(null)
        return
      }

      const req = mod.request(url, {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }, (res: any) => {
        if ((res.statusCode || 0) >= 400) {
          resolve(null)
          req.destroy()
          return
        }
        const bufferModule = getNodeModule('buffer') as { Buffer?: { concat: (items: any[]) => { toString: (encoding: string) => string } } } | null
        const chunks: any[] = []
        res.on('data', (chunk: any) => chunks.push(chunk))
        res.on('end', () => {
          if (!bufferModule?.Buffer) {
            resolve(null)
            return
          }
          resolve(bufferModule.Buffer.concat(chunks).toString('utf8'))
        })
      })

      req.on('error', () => resolve(null))
      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
      req.end()
    } catch {
      resolve(null)
    }
  })
}

const requestText = async (url: string, timeoutMs = 8000) => {
  const nodeResult = await requestTextViaNode(url, timeoutMs)
  if (nodeResult) return nodeResult
  return requestTextViaFetch(url, timeoutMs)
}

const buildSearchQuery = (rawUrl: string) => {
  try {
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const url = new URL(normalized)
    const host = url.hostname.replace(/^www\./i, '')
    const segments = url.pathname
      .split('/')
      .map(segment => {
        try {
          return decodeURIComponent(segment)
        } catch {
          return segment
        }
      })
      .filter(Boolean)
      .slice(-3)
      .join(' ')
    return [host, segments].filter(Boolean).join(' ')
  } catch {
    return rawUrl.trim()
  }
}

const extractDuckDuckGoResult = (html: string): SearchFallbackResult | null => {
  const titleMatch = html.match(/result__a[^>]*>([\s\S]*?)<\/a>/i)
  if (!titleMatch) return null

  const snippetMatch = html.match(/result__snippet[^>]*>([\s\S]*?)<\/a>/i)
    || html.match(/result__snippet[^>]*>([\s\S]*?)<\/div>/i)

  const title = stripHtml(titleMatch[1] || '')
  const description = snippetMatch ? stripHtml(snippetMatch[1] || '') : ''
  if (!title) return null

  return {
    title,
    description: description || null,
    provider: 'duckduckgo'
  }
}

export const fetchMetadataFromNetwork = async (url: string): Promise<SearchFallbackResult | null> => {
  const query = buildSearchQuery(url)
  if (!query) return null

  const html = await requestText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)
  if (!html) return null
  return extractDuckDuckGoResult(html)
}
