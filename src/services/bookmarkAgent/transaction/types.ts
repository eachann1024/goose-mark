import type { BookmarkAiJsonValue } from '@/lib/bookmarkAiMessages'

export type BookmarkApprovalStatus =
  | 'prepared'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'undone'
  | 'expired'

export type BookmarkTransactionEntityType = 'bookmark' | 'group' | 'subGroup'

export interface BookmarkTransactionEntityRef {
  type: BookmarkTransactionEntityType
  id: string
  /** subGroup 使用所属 group id，避免不同父级下的 id 语义不明确。 */
  parentId?: string
}

export interface BookmarkTransactionEntityState {
  version: string | number | null
  value: BookmarkAiJsonValue
}

export interface FrozenBookmarkEntity {
  ref: BookmarkTransactionEntityRef
  exists: boolean
  version: string | number | null
  signature: string
}

export interface BookmarkTransactionOperation {
  operationId: string
  kind: string
  entityRefs: BookmarkTransactionEntityRef[]
  payload: BookmarkAiJsonValue
}

export interface BookmarkTransactionExecutionRecord {
  operationId: string
  before: FrozenBookmarkEntity[]
  after: FrozenBookmarkEntity[]
  undoPayload: BookmarkAiJsonValue
  appliedAt: number
}

export interface BookmarkApprovalValidation {
  state: 'required' | 'valid' | 'invalid'
  validatedAt?: number
  reason?: string
}

export interface BookmarkApprovalExecution {
  startedAt: number
  completedAt?: number
  records: BookmarkTransactionExecutionRecord[]
  error?: string
}

export interface BookmarkApprovalUndo {
  available: boolean
  undoneOperationIds: string[]
  completedAt?: number
  error?: string
}

export interface BookmarkApprovalEntry {
  proposalId: string
  conversationId?: string
  summary: string
  status: BookmarkApprovalStatus
  operations: BookmarkTransactionOperation[]
  frozenEntities: FrozenBookmarkEntity[]
  validation: BookmarkApprovalValidation
  execution?: BookmarkApprovalExecution
  undo?: BookmarkApprovalUndo
  createdAt: number
  updatedAt: number
  expiresAt: number
}

export interface BookmarkTransactionAdapter {
  readEntity: (
    ref: BookmarkTransactionEntityRef
  ) => BookmarkTransactionEntityState | null | Promise<BookmarkTransactionEntityState | null>
  /**
   * operationId 是幂等键。适配器必须保证相同 operationId 重试不会重复产生实体；
   * 返回值只包含本 operation 影响实体的精确补偿数据。
   */
  applyOperation: (
    operation: BookmarkTransactionOperation
  ) => BookmarkAiJsonValue | Promise<BookmarkAiJsonValue>
  /** undoOperation 同样必须按 operationId 幂等。 */
  undoOperation: (
    operation: BookmarkTransactionOperation,
    undoPayload: BookmarkAiJsonValue
  ) => void | Promise<void>
}

export interface BookmarkApprovalJournalPort {
  get: (proposalId: string) => BookmarkApprovalEntry | null
  list: () => BookmarkApprovalEntry[]
  put: (entry: BookmarkApprovalEntry) => void
  remove: (proposalId: string) => void
  cleanup: (now?: number) => void
}

export interface BookmarkApprovalPreflightResult {
  ok: boolean
  entry: BookmarkApprovalEntry
  conflicts: Array<{
    ref: BookmarkTransactionEntityRef
    expected: FrozenBookmarkEntity
    actual: FrozenBookmarkEntity
  }>
}
