import type { IconSource } from '@/types/bookmark'

function normalizeImageData(value: string): string {
  const header = /^data:image\/svg\+xml(?:;charset=(?:utf-8|us-ascii))?,/i.exec(value)
  if (!header) return value
  const maxBytes = 2 * 1024 * 1024
  if (value.length > maxBytes * 3) throw new Error('图标超过 2 MiB，未写入')
  let svg: string
  try { svg = decodeURIComponent(value.slice(header[0].length)) }
  catch { throw new Error('SVG 图标编码无效，未写入') }
  const bytes = new TextEncoder().encode(svg)
  if (bytes.byteLength > maxBytes) throw new Error('图标超过 2 MiB，未写入')
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export function normalizeInlineIcon(icon: IconSource): IconSource {
  const { title: _title, description: _description, ...source } =
    icon as IconSource & { title?: unknown; description?: unknown }
  icon = source
  if (icon.type === 'custom') return { ...icon, data: normalizeImageData(icon.data) }
  if (icon.type !== 'remote') return icon
  if (!icon.src.startsWith('data:image/')) {
    return icon.cache ? { ...icon, cache: normalizeImageData(icon.cache) } : icon
  }
  // Embedded images are custom icons; only HTTP(S) URLs belong in remote.src.
  return {
    type: 'custom',
    data: normalizeImageData(icon.cache?.startsWith('data:image/') ? icon.cache : icon.src),
    ...(icon.bgColor ? { bgColor: icon.bgColor } : {})
  }
}
