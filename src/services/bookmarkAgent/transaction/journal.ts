import { toBookmarkAiJsonValue } from '@/lib/bookmarkAiMessages'
import type {
  BookmarkApprovalEntry,
  BookmarkApprovalStatus,
  BookmarkTransactionEntityRef,
  BookmarkTransactionOperation,
  FrozenBookmarkEntity
} from './types'

export const BOOKMARK_APPROVAL_MAX_ENTRIES = 100
export const BOOKMARK_APPROVAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const STATUSES = new Set<BookmarkApprovalStatus>([
  'prepared',
  'executing',
  'completed',
  'failed',
  'undone',
  'expired'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const timestamp = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

function normalizeRef(value: unknown): BookmarkTransactionEntityRef | null {
  if (!isRecord(value)) return null
  if (value.type !== 'bookmark' && value.type !== 'group' && value.type !== 'subGroup') return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!id) return null
  const parentId = typeof value.parentId === 'string' && value.parentId.trim()
    ? value.parentId.trim()
    : undefined
  if (value.type === 'subGroup' && !parentId) return null
  return { type: value.type, id, ...(parentId ? { parentId } : {}) }
}

function normalizeFrozen(value: unknown): FrozenBookmarkEntity | null {
  if (!isRecord(value)) return null
  const ref = normalizeRef(value.ref)
  if (!ref || typeof value.exists !== 'boolean' || typeof value.signature !== 'string') return null
  const version =
    typeof value.version === 'string' || typeof value.version === 'number' || value.version === null
      ? value.version
      : null
  return { ref, exists: value.exists, version, signature: value.signature }
}

function normalizeOperation(value: unknown): BookmarkTransactionOperation | null {
  if (!isRecord(value)) return null
  const operationId = typeof value.operationId === 'string' ? value.operationId.trim() : ''
  const kind = typeof value.kind === 'string' ? value.kind.trim() : ''
  if (!operationId || !kind || !Array.isArray(value.entityRefs)) return null
  const entityRefs = value.entityRefs.map(normalizeRef).filter((ref): ref is BookmarkTransactionEntityRef => !!ref)
  if (entityRefs.length === 0) return null
  const payload = toBookmarkAiJsonValue(value.payload)
  return payload === undefined ? null : { operationId, kind, entityRefs, payload }
}

export function normalizeBookmarkApprovalEntry(
  value: unknown,
  options: { now?: number; fromPersistence?: boolean } = {}
): BookmarkApprovalEntry | null {
  if (!isRecord(value)) return null
  const now = options.now ?? Date.now()
  const proposalId = typeof value.proposalId === 'string' ? value.proposalId.trim() : ''
  if (!proposalId || !Array.isArray(value.operations) || !Array.isArray(value.frozenEntities)) return null
  const operations = value.operations
    .map(normalizeOperation)
    .filter((operation): operation is BookmarkTransactionOperation => !!operation)
  if (operations.length === 0 || new Set(operations.map((item) => item.operationId)).size !== operations.length) {
    return null
  }
  const frozenEntities = value.frozenEntities
    .map(normalizeFrozen)
    .filter((entity): entity is FrozenBookmarkEntity => !!entity)
  const createdAt = timestamp(value.createdAt, now)
  const updatedAt = timestamp(value.updatedAt, createdAt)
  const expiresAt = timestamp(value.expiresAt, createdAt + BOOKMARK_APPROVAL_RETENTION_MS)
  const rawStatus = typeof value.status === 'string' && STATUSES.has(value.status as BookmarkApprovalStatus)
    ? value.status as BookmarkApprovalStatus
    : 'prepared'
  const interrupted = options.fromPersistence && rawStatus === 'executing'
  const status: BookmarkApprovalStatus = interrupted ? 'failed' : rawStatus

  const rawExecution = isRecord(value.execution) ? value.execution : null
  const records = Array.isArray(rawExecution?.records)
    ? rawExecution.records.flatMap((record) => {
        if (!isRecord(record) || typeof record.operationId !== 'string') return []
        const before = Array.isArray(record.before)
          ? record.before.map(normalizeFrozen).filter((item): item is FrozenBookmarkEntity => !!item)
          : []
        const after = Array.isArray(record.after)
          ? record.after.map(normalizeFrozen).filter((item): item is FrozenBookmarkEntity => !!item)
          : []
        const undoPayload = toBookmarkAiJsonValue(record.undoPayload)
        if (undoPayload === undefined || before.length === 0 || after.length === 0) return []
        return [{
          operationId: record.operationId,
          before,
          after,
          undoPayload,
          appliedAt: timestamp(record.appliedAt, updatedAt)
        }]
      })
    : []
  const execution = rawExecution
    ? {
        startedAt: timestamp(rawExecution.startedAt, updatedAt),
        ...(typeof rawExecution.completedAt === 'number' ? { completedAt: rawExecution.completedAt } : {}),
        records,
        ...(typeof rawExecution.error === 'string' ? { error: rawExecution.error } : {}),
        ...(interrupted ? { error: '应用刷新时检测到未完成执行，需要重新校验后重试。' } : {})
      }
    : undefined
  const rawUndo = isRecord(value.undo) ? value.undo : null
  const undo = rawUndo
    ? {
        available: Boolean(rawUndo.available),
        undoneOperationIds: Array.isArray(rawUndo.undoneOperationIds)
          ? rawUndo.undoneOperationIds.filter((id): id is string => typeof id === 'string')
          : [],
        ...(typeof rawUndo.completedAt === 'number' ? { completedAt: rawUndo.completedAt } : {}),
        ...(typeof rawUndo.error === 'string' ? { error: rawUndo.error } : {})
      }
    : undefined
  const persistedPending = options.fromPersistence && (status === 'prepared' || status === 'failed' || status === 'completed')
  const finalStatus: BookmarkApprovalStatus = expiresAt <= now && status !== 'undone' ? 'expired' : status

  return {
    proposalId,
    ...(typeof value.conversationId === 'string' && value.conversationId.trim()
      ? { conversationId: value.conversationId.trim() }
      : {}),
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 240) : '',
    status: finalStatus,
    operations,
    frozenEntities,
    validation: finalStatus === 'expired'
      ? { state: 'invalid', reason: '审批计划已过期。' }
      : persistedPending
      ? { state: 'required', reason: '刷新后必须重新校验书签库状态。' }
      : isRecord(value.validation) && value.validation.state === 'invalid'
        ? { state: 'invalid', reason: typeof value.validation.reason === 'string' ? value.validation.reason : undefined }
        : { state: 'valid', validatedAt: timestamp(isRecord(value.validation) ? value.validation.validatedAt : null, updatedAt) },
    ...(execution ? { execution } : {}),
    ...(undo ? { undo } : {}),
    createdAt,
    updatedAt,
    expiresAt
  }
}

export function pruneBookmarkApprovalJournal(
  journal: Record<string, BookmarkApprovalEntry>,
  now = Date.now()
): Record<string, BookmarkApprovalEntry> {
  const cutoff = now - BOOKMARK_APPROVAL_RETENTION_MS
  const entries = Object.values(journal)
    .filter((entry) => entry.updatedAt >= cutoff && (entry.status === 'expired' || entry.expiresAt > now))
    .sort((left, right) => right.updatedAt - left.updatedAt || right.proposalId.localeCompare(left.proposalId))
    .slice(0, BOOKMARK_APPROVAL_MAX_ENTRIES)
  return Object.fromEntries(entries.map((entry) => [entry.proposalId, entry]))
}

export function normalizeBookmarkApprovalJournal(
  value: unknown,
  options: { now?: number; fromPersistence?: boolean } = {}
): Record<string, BookmarkApprovalEntry> {
  if (!isRecord(value)) return {}
  const normalized = Object.fromEntries(
    Object.values(value).flatMap((entry) => {
      const next = normalizeBookmarkApprovalEntry(entry, options)
      return next ? [[next.proposalId, next]] : []
    })
  )
  return pruneBookmarkApprovalJournal(normalized, options.now)
}
