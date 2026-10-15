import { truncateAIText } from '@/lib/aiOutput'
import { normalizePageUrl, usableText } from './quality'

type Evidence = { url: string; title?: string; desc?: string }

export function metadataEvidence(input: Evidence) {
  let title = usableText(input.title) || ''
  const url = normalizePageUrl(input.url)
  if (url && normalizePageUrl(title) === url) title = ''
  if (url && title.toLowerCase() === new URL(url).hostname.replace(/^www\./, '')) title = ''
  return { title, desc: usableText(input.desc) || '' }
}

/** 没有原始简介时，模型输出也不能成为网页简介。 */
export function groundedMetadata(data: Record<string, unknown>, input: Evidence) {
  const evidence = metadataEvidence(input)
  return {
    title: evidence.title || evidence.desc ? truncateAIText(usableText(data.title), 15) : '',
    desc: evidence.desc ? truncateAIText(usableText(data.desc), 40) : ''
  }
}
