import { toBookmarkAiJsonValue, type BookmarkAiJsonValue } from '@/lib/bookmarkAiMessages'
import type {
  BookmarkTransactionAdapter,
  BookmarkTransactionEntityRef,
  FrozenBookmarkEntity
} from './types'

export function bookmarkTransactionEntityKey(ref: BookmarkTransactionEntityRef): string {
  return `${ref.type}:${ref.parentId ?? ''}:${ref.id}`
}

function stableStringify(value: BookmarkAiJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function signatureForBookmarkEntity(value: BookmarkAiJsonValue): string {
  return `fnv1a:${fnv1a(stableStringify(value))}`
}

export async function freezeBookmarkEntity(
  ref: BookmarkTransactionEntityRef,
  adapter: BookmarkTransactionAdapter
): Promise<FrozenBookmarkEntity> {
  const state = await adapter.readEntity(ref)
  if (!state) return { ref, exists: false, version: null, signature: 'absent' }
  const value = toBookmarkAiJsonValue(state.value) ?? null
  return {
    ref,
    exists: true,
    version: state.version,
    signature: signatureForBookmarkEntity(value)
  }
}

export async function freezeBookmarkEntities(
  refs: BookmarkTransactionEntityRef[],
  adapter: BookmarkTransactionAdapter
): Promise<FrozenBookmarkEntity[]> {
  const unique = [...new Map(refs.map((ref) => [bookmarkTransactionEntityKey(ref), ref])).values()]
  return Promise.all(unique.map((ref) => freezeBookmarkEntity(ref, adapter)))
}

export function frozenBookmarkEntitiesMatch(
  expected: FrozenBookmarkEntity,
  actual: FrozenBookmarkEntity
): boolean {
  return (
    bookmarkTransactionEntityKey(expected.ref) === bookmarkTransactionEntityKey(actual.ref) &&
    expected.exists === actual.exists &&
    expected.version === actual.version &&
    expected.signature === actual.signature
  )
}
