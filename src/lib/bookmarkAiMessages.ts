export type BookmarkAiRole = 'user' | 'assistant'

export type BookmarkAiTerminalToolStatus = 'done' | 'error' | 'denied' | 'cancelled'

export type BookmarkAiApprovalStatus =
  | 'prepared'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'undone'
  | 'expired'

export type BookmarkAiJsonValue =
  | string
  | number
  | boolean
  | null
  | BookmarkAiJsonValue[]
  | { [key: string]: BookmarkAiJsonValue }

export interface BookmarkAiToolTrace {
  id: string
  tool: string
  status: BookmarkAiTerminalToolStatus
  input?: BookmarkAiJsonValue
  output?: BookmarkAiJsonValue
  error?: string
}

export interface BookmarkAiMessage {
  id: string
  role: BookmarkAiRole
  content: string
  createdAt: number
  tools?: BookmarkAiToolTrace[]
  /** 指向独立持久化 journal；消息本身不复制 proposal/undo payload。 */
  approval?: {
    proposalId: string
    status: BookmarkAiApprovalStatus
  }
}

const TERMINAL_TOOL_STATUSES = new Set<BookmarkAiTerminalToolStatus>([
  'done',
  'error',
  'denied',
  'cancelled'
])

const TOOL_STATUS_ALIASES: Record<string, BookmarkAiTerminalToolStatus | undefined> = {
  done: 'done',
  error: 'error',
  denied: 'denied',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  'output-available': 'done',
  'output-error': 'error',
  'output-denied': 'denied'
}

const APPROVAL_STATUSES = new Set<BookmarkAiApprovalStatus>([
  'prepared',
  'executing',
  'completed',
  'failed',
  'undone',
  'expired'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const safeTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

/**
 * 将任意工具输入/输出收敛到 JSON 可序列化值。循环引用、函数、Symbol、
 * undefined 和过深节点会被移除，避免一次异常工具结果破坏整份会话存储。
 */
export function toBookmarkAiJsonValue(value: unknown): BookmarkAiJsonValue | undefined {
  const seen = new WeakSet<object>()

  const visit = (current: unknown, depth: number): BookmarkAiJsonValue | undefined => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current
    if (typeof current === 'number') return Number.isFinite(current) ? current : undefined
    if (typeof current === 'bigint') return current.toString()
    if (depth > 16 || typeof current !== 'object') return undefined
    if (seen.has(current)) return undefined
    seen.add(current)

    if (Array.isArray(current)) {
      const result = current
        .map((item) => visit(item, depth + 1))
        .filter((item): item is BookmarkAiJsonValue => item !== undefined)
      seen.delete(current)
      return result
    }

    const result: Record<string, BookmarkAiJsonValue> = {}
    for (const [key, item] of Object.entries(current)) {
      const normalized = visit(item, depth + 1)
      if (normalized !== undefined) result[key] = normalized
    }
    seen.delete(current)
    return result
  }

  return visit(value, 0)
}

function normalizeToolTrace(value: unknown, index: number): BookmarkAiToolTrace | null {
  if (!isRecord(value)) return null
  const rawStatus = typeof value.status === 'string' ? value.status : ''
  const status = TOOL_STATUS_ALIASES[rawStatus]
  if (!status || !TERMINAL_TOOL_STATUSES.has(status)) return null

  const tool = typeof value.tool === 'string' ? value.tool.trim() : ''
  if (!tool) return null
  const idCandidate =
    typeof value.id === 'string' && value.id.trim()
      ? value.id.trim()
      : typeof value.toolCallId === 'string' && value.toolCallId.trim()
        ? value.toolCallId.trim()
        : `${tool}-${index}`
  const input = toBookmarkAiJsonValue(value.input)
  const output = toBookmarkAiJsonValue(value.output)
  const error = typeof value.error === 'string'
    ? value.error
    : typeof value.errorText === 'string'
      ? value.errorText
      : undefined

  return {
    id: idCandidate,
    tool,
    status,
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {})
  }
}

function normalizeMessage(value: unknown, index: number, now: number): BookmarkAiMessage | null {
  if (!isRecord(value)) return null
  if (value.role !== 'user' && value.role !== 'assistant') return null

  const content = typeof value.content === 'string' ? value.content : ''
  const rawTools = Array.isArray(value.tools)
    ? value.tools
    : Array.isArray(value.toolTrace)
      ? value.toolTrace
      : []
  const tools = rawTools
    .map((tool, toolIndex) => normalizeToolTrace(tool, toolIndex))
    .filter((tool): tool is BookmarkAiToolTrace => tool !== null)
  const approval = isRecord(value.approval) &&
    typeof value.approval.proposalId === 'string' &&
    value.approval.proposalId.trim() &&
    typeof value.approval.status === 'string' &&
    APPROVAL_STATUSES.has(value.approval.status as BookmarkAiApprovalStatus)
    ? {
        proposalId: value.approval.proposalId.trim(),
        status: value.approval.status as BookmarkAiApprovalStatus
      }
    : undefined

  // 纯运行中占位或未知未来消息不能进入持久化历史。
  if (value.role === 'assistant' && !content.trim() && tools.length === 0 && !approval) return null

  return {
    id:
      typeof value.id === 'string' && value.id.trim()
        ? value.id.trim()
        : `recovered-message-${now}-${index}`,
    role: value.role,
    content,
    createdAt: safeTimestamp(value.createdAt, now),
    ...(tools.length > 0 ? { tools } : {}),
    ...(approval ? { approval } : {})
  }
}

/**
 * 持久化边界：仅保留 user/assistant 文本和已经终止的工具轨迹。
 * running/call/input-streaming 等状态会被移除，空的 assistant 占位也会清理。
 */
export function sanitizeBookmarkAiMessagesForPersistence(
  messages: unknown,
  options: { now?: number; limit?: number } = {}
): BookmarkAiMessage[] {
  if (!Array.isArray(messages)) return []
  const now = options.now ?? Date.now()
  const limit = Math.max(0, options.limit ?? Number.POSITIVE_INFINITY)
  return messages
    .map((message, index) => normalizeMessage(message, index, now))
    .filter((message): message is BookmarkAiMessage => message !== null)
    .slice(-limit)
}
