/**
 * 图标服务模块
 * 从 DuckDuckGo 和目标网站获取图标，返回 base64 格式
 */

// 超时控制包装器
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    )
  ])
}

// 从 DuckDuckGo Icons 服务获取图标
async function fetchFromDuckDuckGo(host) {
  try {
    const ddgUrl = `https://icons.duckduckgo.com/ip3/${host}.ico`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await withTimeout(
      fetch(ddgUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: controller.signal
      }),
      5000
    )

    clearTimeout(timeoutId)

    if (!response.ok) return null

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = response.headers.get('content-type') || 'image/x-icon'

    return {
      icon: `data:${mimeType};base64,${base64}`,
      source: 'ddg',
      mimeType
    }
  } catch {
    return null
  }
}

// 从 HTML 中提取图标 URL
function extractIconUrlFromHtml(html, baseUrl) {
  // 简单的正则匹配，提取 icon 链接
  const patterns = [
    /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+rel=["']shortcut icon["'][^>]*href=["']([^"']+)["']/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      let iconUrl = match[1]
      // 转换相对路径为绝对路径
      if (iconUrl.startsWith('//')) {
        iconUrl = 'https:' + iconUrl
      } else if (iconUrl.startsWith('/')) {
        const baseObj = new URL(baseUrl)
        iconUrl = baseObj.origin + iconUrl
      } else if (!iconUrl.startsWith('http')) {
        iconUrl = new URL(iconUrl, baseUrl).href
      }
      return iconUrl
    }
  }

  // 尝试 og:image
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (ogMatch && ogMatch[1]) {
    let iconUrl = ogMatch[1]
    if (iconUrl.startsWith('//')) {
      iconUrl = 'https:' + iconUrl
    } else if (!iconUrl.startsWith('http')) {
      iconUrl = new URL(iconUrl, baseUrl).href
    }
    return iconUrl
  }

  return null
}

// 从网页 HTML 获取图标
async function fetchFromHtml(url) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: controller.signal
      }),
      5000
    )

    clearTimeout(timeoutId)

    if (!response.ok) return null

    const html = await response.text()
    const iconUrl = extractIconUrlFromHtml(html, url)

    if (!iconUrl) return null

    // 下载图标
    const iconResponse = await withTimeout(
      fetch(iconUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': url
        }
      }),
      5000
    )

    if (!iconResponse.ok) return null

    const buffer = await iconResponse.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = iconResponse.headers.get('content-type') || 'image/png'

    return {
      icon: `data:${mimeType};base64,${base64}`,
      source: 'html',
      mimeType
    }
  } catch {
    return null
  }
}

/**
 * 获取网站图标（主入口）
 * @param {string} url - 网站 URL
 * @returns {Promise<Object|null>} - { url, icon, source, mimeType } 或 null
 */
export async function fetchSiteIcon(url) {
  let validatedUrl
  try {
    validatedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return null
  }

  if (validatedUrl.protocol !== 'http:' && validatedUrl.protocol !== 'https:') {
    return null
  }

  const origin = validatedUrl.origin
  const host = validatedUrl.host

  // 策略1: DuckDuckGo（快速稳定）
  const ddgResult = await fetchFromDuckDuckGo(host)
  if (ddgResult) {
    return { url: origin, ...ddgResult }
  }

  // 策略2: HTML 解析
  const htmlResult = await fetchFromHtml(origin)
  if (htmlResult) {
    return { url: origin, ...htmlResult }
  }

  return null
}
