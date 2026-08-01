import {
  BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
  combineRecoveredBookmarkSnapshot,
  parseBookmarkSnapshotEnvelope,
  type BookmarkSnapshotEnvelope,
} from '@/lib/bookmarkSnapshotProtocol'
import type { Bookmark, Group } from '@/types/bookmark'

const LOCAL_MIRROR_SCHEMA_VERSION = 'goose-marks.local-data.v1'

interface LocalMirrorPayload {
  schemaVersion: typeof LOCAL_MIRROR_SCHEMA_VERSION
  generatedAt: string
  revision: number
  data: {
    groups: Group[]
    bookmarks: Bookmark[]
  }
  meta: {
    recordCount: number
    checksum: string
  }
}

export interface LocalMirrorRecoverySnapshot {
  sourceRevision: number
  sourceChecksum: string
  snapshot: BookmarkSnapshotEnvelope
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const parseLocalMirrorRecoverySnapshot = async (
  raw: string,
): Promise<LocalMirrorRecoverySnapshot | null> => {
  let payload: LocalMirrorPayload
  try {
    payload = JSON.parse(raw) as LocalMirrorPayload
  } catch {
    return null
  }
  if (
    payload?.schemaVersion !== LOCAL_MIRROR_SCHEMA_VERSION ||
    typeof payload.generatedAt !== 'string' ||
    !Number.isSafeInteger(payload.revision) ||
    payload.revision < 1 ||
    !Array.isArray(payload.data?.groups) ||
    !Array.isArray(payload.data?.bookmarks) ||
    payload.meta?.recordCount !== payload.data.bookmarks.length ||
    typeof payload.meta?.checksum !== 'string'
  ) return null

  const baseJson = JSON.stringify({
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    revision: payload.revision,
    data: payload.data,
  })
  const checksum = await sha256Hex(baseJson)
  if (checksum !== payload.meta.checksum) return null

  const firstGroup = payload.data.groups[0]
  const candidate: BookmarkSnapshotEnvelope = {
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: 1,
    snapshotId: `local-mirror-${payload.revision}`,
    groups: payload.data.groups,
    bookmarks: payload.data.bookmarks,
    activeGroupId: firstGroup?.id || '',
    activeSubGroupId: firstGroup?.children[0]?.id || '',
  }
  const snapshot = parseBookmarkSnapshotEnvelope(JSON.stringify(candidate))
  if (!snapshot) return null

  return {
    sourceRevision: payload.revision,
    sourceChecksum: checksum,
    snapshot,
  }
}

export const selectLocalMirrorRecoverySnapshot = (
  recovered: BookmarkSnapshotEnvelope,
  current: BookmarkSnapshotEnvelope | null,
  currentIsDefaultSeed: boolean,
): BookmarkSnapshotEnvelope => {
  if (!current) return recovered
  if (!currentIsDefaultSeed) return combineRecoveredBookmarkSnapshot(recovered, current)
  return {
    ...recovered,
    revision: current.revision,
    snapshotId: current.snapshotId,
  }
}
