export type BookmarkAiBudgetPartition =
  | 'system'
  | 'history'
  | 'explicitContext'
  | 'toolOutput'
  | 'outputReserve'

export type BookmarkAiBudgetLimits = Record<BookmarkAiBudgetPartition, number> & {
  totalCharacters: number
}

export const DEFAULT_BOOKMARK_AI_BUDGET: BookmarkAiBudgetLimits = {
  totalCharacters: 96_000,
  system: 12_000,
  history: 28_000,
  explicitContext: 24_000,
  toolOutput: 24_000,
  outputReserve: 8_000
}

export type BookmarkAiTextItem = {
  id: string
  content: string
}

export type BudgetedBookmarkAiTextItem = BookmarkAiTextItem & {
  originalCharacters: number
  allocatedCharacters: number
  truncated: boolean
}

export type BookmarkAiHistoryMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

const TRUNCATION_MARKER = '\n…[内容过长，已截断]…\n'
const ENTITY_ID_PATTERN = /\b(?:bookmarkId|groupId|subGroupId|proposalId|undoToken)\b\s*["']?\s*[:=]\s*["']?([a-zA-Z0-9][a-zA-Z0-9._:-]{1,127})/g
const BARE_ENTITY_ID_PATTERN = /\b(?:bookmark|group|subgroup|proposal|undo)-[a-zA-Z0-9._:-]{2,128}\b/gi

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} 必须是非负有限数字`)
  }
  return Math.floor(value)
}

export function createBookmarkAiBudgetLimits(
  overrides: Partial<BookmarkAiBudgetLimits> = {}
): BookmarkAiBudgetLimits {
  const limits = { ...DEFAULT_BOOKMARK_AI_BUDGET, ...overrides }
  const normalized: BookmarkAiBudgetLimits = {
    totalCharacters: nonNegativeInteger(limits.totalCharacters, 'totalCharacters'),
    system: nonNegativeInteger(limits.system, 'system'),
    history: nonNegativeInteger(limits.history, 'history'),
    explicitContext: nonNegativeInteger(limits.explicitContext, 'explicitContext'),
    toolOutput: nonNegativeInteger(limits.toolOutput, 'toolOutput'),
    outputReserve: nonNegativeInteger(limits.outputReserve, 'outputReserve')
  }
  const partitionTotal = normalized.system
    + normalized.history
    + normalized.explicitContext
    + normalized.toolOutput
    + normalized.outputReserve
  if (partitionTotal > normalized.totalCharacters) {
    throw new Error('AI 字符预算分区总和不能超过 totalCharacters')
  }
  return normalized
}

export function extractBookmarkAiEntityIds(text: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => {
    const normalized = id.replace(/["'`,;，。]+$/g, '')
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    ids.push(normalized)
  }
  for (const match of text.matchAll(ENTITY_ID_PATTERN)) add(match[1])
  for (const match of text.matchAll(BARE_ENTITY_ID_PATTERN)) add(match[0])
  return ids
}

export function truncateBookmarkAiText(
  text: string,
  characterBudget: number,
  options: { entityIds?: string[] } = {}
): string {
  const budget = nonNegativeInteger(characterBudget, 'characterBudget')
  if (text.length <= budget) return text
  if (budget === 0) return ''

  const entityIds = [...new Set([
    ...extractBookmarkAiEntityIds(text),
    ...(options.entityIds ?? []).filter(Boolean)
  ])]
  let entitySuffix = ''
  for (const id of entityIds) {
    const next = entitySuffix
      ? `${entitySuffix}, ${id}`
      : `\n[关键实体 id: ${id}`
    if (`${next}]`.length + TRUNCATION_MARKER.length >= budget) break
    entitySuffix = next
  }
  if (entitySuffix) entitySuffix += ']'

  const available = budget - TRUNCATION_MARKER.length - entitySuffix.length
  if (available <= 0) {
    return (entitySuffix || text.slice(-budget)).slice(0, budget)
  }
  const headLength = Math.ceil(available / 2)
  const tailLength = available - headLength
  return `${text.slice(0, headLength)}${TRUNCATION_MARKER}${tailLength ? text.slice(-tailLength) : ''}${entitySuffix}`
}

function allocateFairShares(lengths: number[], characterBudget: number) {
  const shares = lengths.map(() => 0)
  let remaining = Math.max(0, characterBudget)
  let active = lengths.map((length, index) => ({ length, index }))

  while (remaining > 0 && active.length > 0) {
    const share = Math.max(1, Math.floor(remaining / active.length))
    const nextActive: typeof active = []
    let spent = 0
    for (const item of active) {
      if (remaining - spent <= 0) {
        nextActive.push(item)
        continue
      }
      const need = item.length - shares[item.index]
      const grant = Math.min(need, share, remaining - spent)
      shares[item.index] += grant
      spent += grant
      if (shares[item.index] < item.length) nextActive.push(item)
    }
    if (spent === 0) break
    remaining -= spent
    active = nextActive
  }
  return shares
}

export function allocateFairBookmarkAiTextItems(
  items: BookmarkAiTextItem[],
  characterBudget: number,
  separator = '\n\n'
): { text: string; items: BudgetedBookmarkAiTextItem[]; usedCharacters: number } {
  const budget = nonNegativeInteger(characterBudget, 'characterBudget')
  const normalized = items.map((item) => ({ ...item, content: item.content.trim() }))
  const nonEmptyCount = normalized.filter((item) => item.content).length
  const separatorBudget = Math.min(budget, Math.max(0, nonEmptyCount - 1) * separator.length)
  const shares = allocateFairShares(
    normalized.map((item) => item.content.length),
    budget - separatorBudget
  )
  const budgetedItems = normalized.map((item, index): BudgetedBookmarkAiTextItem => ({
    ...item,
    content: item.content.slice(0, shares[index]),
    originalCharacters: item.content.length,
    allocatedCharacters: shares[index],
    truncated: shares[index] < item.content.length
  }))
  const text = budgetedItems.map((item) => item.content).filter(Boolean).join(separator).slice(0, budget)
  return { text, items: budgetedItems, usedCharacters: text.length }
}

export function selectRecentBookmarkAiHistory(
  messages: BookmarkAiHistoryMessage[],
  characterBudget: number
): {
  messages: BookmarkAiHistoryMessage[]
  omittedCount: number
  preservedEntityIds: string[]
  latestUserPreserved: boolean
} {
  const budget = nonNegativeInteger(characterBudget, 'characterBudget')
  if (budget === 0 || messages.length === 0) {
    return { messages: [], omittedCount: messages.length, preservedEntityIds: [], latestUserPreserved: false }
  }

  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }
  const selected = new Map<number, BookmarkAiHistoryMessage>()
  let remaining = budget
  const recentEntityIds = extractBookmarkAiEntityIds(
    messages.slice(Math.max(0, messages.length - 6)).map((message) => message.content).join('\n')
  )

  if (latestUserIndex >= 0) {
    const message = messages[latestUserIndex]
    const reserved = Math.min(remaining, Math.max(1, Math.ceil(budget / 2)))
    const content = truncateBookmarkAiText(message.content, reserved, { entityIds: recentEntityIds })
    selected.set(latestUserIndex, { ...message, content })
    remaining -= content.length
  }

  for (let index = messages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (selected.has(index)) continue
    const message = messages[index]
    const content = message.content.length <= remaining
      ? message.content
      : truncateBookmarkAiText(message.content, remaining)
    if (!content) continue
    selected.set(index, { ...message, content })
    remaining -= content.length
  }

  const selectedMessages = [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, message]) => message)
  return {
    messages: selectedMessages,
    omittedCount: messages.length - selectedMessages.length,
    preservedEntityIds: recentEntityIds,
    latestUserPreserved: latestUserIndex >= 0 && selected.has(latestUserIndex)
  }
}

export function budgetBookmarkAiInput(params: {
  system: string
  history: BookmarkAiHistoryMessage[]
  explicitContext?: BookmarkAiTextItem[]
  toolOutput?: BookmarkAiTextItem[]
  limits?: Partial<BookmarkAiBudgetLimits>
}) {
  const limits = createBookmarkAiBudgetLimits(params.limits)
  const system = truncateBookmarkAiText(params.system, limits.system)
  const history = selectRecentBookmarkAiHistory(params.history, limits.history)
  const explicitContext = allocateFairBookmarkAiTextItems(
    params.explicitContext ?? [],
    limits.explicitContext
  )
  const toolOutput = allocateFairBookmarkAiTextItems(
    params.toolOutput ?? [],
    limits.toolOutput
  )
  return {
    limits,
    system,
    history,
    explicitContext,
    toolOutput,
    outputReserveCharacters: limits.outputReserve,
    usedInputCharacters: system.length
      + history.messages.reduce((sum, message) => sum + message.content.length, 0)
      + explicitContext.usedCharacters
      + toolOutput.usedCharacters
  }
}
