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

// Jina Reader 双域名容灾：主域名 r.jina.ai 在国内存在 DNS 污染，备用域名 r.jinaai.cn 国内可用。
// 按顺序尝试，首个成功的域名会被记住（内存 + localStorage），后续请求优先直连。
const JINA_READER_HOSTS = ['https://r.jina.ai', 'https://r.jinaai.cn']
const JINA_HOST_STORAGE_KEY = 'gm-jina-reader-host'
let cachedJinaHost: string | null = null

const readPreferredJinaHost = (): string | null => {
  if (cachedJinaHost) return cachedJinaHost
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage?.getItem(JINA_HOST_STORAGE_KEY) : null
    if (saved && JINA_READER_HOSTS.includes(saved)) cachedJinaHost = saved
  } catch {}
  return cachedJinaHost
}

const rememberJinaHost = (host: string) => {
  cachedJinaHost = host
  try {
    window.localStorage?.setItem(JINA_HOST_STORAGE_KEY, host)
  } catch {}
}

const fetchMetadataViaJina = async (url: string, timeoutMs = 10000): Promise<SearchFallbackResult | null> => {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const preferred = readPreferredJinaHost()
  const hosts = preferred ? [preferred, ...JINA_READER_HOSTS.filter((h) => h !== preferred)] : JINA_READER_HOSTS
  const perHostTimeout = Math.max(2000, Math.floor(timeoutMs / hosts.length))

  for (const host of hosts) {
    try {
      const text = await requestText(`${host}/${normalized}`, perHostTimeout, { Accept: 'application/json' })
      if (!text) continue
      const payload = JSON.parse(text)
      const title = (payload?.data?.title ?? payload?.title ?? '').trim()
      const description = (payload?.data?.description ?? payload?.description ?? '').trim()
      if (!title) continue
      rememberJinaHost(host)
      return { title, description: description || null, provider: 'jina' }
    } catch {
      continue
    }
  }
  return null
}

export const fetchMetadataFromNetwork = async (url: string, timeoutMs = 10000): Promise<SearchFallbackResult | null> => {
  return fetchMetadataViaJina(url, timeoutMs)
}
