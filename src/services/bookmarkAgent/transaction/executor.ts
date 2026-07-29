import { toBookmarkAiJsonValue } from '@/lib/bookmarkAiMessages'
import { BOOKMARK_APPROVAL_RETENTION_MS } from './journal'
import {
  bookmarkTransactionEntityKey,
  freezeBookmarkEntities,
  frozenBookmarkEntitiesMatch
} from './signature'
import type {
  BookmarkApprovalEntry,
  BookmarkApprovalJournalPort,
  BookmarkApprovalPreflightResult,
  BookmarkTransactionAdapter,
  BookmarkTransactionOperation,
  FrozenBookmarkEntity
} from './types'

const errorText = (error: unknown) =>
  error instanceof Error && error.message.trim() ? error.message.trim() : '事务执行失败'

function expectedEntityStates(entry: BookmarkApprovalEntry): FrozenBookmarkEntity[] {
  const expected = new Map(entry.frozenEntities.map((item) => [bookmarkTransactionEntityKey(item.ref), item]))
  for (const record of entry.execution?.records ?? []) {
    for (const item of record.after) expected.set(bookmarkTransactionEntityKey(item.ref), item)
  }
  return [...expected.values()]
}

export async function prepareBookmarkApprovalProposal(
  input: {
    proposalId: string
    conversationId?: string
    summary: string
    operations: BookmarkTransactionOperation[]
    now?: number
  },
  port: BookmarkApprovalJournalPort,
  adapter: BookmarkTransactionAdapter
): Promise<BookmarkApprovalEntry> {
  const proposalId = input.proposalId.trim()
  if (!proposalId) throw new Error('proposalId 不能为空')
  if (input.operations.length === 0) throw new Error('审批计划至少需要一个 operation')
  const operationIds = input.operations.map((operation) => operation.operationId.trim())
  if (operationIds.some((id) => !id) || new Set(operationIds).size !== operationIds.length) {
    throw new Error('operationId 必须非空且在 proposal 内唯一')
  }
  const now = input.now ?? Date.now()
  const frozenEntities = await freezeBookmarkEntities(
    input.operations.flatMap((operation) => operation.entityRefs),
    adapter
  )
  const entry: BookmarkApprovalEntry = {
    proposalId,
    ...(input.conversationId?.trim() ? { conversationId: input.conversationId.trim() } : {}),
    summary: input.summary.trim().slice(0, 240),
    status: 'prepared',
    operations: input.operations,
    frozenEntities,
    validation: { state: 'valid', validatedAt: now },
    createdAt: now,
    updatedAt: now,
    expiresAt: now + BOOKMARK_APPROVAL_RETENTION_MS
  }
  port.put(entry)
  return entry
}

export async function preflightBookmarkApprovalProposal(
  proposalId: string,
  port: BookmarkApprovalJournalPort,
  adapter: BookmarkTransactionAdapter,
  now = Date.now()
): Promise<BookmarkApprovalPreflightResult> {
  const entry = port.get(proposalId)
  if (!entry) throw new Error('审批计划不存在或已被清理')
  if (entry.expiresAt <= now || entry.status === 'expired') {
    const expired = { ...entry, status: 'expired' as const, updatedAt: now }
    port.put(expired)
    return { ok: false, entry: expired, conflicts: [] }
  }
  const expected = expectedEntityStates(entry)
  const actual = await freezeBookmarkEntities(expected.map((item) => item.ref), adapter)
  const actualByKey = new Map(actual.map((item) => [bookmarkTransactionEntityKey(item.ref), item]))
  const conflicts = expected.flatMap((item) => {
    const current = actualByKey.get(bookmarkTransactionEntityKey(item.ref))!
    return frozenBookmarkEntitiesMatch(item, current) ? [] : [{ ref: item.ref, expected: item, actual: current }]
  })
  const next: BookmarkApprovalEntry = {
    ...entry,
    validation: conflicts.length > 0
      ? { state: 'invalid', validatedAt: now, reason: '受影响的书签或分组已变化，请重新生成计划。' }
      : { state: 'valid', validatedAt: now },
    updatedAt: now
  }
  port.put(next)
  return { ok: conflicts.length === 0, entry: next, conflicts }
}

export async function executeBookmarkApprovalProposal(
  proposalId: string,
  port: BookmarkApprovalJournalPort,
  adapter: BookmarkTransactionAdapter,
  now = Date.now()
): Promise<BookmarkApprovalEntry> {
  const existing = port.get(proposalId)
  if (!existing) throw new Error('审批计划不存在或已被清理')
  if (existing.status === 'completed') return existing
  if (existing.status === 'undone' || existing.status === 'expired') throw new Error('审批计划已不可执行')

  const preflight = await preflightBookmarkApprovalProposal(proposalId, port, adapter, now)
  if (!preflight.ok) throw new Error(preflight.entry.validation.reason ?? '审批计划预检失败')
  const previousExecution = preflight.entry.execution
  let entry: BookmarkApprovalEntry = {
    ...preflight.entry,
    status: 'executing',
    execution: {
      startedAt: previousExecution?.startedAt ?? now,
      records: previousExecution?.records ?? []
    },
    updatedAt: now
  }
  port.put(entry)

  try {
    for (const operation of entry.operations) {
      if (entry.execution?.records.some((record) => record.operationId === operation.operationId)) continue
      const before = await freezeBookmarkEntities(operation.entityRefs, adapter)
      const rawUndoPayload = await adapter.applyOperation(operation)
      const undoPayload = toBookmarkAiJsonValue(rawUndoPayload)
      if (undoPayload === undefined) throw new Error(`operation ${operation.operationId} 未返回可序列化 undo payload`)
      const after = await freezeBookmarkEntities(operation.entityRefs, adapter)
      const appliedAt = Date.now()
      entry = {
        ...entry,
        execution: {
          startedAt: entry.execution?.startedAt ?? now,
          records: [
            ...(entry.execution?.records ?? []),
            { operationId: operation.operationId, before, after, undoPayload, appliedAt }
          ]
        },
        updatedAt: appliedAt
      }
      port.put(entry)
    }
    const completedAt = Date.now()
    entry = {
      ...entry,
      status: 'completed',
      execution: { ...entry.execution!, completedAt },
      undo: { available: true, undoneOperationIds: [] },
      updatedAt: completedAt
    }
    port.put(entry)
    return entry
  } catch (error) {
    const failedAt = Date.now()
    entry = {
      ...entry,
      status: 'failed',
      validation: { state: 'required', reason: '失败后重试前必须重新校验。' },
      execution: {
        ...(entry.execution ?? { startedAt: now, records: [] }),
        error: errorText(error)
      },
      updatedAt: failedAt
    }
    port.put(entry)
    throw error
  }
}

export async function undoBookmarkApprovalProposal(
  proposalId: string,
  port: BookmarkApprovalJournalPort,
  adapter: BookmarkTransactionAdapter
): Promise<BookmarkApprovalEntry> {
  let entry = port.get(proposalId)
  if (!entry) throw new Error('审批计划不存在或已被清理')
  if (entry.status === 'undone') return entry
  const records = entry.execution?.records ?? []
  if ((entry.status !== 'completed' && entry.status !== 'failed') || records.length === 0) {
    throw new Error('当前审批计划没有可撤回的执行记录')
  }
  const operationById = new Map(entry.operations.map((operation) => [operation.operationId, operation]))
  const undone = new Set(entry.undo?.undoneOperationIds ?? [])

  for (const record of [...records].reverse()) {
    if (undone.has(record.operationId)) continue
    const operation = operationById.get(record.operationId)
    if (!operation) throw new Error(`缺少 operation ${record.operationId}`)
    const current = await freezeBookmarkEntities(record.after.map((item) => item.ref), adapter)
    const currentByKey = new Map(current.map((item) => [bookmarkTransactionEntityKey(item.ref), item]))
    const conflict = record.after.some((expected) => {
      const actual = currentByKey.get(bookmarkTransactionEntityKey(expected.ref))!
      return !frozenBookmarkEntitiesMatch(expected, actual)
    })
    if (conflict) {
      const reason = `operation ${record.operationId} 的实体已被修改，拒绝撤回。`
      entry = {
        ...entry,
        validation: { state: 'invalid', reason },
        undo: { available: false, undoneOperationIds: [...undone], error: reason },
        updatedAt: Date.now()
      }
      port.put(entry)
      throw new Error(reason)
    }

    await adapter.undoOperation(operation, record.undoPayload)
    const restored = await freezeBookmarkEntities(record.before.map((item) => item.ref), adapter)
    const restoredByKey = new Map(restored.map((item) => [bookmarkTransactionEntityKey(item.ref), item]))
    const restoreFailed = record.before.some((expected) => {
      const actual = restoredByKey.get(bookmarkTransactionEntityKey(expected.ref))!
      return !frozenBookmarkEntitiesMatch(expected, actual)
    })
    if (restoreFailed) throw new Error(`operation ${record.operationId} 未能精确恢复受影响实体`)
    undone.add(record.operationId)
    entry = {
      ...entry,
      undo: { available: true, undoneOperationIds: [...undone] },
      updatedAt: Date.now()
    }
    port.put(entry)
  }

  const completedAt = Date.now()
  entry = {
    ...entry,
    status: 'undone',
    undo: { available: false, undoneOperationIds: [...undone], completedAt },
    updatedAt: completedAt
  }
  port.put(entry)
  return entry
}

export function expireBookmarkApprovalProposal(
  proposalId: string,
  port: BookmarkApprovalJournalPort,
  now = Date.now()
): BookmarkApprovalEntry | null {
  const entry = port.get(proposalId)
  if (!entry) return null
  const expired = {
    ...entry,
    status: 'expired' as const,
    validation: { state: 'invalid' as const, reason: '审批计划已过期。' },
    updatedAt: now
  }
  port.put(expired)
  return expired
}
