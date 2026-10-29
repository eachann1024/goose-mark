import type { ReactNode } from 'react'

/** 搜索命中高亮。按子串不区分大小写切分，不走 innerHTML。 */
export function HighlightText({ text, query }: { text: string; query?: string }) {
  const q = query?.trim()
  if (!q || !text) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: ReactNode[] = []
  let index = 0
  let key = 0
  while (index < text.length) {
    const at = lower.indexOf(needle, index)
    if (at < 0) {
      parts.push(text.slice(index))
      break
    }
    if (at > index) parts.push(text.slice(index, at))
    parts.push(<mark key={key++} className="hl">{text.slice(at, at + needle.length)}</mark>)
    index = at + needle.length
  }
  return <>{parts}</>
}
