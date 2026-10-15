/**
 * 登录墙 / 访问受限 / 人机验证等弱文案：不能当作书签标题或简介来源。
 * 供表单抓取、AI 保存与联网兜底共用。
 */
export function isLoginOrAccessWallText(text: string | null | undefined): boolean {
  const raw = (text || '').trim()
  if (!raw) return true
  const t = raw.toLowerCase()
  // 过短且仅为通用导航词
  if (/^(home|首页|主页|index|welcome|欢迎)$/i.test(raw)) return true
  const patterns = [
    /\bsign[\s-]?in\b/i,
    /\blog[\s-]?in\b/i,
    /\bsign[\s-]?up\b/i,
    /\blog[\s-]?on\b/i,
    /请.?登录/,
    /需要登录/,
    /先登录/,
    /登录后/,
    /立即登录/,
    /注册登录/,
    /登录以继续/,
    /登录你的/,
    /登录您的/,
    /账号登录/,
    /帐户登录/,
    /验证你是真人/,
    /人机验证/,
    /access denied/i,
    /permission denied/i,
    /unauthorized/i,
    /403 forbidden/i,
    /just a moment/i,
    /attention required/i,
    /checking your browser/i,
    /enable javascript/i,
    /cloudflare/i,
    /captcha/i,
    /verify you are human/i,
    /bot detection/i
  ]
  return patterns.some((re) => re.test(t) || re.test(raw))
}

export function normalizePageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const value = raw.trim()
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

export function isSamePage(actual: unknown, expected: string): boolean {
  const normalized = normalizePageUrl(actual)
  if (!normalized) return false
  const key = (raw: string) => {
    const url = new URL(raw)
    return `${url.hostname.replace(/^www\./, '')}:${url.port}${url.pathname.replace(/\/$/, '')}${url.search}`
  }
  return key(normalized) === key(expected)
}

export function usableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text && !isLoginOrAccessWallText(text) ? text : null
}
