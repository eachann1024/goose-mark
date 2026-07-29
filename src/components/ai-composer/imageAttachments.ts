import type { BookmarkAiImageAttachment } from '@/lib/bookmarkAiContext'

export const BOOKMARK_AI_IMAGE_MAX_COUNT = 4
export const BOOKMARK_AI_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const BOOKMARK_AI_IMAGE_MAX_TOTAL_BYTES = 20 * 1024 * 1024
export const BOOKMARK_AI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

const SUPPORTED_TYPES = new Set<string>(BOOKMARK_AI_IMAGE_TYPES)
const SAMPLE_BYTES = 64 * 1024

export interface BookmarkAiImageAddFailure {
  fileName: string
  reason: 'unsupported' | 'too-large' | 'count-limit' | 'total-limit' | 'duplicate' | 'read-failed'
  message: string
}

export interface BookmarkAiPreparedImages {
  accepted: BookmarkAiImageAttachment[]
  rejected: BookmarkAiImageAddFailure[]
}

export function validateBookmarkAiImageLimits(
  file: Pick<File, 'name' | 'type' | 'size'>,
  currentCount: number,
  currentTotalBytes: number
): BookmarkAiImageAddFailure | null {
  const fileName = file.name || '图片'
  if (!isBookmarkAiImageFile(file)) {
    return { fileName, reason: 'unsupported', message: `${fileName} 不是支持的 PNG、JPEG、WebP 或 GIF 图片` }
  }
  if (file.size > BOOKMARK_AI_IMAGE_MAX_BYTES) {
    return { fileName, reason: 'too-large', message: `${fileName} 超过单张 10MB 限制` }
  }
  if (currentCount >= BOOKMARK_AI_IMAGE_MAX_COUNT) {
    return { fileName, reason: 'count-limit', message: '每次最多添加 4 张图片' }
  }
  if (currentTotalBytes + file.size > BOOKMARK_AI_IMAGE_MAX_TOTAL_BYTES) {
    return { fileName, reason: 'total-limit', message: '图片总大小不能超过 20MB' }
  }
  return null
}

export function isBookmarkAiImageFile(file: Pick<File, 'type'>) {
  return SUPPORTED_TYPES.has(file.type.toLowerCase())
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

export async function hasBookmarkAiImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const type = file.type.toLowerCase()
  if (type === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  }
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/gif') return ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a'
  if (type === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
  return false
}

function fnv1a(bytes: Uint8Array) {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function joinSamples(first: ArrayBuffer, last: ArrayBuffer) {
  const firstBytes = new Uint8Array(first)
  const lastBytes = new Uint8Array(last)
  const joined = new Uint8Array(firstBytes.length + lastBytes.length)
  joined.set(firstBytes)
  joined.set(lastBytes, firstBytes.length)
  return joined
}

/** 快速指纹只读取文件头尾样本；用于立即去重，不替代完整 SHA-256。 */
export async function calculateBookmarkAiFastFingerprint(file: File) {
  const first = await file.slice(0, SAMPLE_BYTES).arrayBuffer()
  const lastStart = Math.max(0, file.size - SAMPLE_BYTES)
  const last = lastStart === 0 ? new ArrayBuffer(0) : await file.slice(lastStart).arrayBuffer()
  const sampleHash = fnv1a(joinSamples(first, last))
  return `fast:${file.size}:${file.type.toLowerCase()}:${sampleHash}`
}

export async function calculateBookmarkAiSha256(file: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle?.digest) return null
  try {
    const digest = await subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

export function readBookmarkAiImageDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.onabort = () => reject(new Error('图片读取已取消'))
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) resolve(reader.result)
      else reject(new Error('图片读取失败'))
    }
    reader.readAsDataURL(file)
  })
}

function createImageId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `image-${globalThis.crypto.randomUUID()}`
  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function prepareBookmarkAiImages(
  files: readonly File[],
  existing: readonly BookmarkAiImageAttachment[] = []
): Promise<BookmarkAiPreparedImages> {
  const accepted: BookmarkAiImageAttachment[] = []
  const rejected: BookmarkAiImageAddFailure[] = []
  const fingerprints = new Set(existing.map((image) => image.fingerprint))
  let totalBytes = existing.reduce((sum, image) => sum + image.size, 0)

  for (const file of files) {
    const fileName = file.name || '图片'
    const limitFailure = validateBookmarkAiImageLimits(
      file,
      existing.length + accepted.length,
      totalBytes
    )
    if (limitFailure) {
      rejected.push(limitFailure)
      continue
    }
    if (!(await hasBookmarkAiImageSignature(file))) {
      rejected.push({ fileName, reason: 'unsupported', message: `${fileName} 不是支持的 PNG、JPEG、WebP 或 GIF 图片` })
      continue
    }
    try {
      const fingerprint = await calculateBookmarkAiFastFingerprint(file)
      if (fingerprints.has(fingerprint)) {
        rejected.push({ fileName, reason: 'duplicate', message: `${fileName} 与已添加图片重复` })
        continue
      }
      const dataUrl = await readBookmarkAiImageDataUrl(file)
      const image: BookmarkAiImageAttachment = {
        id: createImageId(),
        name: fileName,
        mediaType: file.type.toLowerCase(),
        dataUrl,
        size: file.size,
        fingerprint
      }
      fingerprints.add(fingerprint)
      totalBytes += file.size
      accepted.push(image)
    } catch {
      rejected.push({ fileName, reason: 'read-failed', message: `${fileName} 读取失败，请重新选择` })
    }
  }
  return { accepted, rejected }
}

/**
 * 完整哈希用于解决头尾样本相同但正文不同的碰撞，并发现快速指纹漏掉的重复。
 * 返回应保留的附件和被 SHA-256 判定为重复的 id。
 */
export async function resolveBookmarkAiImageSha256(
  images: readonly BookmarkAiImageAttachment[],
  targetIds?: ReadonlySet<string>
) {
  const seen = new Map<string, string>()
  const duplicates: string[] = []
  const resolved: BookmarkAiImageAttachment[] = []
  for (const image of images) {
    let sha256 = image.sha256
    if (!sha256 && (!targetIds || targetIds.has(image.id))) {
      try {
        const response = await fetch(image.dataUrl)
        sha256 = await calculateBookmarkAiSha256(await response.blob()) ?? undefined
      } catch {
        sha256 = undefined
      }
    }
    if (sha256) {
      const existingId = seen.get(sha256)
      if (existingId) {
        duplicates.push(image.id)
        continue
      }
      seen.set(sha256, image.id)
    }
    resolved.push({ ...image, ...(sha256 ? { sha256 } : {}) })
  }
  return { images: resolved, duplicates }
}
