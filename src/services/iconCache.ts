import type { IconSource, Bookmark } from '@/types/bookmark'

const dayMs = 24 * 60 * 60 * 1000
const cooldown = new Map<string, number>()

// Helper to safely get Node modules lazily
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

const getIconDir = () => {
  if (typeof window === 'undefined' || !window.utools) return null
  const path = getNodeModule('path')
  const fs = getNodeModule('fs')
  if (!path || !fs) return null
  
  try {
    const dir = path.join(window.utools.getPath('userData'), 'bookmarks-icons')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  } catch (e) {
    console.error('[IconCache] Failed to get/create icon dir', e)
    return null
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface NodeFetchResponse {
  ok: boolean
  status: number
  url: string
  text: () => Promise<string>
  arrayBuffer: () => Promise<ArrayBuffer>
}

const nodeFetch = (url: string, options: { method?: string; timeoutMs?: number } = {}): Promise<NodeFetchResponse | null> => {
  return new Promise((resolve) => {
    const https = getNodeModule('https')
    const http = getNodeModule('http')

    if (!https || !http) {
      // Fallback to browser fetch
      console.warn('[IconCache] Node environment not found, falling back to browser fetch')
      fetch(url)
        .then(async res => {
           let buffer: ArrayBuffer
           try {
             buffer = await res.arrayBuffer()
           } catch {
             buffer = new ArrayBuffer(0)
           }
           resolve({
             ok: res.ok,
             status: res.status,
             url: res.url,
             text: async () => new TextDecoder().decode(buffer),
             arrayBuffer: async () => buffer
           })
        })
        .catch((e) => {
          console.error('[IconCache] Browser fetch failed:', e)
          resolve(null)
        })
      return
    }

    const maxRedirects = 5
    let redirectCount = 0
    let currentUrl = url

    const executeRequest = (targetUrl: string) => {
      try {
        const u = new URL(targetUrl)
        const requestModule = u.protocol === 'http:' ? http : https
        const opts = {
          method: options.method || 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
          },
          timeout: options.timeoutMs || 5000
        }

        console.log(`[IconCache] Fetching: ${targetUrl}`)
        const req = requestModule.request(targetUrl, opts, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
             if (redirectCount >= maxRedirects) {
               console.warn('[IconCache] Max redirects exceeded')
               resolve(null)
               return
             }
             redirectCount++
             let nextUrl = res.headers.location
             try {
               nextUrl = new URL(nextUrl, targetUrl).toString()
             } catch {}
             
             console.log(`[IconCache] Redirecting to: ${nextUrl}`)
             executeRequest(nextUrl)
             return
          }

          const chunks: any[] = []
          res.on('data', (chunk: any) => chunks.push(chunk))
          res.on('end', () => {
             const bufferModule = getNodeModule('buffer')
             const BufferCtor = (typeof Buffer !== 'undefined' ? Buffer : (bufferModule?.Buffer))

             if (!BufferCtor) {
                console.error('[IconCache] Buffer not found')
                resolve(null)
                return
             }
             
             const buffer = BufferCtor.concat(chunks)
             resolve({
               ok: res.statusCode >= 200 && res.statusCode < 300,
               status: res.statusCode,
               url: targetUrl,
               text: async () => buffer.toString('utf-8'),
               arrayBuffer: async () => {
                 return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
               }
             })
          })
        })

        req.on('error', (e: any) => {
          console.error(`[IconCache] Request error for ${targetUrl}:`, e)
          resolve(null)
        })

        req.on('timeout', () => {
          req.destroy()
          console.warn(`[IconCache] Timeout for ${targetUrl}`)
          resolve(null)
        })

        req.end()
      } catch (e) {
        console.error('[IconCache] Execute request exception:', e)
        resolve(null)
      }
    }

    executeRequest(currentUrl)
  })
}

const parseDomain = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

const directFaviconUrl = (url: string) => {
  try {
    const u = new URL(url)
    u.pathname = '/favicon.ico'
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}


const fetchIconWithUBrowser = async (url: string): Promise<string | null> => {
   if (typeof window === 'undefined' || !window.utools || !window.utools.ubrowser) return null
   
   try {
     const result = await window.utools.ubrowser.goto(url)
       .wait(2000) // Wait for dynamic rendering
       .evaluate(() => {
          const links = Array.from(document.querySelectorAll('link[rel*="icon"]'))
          // Priority: apple-touch-icon > icon[type=svg] > icon[type=png] > ...
          const best = links.sort((a, b) => {
             const relA = a.getAttribute('rel')?.toLowerCase() || ''
             const relB = b.getAttribute('rel')?.toLowerCase() || ''
             const hrefA = a.getAttribute('href') || ''
             const hrefB = b.getAttribute('href') || ''
             
             let scoreA = 0
             if (relA.includes('apple-touch-icon')) scoreA = 10
             else if (relA.includes('icon')) {
                scoreA = 5
                if (hrefA.endsWith('.svg')) scoreA += 2
                if (hrefA.endsWith('.png')) scoreA += 1
             }
             
             let scoreB = 0
             if (relB.includes('apple-touch-icon')) scoreB = 10
             else if (relB.includes('icon')) {
                scoreB = 5
                if (hrefB.endsWith('.svg')) scoreB += 2
                if (hrefB.endsWith('.png')) scoreB += 1
             }
             
             return scoreB - scoreA
          })[0]
          
          return best ? (best as HTMLLinkElement).href : null
       })
       .run({ width: 1000, height: 800, show: false })
       
     return result && result.length > 0 ? result[0] : null
   } catch (e) {
     console.error('[IconCache] uBrowser failed', e)
     return null
   }
}

const parseIconFromHtml = async (targetUrl: string): Promise<string | null> => {
  try {
    const res = await nodeFetch(targetUrl)
    if (!res) return null
    const html = await res.text()
    
    // Candidates collection
    const linkTags = html.match(/<link\s+[^>]+>/gi) || []
    const candidates: { rel: string, href: string, score: number }[] = []

    for (const tag of linkTags) {
      const relMatch = tag.match(/rel=["']([^"']+)["']/i)
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i)
      
      if (!relMatch || !hrefMatch) continue
      
      const rel = relMatch[1].toLowerCase()
      const href = hrefMatch[1]
      
      let score = 0
      if (rel.includes('apple-touch-icon')) score = 10
      else if (rel.includes('icon')) {
         score = 5
         if (href.endsWith('.svg')) score += 2
         if (href.endsWith('.png')) score += 1
      } else {
         continue
      }
      
      candidates.push({ rel, href, score })
    }
    
    // Sort by score desc
    candidates.sort((a, b) => b.score - a.score)
    
    if (candidates.length > 0) {
       const best = candidates[0]
       try {
           return new URL(best.href, res.url).toString()
       } catch {
           return null
       }
    }

    return null
  } catch {
    return null
  }
}

const writeBuffer = (domain: string, buffer: ArrayBuffer) => {
  const fs = getNodeModule('fs')
  const path = getNodeModule('path')
  const dir = getIconDir()
  
  if (!fs || !path || !dir) return null
  
  try {
    const filename = path.join(dir, `${domain}.ico`)
    // Use Buffer explicitly
    const bufferModule = getNodeModule('buffer')
    const BufferCtor = (typeof Buffer !== 'undefined' ? Buffer : (bufferModule?.Buffer))
    if (BufferCtor) {
       fs.writeFileSync(filename, BufferCtor.from(buffer))
       return filename
    }
    return null
  } catch (e) {
    console.error('[IconCache] Failed to write file', e)
    return null
  }
}

const loadExisting = (domain: string): IconSource | null => {
  const fs = getNodeModule('fs')
  const path = getNodeModule('path')
  const dir = getIconDir()

  if (!fs || !path || !dir) return null
  
  try {
    const filename = path.join(dir, `${domain}.ico`)
    if (fs.existsSync(filename)) {
      const stat = fs.statSync(filename)
      const hash = `${stat.mtimeMs}`
      return { type: 'file', path: filename, hash, fetchedAt: stat.mtimeMs }
    }
  } catch (e) {
    // console.warn('[IconCache] Failed to load existing icon', e)
  }
  return null
}

export const iconToDisplayUrl = (icon?: IconSource) => {
  if (!icon) return null
  if (icon.type === 'file') return `file://${icon.path}`
  if (icon.type === 'remote') return icon.src 
  return null
}

const shouldCooldown = (domain: string) => {
  const last = cooldown.get(domain)
  if (!last) return false
  return Date.now() - last < dayMs
}

export const fetchAndCacheIcon = async (url: string, force: boolean = false): Promise<IconSource | null> => {
  const domain = parseDomain(url)
  if (!domain) return null
  if (!force && shouldCooldown(domain)) return loadExisting(domain)

  const cached = loadExisting(domain)
  if (cached && !force) return cached

  const candidateUrls = [] as string[]
  
  // 1. Static Page Scan (Fast)
  const pageIcon = await parseIconFromHtml(url)
  if (pageIcon) candidateUrls.push(pageIcon)

  // 2. uBrowser Dynamic Scan (Slow, but handles SPAs)
  // Only try if static scan returned nothing distinctive?
  // Or if we really want to ensure we get the best icon. 
  // Given user complaints, let's try it if static is empty OR if we are in a uTools env.
  // To avoid performance hit on every bookmark, maybe we only do this if pageIcon is null?
  if (!pageIcon && typeof window !== 'undefined' && window.utools && window.utools.ubrowser) {
      console.log('[IconCache] Static scan failed, trying uBrowser for:', url)
      const dynamicIcon = await fetchIconWithUBrowser(url)
      if (dynamicIcon) candidateUrls.push(dynamicIcon)
  }

  // 3. Origin Scan (as backup for "root" icon)
  const origin = (() => {
     try { return new URL(url).origin } catch { return null }
  })()
  if (origin && origin !== url) {
     const originIcon = await parseIconFromHtml(origin)
     if (originIcon) candidateUrls.push(originIcon)
  }

  // 4. Favicon.ico (Generic)
  const direct = directFaviconUrl(url)
  if (direct) candidateUrls.push(direct)

  // 5. Google Fallback
  candidateUrls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`)

  for (const iconUrl of candidateUrls) {
    const res = await nodeFetch(iconUrl)
    if (!res || !res.ok) continue
    
    // Check content type? 
    // Sometimes we get HTML for a 404 page even with 200 OK if server is weird (SPA fallback)
    // But assuming 200 OK + Buffer length > 0 is good enough for now.
    
    const buffer = await res.arrayBuffer()
    // Increase check to 500 bytes to avoid tiny empty pixels, but keep small enough for valid 16x16 ico (usually ~1.4kb)
    if (buffer.byteLength < 200) continue 

    const filename = writeBuffer(domain, buffer)
    if (filename) {
      cooldown.set(domain, Date.now())
      const hash = `${buffer.byteLength}-${Date.now()}`
      return { type: 'file', path: filename, hash, fetchedAt: Date.now() }
    }
  }

  // Fallback to Google Remote URL if local write failed or inconsistent
  const googleUrl = candidateUrls.find(u => u.includes('google.com/s2/favicons'))
  if (googleUrl) {
    return { type: 'remote', src: googleUrl, fetchedAt: Date.now() }
  }

  cooldown.set(domain, Date.now())
  return null
}

export const ensureIconForBookmark = async (bookmark: Bookmark, force: boolean = false): Promise<IconSource | undefined> => {
  if (bookmark.icon && !force) return bookmark.icon
  // If force is true, we ignore existing icon and fetch fresh
  const icon = await fetchAndCacheIcon(bookmark.url, force)
  if (icon) return icon
  
  if (bookmark.icon) return bookmark.icon // Fallback to existing if new fetch failing?
  
  const base = bookmark.title.trim() || bookmark.url.trim()
  const text = base ? base.slice(0, 4) : '•'
  return { type: 'text', value: text.toUpperCase() }
}

export const bulkMatchMissing = async (bookmarks: Bookmark[]) => {
  const result = new Map<string, IconSource>()
  for (const item of bookmarks) {
    // If matching missing, we generally implicitly mean force check?
    // Or only check if missing. The caller filters 'missing' ones.
    // If it's missing (Text icon), we definitely want to fetch = force?
    // Actually, ensureIconForBookmark checks bookmark.icon. 
    // If the bookmark HAS a text icon, ensureIconForBookmark returns it immediately unless force=true.
    // So YES, we MUST pass force=true to strictly try fetching.
    const icon = await ensureIconForBookmark(item, true)
    if (icon && icon.type !== 'text') result.set(item.id, icon)
    await sleep(200) // Increase sleep to play nice with rate limits/ubrowser
  }
  return result
}
