import { normalizePageUrl } from './metadata/quality'
import { readJinaMetadata, readPageMetadata, type PageMetadata } from './metadata/page'

export { isLoginOrAccessWallText } from './metadata/quality'

/** 先读取原始网页，缺失字段才读目标 URL 的 Reader；失败保留空值。 */
export async function fetchMetadataFromNetwork(
  rawUrl: string, timeoutMs = 10000
): Promise<PageMetadata | null> {
  const url = normalizePageUrl(rawUrl)
  if (!url) return null
  const budget = Math.max(1, Math.min(30000, timeoutMs))
  const deadline = Date.now() + budget
  const page = await readPageMetadata(url, Math.min(4000, budget))
  if (page?.title && page.description) return page
  const reader = await readJinaMetadata(url, deadline - Date.now())
  if (!reader) return page
  return {
    title: page?.title || reader.title,
    description: page?.description || reader.description,
    provider: 'jina'
  }
}
