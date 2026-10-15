const MAX_BYTES = 2 * 1024 * 1024

type TextResponse = { text: string; url: string; contentType: string }

function decode(bytes: Uint8Array, contentType: string): string {
  const sample = new TextDecoder().decode(bytes.subarray(0, 4096))
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
    || /<meta[^>]+charset=["']?([\w-]+)/i.exec(sample)?.[1] || 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

async function readBrowserResponse(url: string, accept: 'html' | 'json', signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    headers: { Accept: accept === 'json' ? 'application/json' : 'text/html,application/xhtml+xml' }
  })
  if (!response.ok || !response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) return null
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const contentType = response.headers.get('content-type') || ''
  return { text: decode(bytes, contentType), url: response.url, contentType }
}

/** 宿主负责代理与地址校验；总预算同时限制桥接、重定向和浏览器读取。 */
export async function requestMetadataText(
  url: string, timeoutMs: number, accept: 'html' | 'json'
): Promise<TextResponse | null> {
  if (timeoutMs <= 0) return null
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const read = async (): Promise<TextResponse | null> => {
    if (typeof window !== 'undefined' && window.gooseWeb) {
      const options = { timeoutMs, maxBytes: MAX_BYTES, maxDecodedBytes: MAX_BYTES, accept }
      if (accept === 'html') {
        const result = await window.gooseWeb.fetchBinary(url, options)
        if (!result.ok) return null
        const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0))
        return { text: decode(bytes, result.contentType), url: result.url, contentType: result.contentType }
      }
      const result = await window.gooseWeb.fetchText(url, options)
      return result.ok ? result : null
    }
    return readBrowserResponse(url, accept, controller.signal)
  }
  try {
    return await Promise.race([
      read().catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null) }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
    controller.abort()
  }
}
