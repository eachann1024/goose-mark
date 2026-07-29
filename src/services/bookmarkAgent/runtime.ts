import type { ModelMessage } from 'ai'
import {
  DEFAULT_BOOKMARK_AI_BUDGET,
  selectRecentBookmarkAiHistory,
  truncateBookmarkAiText
} from '@/lib/bookmarkAiBudget'

export const DEFAULT_AGENT_IDLE_TIMEOUT_MS = 60_000
export const DEFAULT_HISTORY_CHARACTER_BUDGET = DEFAULT_BOOKMARK_AI_BUDGET.history
export const DEFAULT_CONTEXT_CHARACTER_BUDGET = DEFAULT_BOOKMARK_AI_BUDGET.explicitContext
export const DEFAULT_TOOL_RESULT_CHARACTER_BUDGET = DEFAULT_BOOKMARK_AI_BUDGET.toolOutput
export const MAX_AGENT_GLOBAL_PROMPT_CHARACTERS = 24_000
export const MAX_AGENT_IMAGE_COUNT = 4
export const MAX_AGENT_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_AGENT_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024

const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
])

const IDENTIFIER_PATTERN = /(?:https?:\/\/[^\s"'<>]+|\b(?:[a-z]{1,12}:)?[a-z0-9][a-z0-9_-]{5,}\b)/gi

export type BookmarkAgentErrorCode =
  | 'authentication'
  | 'rate_limit'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unsupported_tools'
  | 'invalid_tool_input'
  | 'invalid_payload'
  | 'unsupported_image_input'
  | 'unknown'

export type BookmarkAgentProgressPhase =
  | 'starting'
  | 'thinking'
  | 'generating'
  | 'tool'
  | 'finishing'
  | 'interrupted'
  | 'error'

export interface BookmarkAgentProgressEvent {
  requestId: string
  phase: BookmarkAgentProgressPhase
  at: number
  step?: number
  text?: string
  reasoningText?: string
  detail?: string
}

export interface BookmarkAgentTextDeltaEvent {
  requestId: string
  delta: string
  /** 本轮 fullStream 已累计且去重后的正文。 */
  text: string
  step: number
  at: number
}

export function createBookmarkAgentTextAccumulator(input: {
  requestId: string
  onDelta?: (event: BookmarkAgentTextDeltaEvent) => void
}) {
  let text = ''
  return {
    append(delta: string, step: number) {
      if (!delta) return text
      text += delta
      input.onDelta?.({
        requestId: input.requestId,
        delta,
        text,
        step: Math.max(1, step),
        at: Date.now()
      })
      return text
    },
    getText: () => text
  }
}

export interface RuntimeToolEvent {
  id: string
  requestId: string
  toolCallId: string
  tool: string
  label: string
  detail: string
  status: 'running' | 'done' | 'error'
  input?: unknown
  output?: unknown
  error?: { code: BookmarkAgentErrorCode; message: string }
  startedAt: number
  updatedAt: number
  finishedAt?: number
  durationMs?: number
}

export interface AgentHistoryMessageLike {
  role: 'user' | 'assistant'
  content: string
}

export interface BookmarkAgentReference {
  id?: string
  type?: string
  label?: string
  url?: string
  content?: string
}

export interface BookmarkAgentImagePayload {
  data?: string | Uint8Array | ArrayBuffer
  dataUrl?: string
  mediaType: string
  id?: string
  name?: string
  /** 可选声明值只用于额外校验，实际大小仍从 data 计算。 */
  size?: number
  fingerprint?: string
  sha256?: string
}

export interface NormalizedBookmarkAgentImage {
  image: string | Uint8Array | ArrayBuffer
  mediaType: string
  name?: string
  bytes: number
}

export type BookmarkAgentReasoningLevel =
  | 'default'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export interface BookmarkAgentSettingsOverride {
  modelId?: string
  reasoning?: BookmarkAgentReasoningLevel
  temperature?: number
}

export type BookmarkAgentInvokedSkill =
  | string
  | {
      id: string
      source?: 'builtin' | 'local'
      /** 本地 Skill 只作为说明文本注入，不能声明或开放工具。 */
      instructions?: string
    }

export interface BookmarkAgentTurnPayload {
  conversationId?: string
  references?: BookmarkAgentReference[]
  invokedSkill?: BookmarkAgentInvokedSkill
  images?: BookmarkAgentImagePayload[]
  globalPrompt?: string
  requiredCapabilities?: {
    imageInput: boolean
  }
}

export function resolveBookmarkAgentConversationId(input: {
  optionConversationId?: string
  payloadConversationId?: string
}) {
  const fromOptions = input.optionConversationId?.trim() || ''
  const fromPayload = input.payloadConversationId?.trim() || ''
  if (fromOptions && fromPayload && fromOptions !== fromPayload) {
    throw new Error('本轮 conversationId 与 payload.conversationId 不一致')
  }
  return fromOptions || fromPayload || null
}

export class BookmarkAgentRuntimeError extends Error {
  readonly code: BookmarkAgentErrorCode
  readonly recoverable: boolean
  readonly interrupted: boolean
  readonly partialText: string
  readonly completedSteps: number
  override readonly cause: unknown

  constructor(input: {
    code: BookmarkAgentErrorCode
    message: string
    cause: unknown
    recoverable: boolean
    interrupted?: boolean
    partialText?: string
    completedSteps?: number
  }) {
    super(input.message)
    this.name = 'BookmarkAgentRuntimeError'
    this.code = input.code
    this.recoverable = input.recoverable
    this.interrupted = !!input.interrupted
    this.partialText = input.partialText?.trim() ?? ''
    this.completedSteps = input.completedSteps ?? 0
    this.cause = input.cause
  }
}

function rawErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'AI 请求失败，请稍后重试'
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
  const value = candidate.status ?? candidate.statusCode ?? candidate.response?.status
  return typeof value === 'number' ? value : null
}

export function normalizeBookmarkAgentError(
  error: unknown,
  options: {
    aborted?: boolean
    timedOut?: boolean
    partialText?: string
    completedSteps?: number
  } = {}
) {
  if (error instanceof BookmarkAgentRuntimeError) return error

  const raw = rawErrorMessage(error)
  const lower = raw.toLowerCase()
  const status = errorStatus(error)
  let code: BookmarkAgentErrorCode = 'unknown'
  let message = raw
  let recoverable = true

  if (options.timedOut) {
    code = 'timeout'
    message = 'AI 响应超过 60 秒没有进展，本轮已停止。可保留已完成步骤后重试。'
  } else if (
    options.aborted ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    lower.includes('abort') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    code = 'aborted'
    message = '本轮任务已停止，已完成的文本和工具步骤可以保留后继续。'
  } else if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication') ||
    lower.includes('forbidden')
  ) {
    code = 'authentication'
    message = 'AI 服务鉴权失败，请检查 API Key、Base URL 和协议配置。'
    recoverable = false
  } else if (
    status === 429 ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota')
  ) {
    code = 'rate_limit'
    message = 'AI 服务请求过于频繁或额度不足，请稍后重试。'
  } else if (
    lower.includes('image') &&
    (lower.includes('not support') || lower.includes('unsupported') || lower.includes('does not support'))
  ) {
    code = 'unsupported_image_input'
    message = '当前模型或接口不支持图片输入，请切换到支持视觉输入的模型。'
    recoverable = false
  } else if (
    lower.includes('tool') &&
    (lower.includes('not support') || lower.includes('unsupported') || lower.includes('does not support'))
  ) {
    code = 'unsupported_tools'
    message = '当前模型或接口不支持 Agent 工具调用，请切换到支持原生工具调用的模型。'
    recoverable = false
  } else if (
    lower.includes('invalid tool') ||
    lower.includes('tool input') ||
    lower.includes('no such tool') ||
    lower.includes('tool arguments')
  ) {
    code = 'invalid_tool_input'
    message = '模型生成的工具参数无效，本轮未继续执行。请调整要求后重试。'
  } else if (
    lower.includes('图片') ||
    lower.includes('temperature') ||
    lower.includes('模型 id') ||
    lower.includes('推理强度') ||
    lower.includes('global prompt')
  ) {
    code = 'invalid_payload'
    message = raw
    recoverable = false
  } else if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('deadline exceeded')
  ) {
    code = 'timeout'
    message = 'AI 请求超时，请检查网络或稍后重试。'
  } else if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('econn') ||
    lower.includes('enotfound')
  ) {
    code = 'network'
    message = '无法连接 AI 服务，请检查 Base URL、网络或代理。'
  }

  const interrupted = code === 'aborted' || code === 'timeout' && !!options.timedOut
  return new BookmarkAgentRuntimeError({
    code,
    message,
    cause: error,
    recoverable,
    interrupted,
    partialText: options.partialText,
    completedSteps: options.completedSteps
  })
}

function collectIdentifiers(text: string, limit = 12) {
  return [...new Set(text.match(IDENTIFIER_PATTERN) ?? [])].slice(0, limit)
}

export function truncatePreservingIdentifiers(value: string, maxCharacters: number) {
  const text = value.trim()
  return truncateBookmarkAiText(text, Math.max(0, maxCharacters), {
    entityIds: collectIdentifiers(text)
  })
}

function allocateFairBudgets(lengths: number[], budget: number) {
  const allocations = new Array(lengths.length).fill(0)
  const pending = new Set(lengths.map((_length, index) => index))
  let remaining = Math.max(0, budget)

  while (pending.size > 0 && remaining > 0) {
    const share = Math.max(1, Math.floor(remaining / pending.size))
    let consumed = 0
    for (const index of [...pending]) {
      const need = lengths[index] - allocations[index]
      const grant = Math.min(need, share)
      allocations[index] += grant
      remaining -= grant
      consumed += grant
      if (allocations[index] >= lengths[index]) pending.delete(index)
    }
    if (consumed === 0) break
  }
  return allocations
}

export function budgetAgentHistory<T extends AgentHistoryMessageLike>(
  history: T[],
  maxCharacters = DEFAULT_HISTORY_CHARACTER_BUDGET
): T[] {
  const normalized = history
    .filter((message) => message && typeof message.content === 'string' && message.content.trim())
    .map((message) => ({ ...message, content: message.content.trim() }))
  if (!normalized.length) return []
  const budgeted = selectRecentBookmarkAiHistory(normalized, maxCharacters)
  return budgeted.messages as T[]
}

export function budgetStructuredValue(value: unknown, maxCharacters: number): unknown {
  if (typeof value === 'string') return truncatePreservingIdentifiers(value, maxCharacters)
  if (value == null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    if (!value.length) return []
    const serializedLengths = value.map((item) => {
      try {
        return JSON.stringify(item).length
      } catch {
        return 64
      }
    })
    const budgets = allocateFairBudgets(serializedLengths, maxCharacters)
    return value.map((item, index) => budgetStructuredValue(item, Math.max(32, budgets[index])))
  }

  const record = value as Record<string, unknown>
  // 二进制图片不计入字符预算，也绝不能按普通对象递归裁剪。
  if (record.type === 'image' && 'image' in record) return value
  if (record.type === 'file' && 'data' in record) return value

  const entries = Object.entries(record)
  if (!entries.length) return {}
  const structuralKeys = /^(?:id|.*Id|role|type|toolName|name|status)$/
  const structuralEntries = entries.filter(([key]) => structuralKeys.test(key))
  const budgetedEntries = entries.filter(([key]) => !structuralKeys.test(key))
  const structuralCost = structuralEntries.reduce((sum, [key, item]) => {
    try {
      return sum + key.length + JSON.stringify(item).length + 4
    } catch {
      return sum + key.length + 36
    }
  }, 0)
  const keyCost = budgetedEntries.reduce((sum, [key]) => sum + key.length + 4, 0)
  const valueBudget = Math.max(0, maxCharacters - structuralCost - keyCost)
  const lengths = budgetedEntries.map(([, item]) => {
    try {
      return JSON.stringify(item).length
    } catch {
      return 64
    }
  })
  const budgets = allocateFairBudgets(lengths, valueBudget)
  return Object.fromEntries(
    [
      ...structuralEntries,
      ...budgetedEntries.map(([key, item], index) => [
        key,
        budgetStructuredValue(item, Math.max(32, budgets[index]))
      ] as const)
    ]
  )
}

export function budgetModelMessages(
  messages: ModelMessage[],
  maxCharacters = DEFAULT_HISTORY_CHARACTER_BUDGET + DEFAULT_TOOL_RESULT_CHARACTER_BUDGET
) {
  const lengths = messages.map((message) => measureStructuredCharacters(message))
  if (lengths.reduce((sum, length) => sum + length, 0) <= maxCharacters) return messages

  const budgets = allocateFairBudgets(lengths, maxCharacters)
  return messages.map((message, index) =>
    budgetStructuredValue(message, Math.max(256, budgets[index])) as ModelMessage
  )
}

function measureStructuredCharacters(value: unknown): number {
  if (typeof value === 'string') return value.length
  if (value == null || typeof value !== 'object') return String(value ?? '').length
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + measureStructuredCharacters(item), 0)
  const record = value as Record<string, unknown>
  if (record.type === 'image' && 'image' in record) return 32
  if (record.type === 'file' && 'data' in record) return 32
  return Object.entries(record).reduce(
    (sum, [key, item]) => sum + key.length + measureStructuredCharacters(item),
    0
  )
}

export function buildReferencesContext(
  references: BookmarkAgentReference[] | undefined,
  maxCharacters = DEFAULT_CONTEXT_CHARACTER_BUDGET
) {
  const normalized = (references ?? [])
    .filter((reference) => reference && typeof reference === 'object')
    .slice(0, 24)
    .map((reference) => ({
      ...(reference.type?.trim() ? { type: reference.type.trim() } : {}),
      ...(reference.id?.trim() ? { id: reference.id.trim() } : {}),
      ...(reference.label?.trim() ? { label: reference.label.trim() } : {}),
      ...(reference.url?.trim() ? { url: reference.url.trim() } : {}),
      ...(reference.content?.trim() ? { content: reference.content.trim() } : {})
    }))
    .filter((reference) => Object.keys(reference).length > 0)
  if (!normalized.length) return ''

  const budgeted = budgetStructuredValue(normalized, maxCharacters)
  return `\n\n<bookmark-references data-only="true">\n${JSON.stringify(budgeted)}\n</bookmark-references>`
}

export function parseSlashSkill(content: string) {
  const match = content.trim().match(/^\/(?:skill\s+)?([a-zA-Z][\w-]*)\b/)
  return match?.[1] ?? null
}

function decodedBase64Bytes(value: string) {
  const normalized = value.replace(/\s+/g, '')
  if (!normalized || !/^[a-z0-9+/]*={0,2}$/i.test(normalized)) {
    throw new Error('图片数据必须是合法的 base64 或 data URL')
  }
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return { data: normalized, bytes: Math.max(0, Math.floor(normalized.length * 3 / 4) - padding) }
}

function normalizeImageData(image: BookmarkAgentImagePayload) {
  const inputData = image.data ?? image.dataUrl
  if (typeof inputData === 'string') {
    const dataUrl = inputData.match(/^data:([^;,]+);base64,([\s\S]+)$/i)
    if (dataUrl) {
      const declaredMediaType = dataUrl[1].toLowerCase()
      if (declaredMediaType !== image.mediaType.trim().toLowerCase()) {
        throw new Error(`图片“${image.name || '未命名'}”的 data URL 类型与 mediaType 不一致`)
      }
      return decodedBase64Bytes(dataUrl[2])
    }
    return decodedBase64Bytes(inputData)
  }
  if (inputData instanceof Uint8Array) {
    return { data: inputData, bytes: inputData.byteLength }
  }
  if (inputData instanceof ArrayBuffer) {
    return { data: inputData, bytes: inputData.byteLength }
  }
  throw new Error(`图片“${image.name || '未命名'}”缺少可用数据`)
}

export function validateBookmarkAgentRequiredCapabilities(payload: BookmarkAgentTurnPayload | undefined) {
  const hasImages = Boolean(payload?.images?.length)
  const requiresImageInput = payload?.requiredCapabilities?.imageInput
  if (requiresImageInput === true && !hasImages) {
    throw new Error('本轮声明需要图片输入，但没有提供图片')
  }
  if (requiresImageInput === false && hasImages) {
    throw new Error('本轮图片能力声明与实际附件不一致')
  }
}

export function normalizeBookmarkAgentImages(
  images: BookmarkAgentImagePayload[] | undefined
): NormalizedBookmarkAgentImage[] {
  if (!images?.length) return []
  if (images.length > MAX_AGENT_IMAGE_COUNT) {
    throw new Error(`一次最多上传 ${MAX_AGENT_IMAGE_COUNT} 张图片`)
  }

  let totalBytes = 0
  return images.map((image, index) => {
    const mediaType = image.mediaType?.trim().toLowerCase()
    if (!ALLOWED_IMAGE_MEDIA_TYPES.has(mediaType)) {
      throw new Error(`第 ${index + 1} 张图片格式不支持，仅允许 PNG、JPEG、WebP、GIF`)
    }
    const normalized = normalizeImageData(image)
    const declaredSize = typeof image.size === 'number' && Number.isFinite(image.size)
      ? Math.max(0, Math.floor(image.size))
      : 0
    const bytes = Math.max(normalized.bytes, declaredSize)
    if (bytes > MAX_AGENT_IMAGE_BYTES) {
      throw new Error(`图片“${image.name || `第 ${index + 1} 张`}”超过 10MB 限制`)
    }
    totalBytes += bytes
    if (totalBytes > MAX_AGENT_IMAGE_TOTAL_BYTES) {
      throw new Error('图片总大小超过 20MB 限制')
    }
    return {
      image: normalized.data,
      mediaType,
      ...(image.name?.trim() ? { name: image.name.trim() } : {}),
      bytes
    }
  })
}

export function normalizeBookmarkAgentSettingsOverride(
  override: BookmarkAgentSettingsOverride | undefined
): BookmarkAgentSettingsOverride {
  if (!override) return {}
  const modelId = override.modelId?.trim()
  if (modelId && modelId.length > 200) throw new Error('临时模型 ID 不能超过 200 个字符')
  const reasoning = override.reasoning ?? 'default'
  if (!['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(reasoning)) {
    throw new Error('临时推理强度不受支持')
  }
  let temperature: number | undefined
  if (override.temperature != null) {
    if (!Number.isFinite(override.temperature) || override.temperature < 0 || override.temperature > 2) {
      throw new Error('临时 temperature 必须在 0 到 2 之间')
    }
    temperature = override.temperature
  }
  return {
    ...(modelId ? { modelId } : {}),
    ...(reasoning !== 'default' ? { reasoning } : {}),
    ...(temperature != null ? { temperature } : {})
  }
}

export function buildBookmarkAgentGlobalPrompt(globalPrompt: string | undefined) {
  const prompt = globalPrompt?.trim()
  if (!prompt) return ''
  return truncatePreservingIdentifiers(prompt, MAX_AGENT_GLOBAL_PROMPT_CHARACTERS)
}

export function resolveBookmarkAgentSkillPolicy(input: {
  invokedSkill?: BookmarkAgentInvokedSkill
  latestUserText: string
  builtinToolAllowlist: Record<string, readonly string[]>
}) {
  const invoked = input.invokedSkill
  const slashSkill = parseSlashSkill(input.latestUserText)
  const requestedId = typeof invoked === 'string'
    ? invoked.trim()
    : invoked?.id?.trim() || slashSkill || ''
  const explicitlyLocal = typeof invoked === 'object' && invoked.source === 'local'
  const builtinSkill = !explicitlyLocal && requestedId in input.builtinToolAllowlist
    ? requestedId
    : null
  const localInstructions = typeof invoked === 'object' && invoked.instructions?.trim()
    ? truncatePreservingIdentifiers(invoked.instructions, 8_000)
    : ''

  return {
    builtinSkill,
    localSkillId: requestedId && !builtinSkill ? requestedId : null,
    localInstructions,
    // 本地 Skill 的任何自带工具声明都不会进入这里；唯一增权来源是内置 allowlist。
    allowedTools: builtinSkill ? [...input.builtinToolAllowlist[builtinSkill]] : null
  }
}

export function createLinkedIdleController(input: {
  externalSignal?: AbortSignal
  timeoutMs?: number
  onIdleTimeout?: () => void
}) {
  const controller = new AbortController()
  const timeoutMs = Math.max(1, input.timeoutMs ?? DEFAULT_AGENT_IDLE_TIMEOUT_MS)
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const onExternalAbort = () => controller.abort(input.externalSignal?.reason)
  if (input.externalSignal?.aborted) onExternalAbort()
  else input.externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

  const touch = () => {
    if (controller.signal.aborted) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      input.onIdleTimeout?.()
      controller.abort(new DOMException('Agent idle timeout', 'TimeoutError'))
    }, timeoutMs)
  }
  touch()

  return {
    signal: controller.signal,
    touch,
    isTimedOut: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer)
      input.externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }
}

export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted', 'AbortError'))

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

export function createToolEventTracker(input: {
  requestId: string
  onEvent?: (event: RuntimeToolEvent) => void
  onActivity?: () => void
}) {
  const events = new Map<string, RuntimeToolEvent>()

  const emit = (event: RuntimeToolEvent) => {
    events.set(event.toolCallId, event)
    input.onActivity?.()
    input.onEvent?.(event)
  }

  const start = (toolCallId: string, tool: string, toolInput: unknown) => {
    const now = Date.now()
    emit({
      id: `${input.requestId}:${toolCallId}`,
      requestId: input.requestId,
      toolCallId,
      tool,
      label: tool,
      detail: '工具正在执行',
      status: 'running',
      input: budgetStructuredValue(toolInput, DEFAULT_TOOL_RESULT_CHARACTER_BUDGET),
      startedAt: now,
      updatedAt: now
    })
  }

  const update = (
    toolCallId: string,
    patch: Partial<Omit<RuntimeToolEvent, 'id' | 'requestId' | 'toolCallId' | 'startedAt'>> & { tool: string }
  ) => {
    const now = Date.now()
    const previous = events.get(toolCallId)
    const status = patch.status ?? previous?.status ?? 'running'
    const finishedAt = status === 'running' ? undefined : now
    emit({
      id: `${input.requestId}:${toolCallId}`,
      requestId: input.requestId,
      toolCallId,
      tool: patch.tool,
      label: patch.label ?? previous?.label ?? patch.tool,
      detail: patch.detail ?? previous?.detail ?? '',
      status,
      input: patch.input ?? previous?.input,
      output: patch.output === undefined
        ? previous?.output
        : budgetStructuredValue(patch.output, DEFAULT_TOOL_RESULT_CHARACTER_BUDGET),
      error: patch.error ?? previous?.error,
      startedAt: previous?.startedAt ?? now,
      updatedAt: now,
      ...(finishedAt
        ? { finishedAt, durationMs: Math.max(0, finishedAt - (previous?.startedAt ?? now)) }
        : {})
    })
  }

  const finish = (toolCallId: string, tool: string, output: unknown, durationMs?: number) => {
    update(toolCallId, {
      tool,
      status: 'done',
      detail: events.get(toolCallId)?.detail || '工具执行完成',
      output
    })
    if (durationMs != null) {
      const event = events.get(toolCallId)
      if (event) emit({ ...event, durationMs })
    }
  }

  const fail = (toolCallId: string, tool: string, error: unknown, durationMs?: number) => {
    const normalized = normalizeBookmarkAgentError(error)
    update(toolCallId, {
      tool,
      status: 'error',
      detail: normalized.message,
      error: { code: normalized.code, message: normalized.message }
    })
    if (durationMs != null) {
      const event = events.get(toolCallId)
      if (event) emit({ ...event, durationMs })
    }
  }

  const closeOpen = (error: unknown) => {
    for (const event of events.values()) {
      if (event.status === 'running') fail(event.toolCallId, event.tool, error)
    }
  }

  return { start, update, finish, fail, closeOpen, snapshot: () => [...events.values()] }
}
