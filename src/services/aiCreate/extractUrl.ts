import { normalizePageUrl } from '@/services/metadata/quality'

const TLDS = 'com|cn|net|org|io|dev|app|ai|co|me|cc|xyz|top|info|tv|so|sh|ly|gg|fm|ws|site|tech|cloud|wiki|ink|club|vip|pro|edu|gov|us|uk|jp|kr|de|fr|ru|in|hk|tw|to|is|im|page|link|run|studio|design|blog|news|world|live|store|online|work|tools|fun|zone|games|market'
const URL_RE = new RegExp(
  `(?:https?:\\/\\/[^\\s<>"'\`，。！？、；）】》」]+)|(?:(?<![\\w@.\\/-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![\\w-])(?::\\d{2,5})?(?:[\\/?#][^\\s<>"'\`，。！？、；）】》」]*)?)`,
  'gi'
)

/** 从文本里提取网址/域名（无协议补 https://），按出现顺序去重 */
export function extractUrlCandidates(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const match of (text || '').matchAll(URL_RE)) {
    const raw = match[0].replace(/[.,;:!?)\]}]+$/, '')
    const url = normalizePageUrl(raw)
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }
  return result
}
