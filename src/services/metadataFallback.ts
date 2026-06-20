type SearchFallbackResult = {
  title: string | null
  description: string | null
  provider: 'jina'
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

const requestTextViaFetch = async (url: string, timeoutMs: number, headers?: Record<string, string>) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml',
        ...headers
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

const requestTextViaNode = (url: string, timeoutMs: number, headers?: Record<string, string>): Promise<string | null> => {
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
          'Accept': 'text/html,application/xhtml+xml',
          ...headers
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

const requestText = async (url: string, timeoutMs = 8000, headers?: Record<string, string>) => {
  const nodeResult = await requestTextViaNode(url, timeoutMs, headers)
  if (nodeResult) return nodeResult
  return requestTextViaFetch(url, timeoutMs, headers)
}

const fetchMetadataViaJina = async (url: string): Promise<SearchFallbackResult | null> => {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const target = `https://r.jina.ai/${normalized}`
    const text = await requestText(target, 10000, { Accept: 'application/json' })
    if (!text) return null
    const payload = JSON.parse(text)
    const title = (payload?.data?.title ?? payload?.title ?? '').trim()
    const description = (payload?.data?.description ?? payload?.description ?? '').trim()
    if (!title) return null
    return { title, description: description || null, provider: 'jina' }
  } catch {
    return null
  }
}

export const fetchMetadataFromNetwork = async (url: string): Promise<SearchFallbackResult | null> => {
  return fetchMetadataViaJina(url)
}
