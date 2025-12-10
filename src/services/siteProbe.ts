export interface ProbeResult {
  url: string
  ok: boolean
  status?: number
  elapsed: number
}


// Use lazy checks for node modules
const getNodeModule = (name: string) => {
  if (typeof window !== 'undefined' && window.require) {
    try {
      return window.require(name)
    } catch {
      return null
    }
  }
  return null
}

const nodeFetchHead = (url: string, timeoutMs: number): Promise<any> => {
  return new Promise((resolve) => {
     const https = getNodeModule('https')
     const http = getNodeModule('http')
     if (!https || !http) {
       // Browser fallback
       const controller = new AbortController()
       const timer = setTimeout(() => controller.abort(), timeoutMs)
       fetch(url, { method: 'HEAD', signal: controller.signal })
         .then(res => {
            clearTimeout(timer)
            resolve(res)
         })
         .catch(() => {
            clearTimeout(timer)
            resolve(null)
         })
       return
     }

     try {
       const u = new URL(url)
       const requestModule = u.protocol === 'http:' ? http : https
       const opts = {
         method: 'HEAD',
         headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
         },
         timeout: timeoutMs
       }
       const req = requestModule.request(url, opts, (res: any) => {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode })
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

export const probeUrl = async (url: string, timeoutMs = 3000): Promise<ProbeResult> => {
  const started = performance.now()
  const res = await nodeFetchHead(url, timeoutMs)
  const elapsed = performance.now() - started
  if (!res) return { url, ok: false, elapsed }
  return { url, ok: res.ok, status: res.status, elapsed }
}
