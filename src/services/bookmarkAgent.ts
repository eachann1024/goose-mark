import PinyinMatch from 'pinyin-match'
import { tool, generateText, stepCountIs, type LanguageModel, type ModelMessage } from 'ai'
import { z } from 'zod'
import agentInstructions from '@/agent/AGENTS.md?raw'
import chatSkill from '@/agent/chat/SKILL.md?raw'
import searchBookmarksSkill from '@/agent/searchBookmarks/SKILL.md?raw'
import manageBookmarksSkill from '@/agent/manageBookmarks/SKILL.md?raw'
import webResearchSkill from '@/agent/webResearch/SKILL.md?raw'
import generateMetadataSkill from '@/agent/generateMetadata/SKILL.md?raw'
import categorizeBookmarkSkill from '@/agent/categorizeBookmark/SKILL.md?raw'
import saveBookmarkSkill from '@/agent/saveBookmark/SKILL.md?raw'
import { resolveCustomBaseURL, type AISettingsLike } from '@/lib/aiProvider'
import { selectAiSettings, useSettingsStore } from '@/stores/settings'
import { TRASH_GROUP_ID, useBookmarkStore } from '@/stores/bookmark'
import { resolveBookmarkLaunchUrl } from '@/lib/utils'
import { probeUrl } from '@/services/siteProbe'
import type { Bookmark, BookmarkLocation, Group } from '@/types/bookmark'

const MAX_TOOL_CONTENT = 48_000
const JINA_READER_HOSTS = ['https://r.jina.ai/', 'https://r.jinaai.cn/']

const SKILLS = {
  chat: { content: chatSkill.trim(), tools: [] },
  searchBookmarks: {
    content: searchBookmarksSkill.trim(),
    tools: ['listGroups', 'searchBookmarks', 'readBookmark']
  },
  manageBookmarks: {
    content: manageBookmarksSkill.trim(),
    tools: ['listGroups', 'searchBookmarks', 'readBookmark', 'checkBookmarkLinks', 'proposeChanges', 'openBookmark']
  },
  webResearch: { content: webResearchSkill.trim(), tools: ['searchWeb', 'readWebPage'] },
  generateMetadata: { content: generateMetadataSkill.trim(), tools: ['readWebPage'] },
  categorizeBookmark: {
    content: categorizeBookmarkSkill.trim(),
    tools: ['listGroups', 'searchBookmarks', 'readBookmark']
  },
  saveBookmark: {
    content: saveBookmarkSkill.trim(),
    tools: ['listGroups', 'searchWeb', 'readWebPage', 'proposeChanges']
  }
} as const

type SkillId = keyof typeof SKILLS
type AgentToolName =
  | 'loadSkill'
  | 'listGroups'
  | 'searchBookmarks'
  | 'readBookmark'
  | 'checkBookmarkLinks'
  | 'proposeChanges'
  | 'openBookmark'
  | 'searchWeb'
  | 'readWebPage'

export type BookmarkAgentToolEvent = {
  id: string
  tool: AgentToolName
  label: string
  detail: string
  status: 'running' | 'done' | 'error'
}

type AgentContext = {
  loadedSkills: Set<SkillId>
  proposals: BookmarkAgentChangeProposal[]
  onToolEvent?: (event: BookmarkAgentToolEvent) => void
}

export type BookmarkAgentMessage = {
  role: 'user' | 'assistant'
  content: string
}

const bookmarkLocationSchema = z.object({
  groupId: z.string().min(1),
  subGroupId: z.string().min(1)
})

const mutationActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('createBookmark'),
    url: z.string().min(1),
    title: z.string().min(1),
    desc: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    groupId: z.string().optional(),
    subGroupId: z.string().optional()
  }),
  z.object({
    type: z.literal('updateBookmark'),
    bookmarkId: z.string().min(1),
    title: z.string().optional(),
    desc: z.string().optional(),
    tags: z.array(z.string()).optional()
  }),
  z.object({
    type: z.literal('setBookmarkLocations'),
    bookmarkId: z.string().min(1),
    locations: z.array(bookmarkLocationSchema).min(1).max(12)
  }),
  z.object({ type: z.literal('createGroup'), name: z.string().min(1) }),
  z.object({ type: z.literal('renameGroup'), groupId: z.string().min(1), name: z.string().min(1) }),
  z.object({ type: z.literal('deleteGroup'), groupId: z.string().min(1) }),
  z.object({ type: z.literal('createSubGroup'), groupId: z.string().min(1), name: z.string().min(1) }),
  z.object({
    type: z.literal('renameSubGroup'),
    groupId: z.string().min(1),
    subGroupId: z.string().min(1),
    name: z.string().min(1)
  }),
  z.object({
    type: z.literal('deleteSubGroup'),
    groupId: z.string().min(1),
    subGroupId: z.string().min(1)
  })
])

export type BookmarkAgentMutationAction = z.infer<typeof mutationActionSchema>

export type BookmarkAgentChangeProposal = {
  id: string
  summary: string
  details: string[]
  destructive: boolean
  actions: BookmarkAgentMutationAction[]
}

export type BookmarkAgentExecutionResult = {
  message: string
  undoToken: string
}

type AgentUndoSnapshot = {
  groups: Group[]
  bookmarks: Bookmark[]
  activeGroupId: string
  activeSubGroupId: string
}

type AgentUndoRecord = {
  before: AgentUndoSnapshot
  after: AgentUndoSnapshot
}

const undoSnapshots = new Map<string, AgentUndoRecord>()

const skillIdSchema = z.enum([
  'chat',
  'searchBookmarks',
  'manageBookmarks',
  'webResearch',
  'generateMetadata',
  'categorizeBookmark',
  'saveBookmark'
])

function truncate(text: string, max = MAX_TOOL_CONTENT) {
  const normalized = text.trim()
  return normalized.length > max ? `${normalized.slice(0, max)}\n\n[内容过长，已截断]` : normalized
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : '操作失败'
}

function notify(
  options: { toolCallId: string; experimental_context?: unknown },
  toolName: AgentToolName,
  label: string,
  detail: string,
  status: BookmarkAgentToolEvent['status']
) {
  const context = options.experimental_context as AgentContext | undefined
  context?.onToolEvent?.({ id: options.toolCallId, tool: toolName, label, detail, status })
}

function validateExternalHttpUrl(rawUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('网址格式不正确')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('只允许读取 HTTP 或 HTTPS 网页')
  }
  if (parsed.username || parsed.password) throw new Error('网址不能包含账号或密码')
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const privateIpv4 = /^(?:0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
  const privateIpv6 = hostname === '::' || hostname === '::1' || /^(?:fc|fd|fe[89ab])/i.test(hostname)
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    !hostname.includes('.') ||
    privateIpv4 ||
    privateIpv6
  ) {
    throw new Error('不能读取本机或内网地址')
  }
  return parsed.toString()
}

async function fetchText(url: string, signal?: AbortSignal) {
  if (window.gooseWeb?.fetchText) return window.gooseWeb.fetchText(url)
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'text/plain,text/html,application/xml,text/xml,application/json;q=0.9,*/*;q=0.1' }
  })
  if (!response.ok) throw new Error(`网页请求失败（HTTP ${response.status}）`)
  const text = await response.text()
  if (text.length > 2 * 1024 * 1024) throw new Error('网页内容过大，已停止读取')
  return {
    ok: true as const,
    url: response.url || url,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    text
  }
}

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSearchRss(xml: string, maxResults: number) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, Math.max(1, Math.min(8, maxResults)))
    .map((match) => {
      const item = match[1]
      const value = (tag: string) => {
        const found = item.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
        return decodeXml(found?.[1] || '')
      }
      return { title: value('title'), url: value('link'), snippet: value('description') }
    })
    .filter((item) => item.title && item.url)
}

function readableTextFromHtml(html: string, sourceUrl: string) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document
    .querySelectorAll('script,style,noscript,nav,footer,aside,form,dialog,iframe,svg,canvas')
    .forEach((node) => node.remove())
  const title =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    document.querySelector('h1')?.textContent ||
    document.title ||
    new URL(sourceUrl).hostname
  const root = document.querySelector('article') || document.querySelector('main') || document.body
  const blocks = root
    ? Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre'))
        .map((node) => {
          const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
          if (!text) return ''
          const tag = node.tagName.toLowerCase()
          if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${text}`
          if (tag === 'li') return `- ${text}`
          if (tag === 'blockquote') return `> ${text}`
          return text
        })
        .filter(Boolean)
    : []
  return [`# ${title.trim()}`, ...blocks].join('\n\n').trim()
}

const loadSkill = tool({
  description: '按需加载一个能力说明。执行任务前必须调用，并选择与用户需求最匹配的 Skill。',
  inputSchema: z.object({ skill: skillIdSchema }),
  execute: async (input, options) => {
    const context = options.experimental_context as AgentContext
    const id = input.skill as SkillId
    context.loadedSkills.add(id)
    const skill = SKILLS[id]
    notify(options, 'loadSkill', '加载能力', `已加载 ${id}`, 'done')
    return { skill: id, instructions: skill.content, availableTools: skill.tools }
  }
})

const listGroups = tool({
  description: '列出书签库中的一级分组与二级分组 id，供搜索或保存时选择。',
  inputSchema: z.object({}),
  execute: async (_input, options) => {
    notify(options, 'listGroups', '查看分组', '正在读取书签分组', 'running')
    const groups = useBookmarkStore
      .getState()
      .groups.filter((group) => group.id !== TRASH_GROUP_ID && !group.isDeleted)
      .map((group) => ({
        id: group.id,
        name: group.name,
        subGroups: group.children.filter((sub) => !sub.isDeleted).map((sub) => ({ id: sub.id, name: sub.name }))
      }))
    notify(options, 'listGroups', '查看分组', `已读取 ${groups.length} 个分组`, 'done')
    return groups
  }
})

const searchBookmarks = tool({
  description: '按标题、描述、网址、标签和拼音搜索当前书签库。',
  inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).optional().default(8) }),
  execute: async (input, options) => {
    notify(options, 'searchBookmarks', '搜索书签', `正在搜索“${input.query}”`, 'running')
    const query = input.query.trim().toLowerCase()
    const store = useBookmarkStore.getState()
    const matches = store.bookmarks
      .filter((bookmark) => !bookmark.isDeleted && !store.isBookmarkInTrash(bookmark))
      .filter((bookmark) => {
        const text = [bookmark.title, bookmark.desc || '', bookmark.url, ...(bookmark.tags || [])].join(' ')
        return text.toLowerCase().includes(query) || !!PinyinMatch.match(text, input.query)
      })
      .slice(0, input.limit)
      .map((bookmark) => ({ id: bookmark.id, title: bookmark.title, url: bookmark.url, desc: bookmark.desc || '' }))
    notify(options, 'searchBookmarks', '搜索书签', `找到 ${matches.length} 条结果`, 'done')
    return matches
  }
})

const readBookmark = tool({
  description: '读取一条已知 id 的书签详情与分组位置。',
  inputSchema: z.object({ bookmarkId: z.string().min(1) }),
  execute: async (input, options) => {
    notify(options, 'readBookmark', '读取书签', '正在读取书签详情', 'running')
    const store = useBookmarkStore.getState()
    const bookmark = store.bookmarks.find((item) => item.id === input.bookmarkId && !item.isDeleted)
    if (!bookmark) throw new Error('未找到对应书签')
    const result = { ...bookmark, locations: store.getBookmarkLocations(bookmark.id) }
    notify(options, 'readBookmark', '读取书签', `已读取“${bookmark.title}”`, 'done')
    return result
  }
})

function findVisibleGroup(groupId: string) {
  return useBookmarkStore
    .getState()
    .groups.find((group) => group.id === groupId && group.id !== TRASH_GROUP_ID && !group.isDeleted)
}

function findVisibleBookmark(bookmarkId: string) {
  const store = useBookmarkStore.getState()
  return store.bookmarks.find(
    (bookmark) => bookmark.id === bookmarkId && !bookmark.isDeleted && !store.isBookmarkInTrash(bookmark)
  )
}

function normalizedName(value: string, label: string) {
  const name = value.trim().slice(0, 40)
  if (!name) throw new Error(`${label}不能为空`)
  return name
}

function locationLabel(location: BookmarkLocation) {
  const group = findVisibleGroup(location.groupId)
  const sub = group?.children.find((item) => item.id === location.subGroupId && !item.isDeleted)
  if (!group || !sub) throw new Error('目标分组不存在或已删除')
  return `${group.name} / ${sub.name}`
}

function describeMutation(action: BookmarkAgentMutationAction) {
  switch (action.type) {
    case 'createBookmark': {
      validateExternalHttpUrl(action.url)
      const title = normalizedName(action.title, '书签标题')
      const location = action.groupId && action.subGroupId
        ? locationLabel({ groupId: action.groupId, subGroupId: action.subGroupId })
        : '快速收集'
      if (!!action.groupId !== !!action.subGroupId) throw new Error('保存位置需要同时提供一级和二级分组')
      return `新增书签“${title}”到 ${location}`
    }
    case 'updateBookmark': {
      const bookmark = findVisibleBookmark(action.bookmarkId)
      if (!bookmark) throw new Error('要修改的书签不存在或已在回收站')
      if (action.title === undefined && action.desc === undefined && action.tags === undefined) {
        throw new Error('没有提供要修改的书签字段')
      }
      if (action.title !== undefined) normalizedName(action.title, '书签标题')
      return `修改书签“${bookmark.title}”的内容`
    }
    case 'setBookmarkLocations': {
      const bookmark = findVisibleBookmark(action.bookmarkId)
      if (!bookmark) throw new Error('要移动的书签不存在或已在回收站')
      const locations = action.locations.map(locationLabel)
      return `将“${bookmark.title}”调整到 ${locations.join('、')}`
    }
    case 'createGroup':
      return `新增一级分组“${normalizedName(action.name, '分组名称')}”`
    case 'renameGroup': {
      const group = findVisibleGroup(action.groupId)
      if (!group) throw new Error('要重命名的一级分组不存在')
      return `将一级分组“${group.name}”改名为“${normalizedName(action.name, '分组名称')}”`
    }
    case 'deleteGroup': {
      const group = findVisibleGroup(action.groupId)
      if (!group) throw new Error('要删除的一级分组不存在')
      const bookmarkCount = new Set(group.children.flatMap((sub) => sub.bookmarkIds)).size
      return `删除一级分组“${group.name}”（含 ${group.children.length} 个子分组、${bookmarkCount} 条书签归属）`
    }
    case 'createSubGroup': {
      const group = findVisibleGroup(action.groupId)
      if (!group) throw new Error('目标一级分组不存在')
      return `在“${group.name}”下新增子分组“${normalizedName(action.name, '子分组名称')}”`
    }
    case 'renameSubGroup': {
      const group = findVisibleGroup(action.groupId)
      const sub = group?.children.find((item) => item.id === action.subGroupId && !item.isDeleted)
      if (!group || !sub) throw new Error('要重命名的子分组不存在')
      return `将“${group.name} / ${sub.name}”改名为“${normalizedName(action.name, '子分组名称')}”`
    }
    case 'deleteSubGroup': {
      const group = findVisibleGroup(action.groupId)
      const sub = group?.children.find((item) => item.id === action.subGroupId && !item.isDeleted)
      if (!group || !sub) throw new Error('要删除的子分组不存在')
      return `删除子分组“${group.name} / ${sub.name}”（含 ${sub.bookmarkIds.length} 条书签归属）`
    }
  }
}

const checkBookmarkLinks = tool({
  description: '逐条检查当前书签网址是否可访问。可检查全部书签，也可限定一级或二级分组。这是只读操作，无需用户确认。',
  inputSchema: z.object({
    groupId: z.string().optional(),
    subGroupId: z.string().optional()
  }),
  execute: async (input, options) => {
    const store = useBookmarkStore.getState()
    let bookmarks = store.bookmarks.filter(
      (bookmark) => !bookmark.isDeleted && !store.isBookmarkInTrash(bookmark)
    )
    if (input.groupId) {
      const group = findVisibleGroup(input.groupId)
      if (!group) throw new Error('要检查的分组不存在')
      const subs = input.subGroupId
        ? group.children.filter((sub) => sub.id === input.subGroupId)
        : group.children
      if (input.subGroupId && subs.length === 0) throw new Error('要检查的子分组不存在')
      const ids = new Set(subs.flatMap((sub) => sub.bookmarkIds))
      bookmarks = bookmarks.filter((bookmark) => ids.has(bookmark.id))
    } else if (input.subGroupId) {
      throw new Error('限定子分组时必须同时提供一级分组')
    }

    notify(options, 'checkBookmarkLinks', '检查书签', `正在检查 ${bookmarks.length} 个网址`, 'running')
    const results = new Array<Awaited<ReturnType<typeof probeUrl>>>(bookmarks.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(8, bookmarks.length) }, async () => {
      while (cursor < bookmarks.length) {
        const index = cursor++
        results[index] = await probeUrl(bookmarks[index].url, 5000)
      }
    })
    await Promise.all(workers)

    const restricted: Array<{ id: string; title: string; url: string; status: number }> = []
    const unavailable: Array<{ id: string; title: string; url: string; status?: number; reason?: string }> = []
    results.forEach((result, index) => {
      const bookmark = bookmarks[index]
      if (result.ok) return
      if (result.status === 401 || result.status === 403 || result.status === 429) {
        restricted.push({ id: bookmark.id, title: bookmark.title, url: bookmark.url, status: result.status })
        return
      }
      unavailable.push({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        status: result.status,
        reason: result.reason
      })
    })
    const available = bookmarks.length - restricted.length - unavailable.length
    notify(
      options,
      'checkBookmarkLinks',
      '检查书签',
      `完成：${available} 个可访问，${restricted.length} 个受限，${unavailable.length} 个异常`,
      'done'
    )
    return {
      checked: bookmarks.length,
      available,
      restrictedCount: restricted.length,
      unavailableCount: unavailable.length,
      restricted: restricted.slice(0, 60),
      unavailable: unavailable.slice(0, 60),
      omitted: Math.max(0, restricted.length + unavailable.length - 120),
      note: '401、403、429 归为受限，可能需要登录或稍后重试；网络检查失败不等同于书签一定失效。'
    }
  }
})

const proposeChanges = tool({
  description: '为书签或分组写入生成待确认变更。此工具不会修改数据；调用后必须等待用户在界面点击同意。',
  inputSchema: z.object({
    summary: z.string().min(1).max(120),
    actions: z.array(mutationActionSchema).min(1).max(20)
  }),
  execute: async (input, options) => {
    const store = useBookmarkStore.getState()
    if (store.isReadOnly) throw new Error('当前书签库为只读，无法修改')
    const details = input.actions.map(describeMutation)
    const proposal: BookmarkAgentChangeProposal = {
      id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      summary: input.summary.trim(),
      details,
      destructive: input.actions.some((action) => action.type === 'deleteGroup' || action.type === 'deleteSubGroup'),
      actions: input.actions
    }
    const context = options.experimental_context as AgentContext
    context.proposals.push(proposal)
    notify(options, 'proposeChanges', '等待确认', `已列出 ${details.length} 项变更，尚未修改数据`, 'done')
    return { pendingConfirmation: true, proposalId: proposal.id, details }
  }
})

const openBookmark = tool({
  description: '仅在用户明确要求打开时打开一条已知 id 的书签。',
  inputSchema: z.object({ bookmarkId: z.string().min(1), query: z.string().optional().default('') }),
  execute: async (input, options) => {
    const store = useBookmarkStore.getState()
    const bookmark = store.bookmarks.find((item) => item.id === input.bookmarkId && !item.isDeleted)
    if (!bookmark) throw new Error('未找到对应书签')
    notify(options, 'openBookmark', '打开书签', `正在打开“${bookmark.title}”`, 'running')
    const url = resolveBookmarkLaunchUrl(bookmark.url, input.query)
    if (!url) throw new Error('书签网址无效，无法打开')
    if (window.utools?.shellOpenExternal) window.utools.shellOpenExternal(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
    store.recordBookmarkUse(bookmark.id)
    notify(options, 'openBookmark', '打开书签', `已打开“${bookmark.title}”`, 'done')
    return { ok: true, url }
  }
})

const searchWeb = tool({
  description: '联网搜索当前或外部信息，返回标题、摘要和来源网址。',
  inputSchema: z.object({ query: z.string().min(1), maxResults: z.number().int().min(1).max(8).optional().default(5) }),
  execute: async (input, options) => {
    notify(options, 'searchWeb', '联网搜索', `正在搜索“${input.query}”`, 'running')
    try {
      const url = `https://www.bing.com/search?format=rss&mkt=zh-CN&q=${encodeURIComponent(input.query)}`
      const response = await fetchText(url, options.abortSignal)
      const results = parseSearchRss(response.text, input.maxResults)
      if (!results.length) throw new Error('联网搜索没有返回结果')
      notify(options, 'searchWeb', '联网搜索', `已找到 ${results.length} 条来源`, 'done')
      return { query: input.query, results, untrustedExternalContent: true }
    } catch (error) {
      notify(options, 'searchWeb', '联网搜索', errorMessage(error), 'error')
      return { error: '联网搜索暂不可用，请稍后重试。', detail: errorMessage(error) }
    }
  }
})

const readWebPage = tool({
  description: '读取一个已知 HTTP 或 HTTPS 网页的正文；不能只根据网址猜测内容。',
  inputSchema: z.object({ url: z.string().min(1) }),
  execute: async (input, options) => {
    const url = validateExternalHttpUrl(input.url)
    const host = new URL(url).hostname
    notify(options, 'readWebPage', '读取网页', `正在读取 ${host}`, 'running')
    const failures: string[] = []
    for (const jinaHost of JINA_READER_HOSTS) {
      try {
        const response = await fetchText(`${jinaHost}${url}`, options.abortSignal)
        const content = truncate(response.text)
        if (!content) throw new Error('网页没有可读取正文')
        notify(options, 'readWebPage', '读取网页', `已读取 ${host}`, 'done')
        return { source: 'Jina Reader', url, content, untrustedExternalContent: true }
      } catch (error) {
        failures.push(errorMessage(error))
      }
    }
    try {
      const response = await fetchText(url, options.abortSignal)
      const isHtml = /html/i.test(response.contentType) || /<html[\s>]/i.test(response.text)
      const content = truncate(isHtml ? readableTextFromHtml(response.text, response.url) : response.text)
      if (!content) throw new Error('网页没有可读取正文')
      notify(options, 'readWebPage', '读取网页', `已读取 ${host}`, 'done')
      return { source: '直接读取', url: response.url, content, untrustedExternalContent: true }
    } catch (error) {
      failures.push(errorMessage(error))
      notify(options, 'readWebPage', '读取网页', '网页暂时无法读取', 'error')
      return { error: '网页暂时无法读取，请稍后重试或粘贴正文。', attempts: failures }
    }
  }
})

function cloneAgentData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function captureAgentSnapshot(): AgentUndoSnapshot {
  const store = useBookmarkStore.getState()
  return cloneAgentData({
    groups: store.groups,
    bookmarks: store.bookmarks,
    activeGroupId: store.activeGroupId,
    activeSubGroupId: store.activeSubGroupId
  })
}

function restoreAgentSnapshot(snapshot: AgentUndoSnapshot) {
  const store = useBookmarkStore.getState()
  const currentGroups = cloneAgentData(store.groups)
  const currentBookmarks = cloneAgentData(store.bookmarks)
  const snapshotGroupIds = new Set(snapshot.groups.map((group) => group.id))
  const snapshotSubIds = new Set(snapshot.groups.flatMap((group) => group.children.map((sub) => sub.id)))
  const snapshotBookmarkIds = new Set(snapshot.bookmarks.map((bookmark) => bookmark.id))
  const removedGroups = currentGroups.filter((group) => !snapshotGroupIds.has(group.id) && group.id !== TRASH_GROUP_ID)
  const removedSubs = currentGroups.flatMap((group) =>
    group.children
      .filter((sub) => !snapshotSubIds.has(sub.id))
      .map((sub) => ({ groupId: group.id, subId: sub.id }))
  )
  const removedBookmarks = currentBookmarks.filter((bookmark) => !snapshotBookmarkIds.has(bookmark.id))
  const removedBookmarkShares = new Map(
    removedBookmarks.map((bookmark) => [
      bookmark.id,
      store.getShareIdsFromLocations(store.getBookmarkLocations(bookmark.id))
    ])
  )
  const removedGroupShares = new Map(
    removedGroups.map((group) => [group.id, store.getShareIdsFromGroup(group.id)])
  )
  const removedSubShares = new Map(
    removedSubs.map(({ groupId, subId }) => [subId, store.getShareIdsFromSubGroup(groupId, subId)])
  )

  store.setData(cloneAgentData(snapshot))
  store.ensureValidSelection(snapshot.activeGroupId, snapshot.activeSubGroupId)
  const now = Date.now()
  removedBookmarks.forEach((bookmark) => {
    store.scheduleBookmarkSync(bookmark.id, {
      isDeleted: true,
      updatedAt: now,
      previousShareIds: removedBookmarkShares.get(bookmark.id),
      content: null
    })
  })
  removedSubs.forEach(({ groupId, subId }) => {
    store.scheduleSubGroupSync(groupId, subId, {
      isDeleted: true,
      updatedAt: now,
      previousShareIds: removedSubShares.get(subId)
    })
  })
  removedGroups.forEach((group) => {
    store.scheduleGroupSync(group.id, {
      isDeleted: true,
      updatedAt: now,
      previousShareIds: removedGroupShares.get(group.id)
    })
  })
  store.syncAllSharedEntities(now + 1)
}

export async function executeBookmarkAgentProposal(
  proposal: BookmarkAgentChangeProposal
): Promise<BookmarkAgentExecutionResult> {
  const initialStore = useBookmarkStore.getState()
  if (initialStore.isReadOnly) throw new Error('当前书签库为只读，无法修改')
  proposal.actions.forEach(describeMutation)
  const snapshot = captureAgentSnapshot()

  try {
    for (const action of proposal.actions) {
      const store = useBookmarkStore.getState()
      switch (action.type) {
        case 'createBookmark': {
          const url = validateExternalHttpUrl(action.url)
          let location: BookmarkLocation
          if (action.groupId && action.subGroupId) {
            locationLabel({ groupId: action.groupId, subGroupId: action.subGroupId })
            location = { groupId: action.groupId, subGroupId: action.subGroupId }
          } else {
            const fallback = store.getOrCreateQuickCollectGroup()
            location = { groupId: fallback.group.id, subGroupId: fallback.subGroup.id }
          }
          const title = normalizedName(action.title, '书签标题').slice(0, 80)
          store.addBookmark(
            {
              url,
              title,
              desc: action.desc.trim().slice(0, 240),
              tags: action.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
              pinned: false,
              allowUniversal: false,
              icon: { type: 'text', value: title.slice(0, 2).toUpperCase() }
            },
            [location]
          )
          break
        }
        case 'updateBookmark': {
          const bookmark = findVisibleBookmark(action.bookmarkId)
          if (!bookmark) throw new Error('要修改的书签不存在或已在回收站')
          store.updateBookmark(bookmark.id, {
            ...(action.title !== undefined ? { title: normalizedName(action.title, '书签标题').slice(0, 80) } : {}),
            ...(action.desc !== undefined ? { desc: action.desc.trim().slice(0, 240) } : {}),
            ...(action.tags !== undefined
              ? { tags: action.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12) }
              : {})
          })
          break
        }
        case 'setBookmarkLocations': {
          const unique = action.locations.filter(
            (location, index, items) =>
              items.findIndex(
                (item) => item.groupId === location.groupId && item.subGroupId === location.subGroupId
              ) === index
          )
          unique.forEach(locationLabel)
          store.updateBookmarkLocations(action.bookmarkId, unique)
          break
        }
        case 'createGroup':
          store.addGroup(normalizedName(action.name, '分组名称'))
          break
        case 'renameGroup':
          store.updateGroup(action.groupId, normalizedName(action.name, '分组名称'))
          break
        case 'deleteGroup':
          if (!store.removeGroup(action.groupId)) throw new Error('删除一级分组失败')
          break
        case 'createSubGroup':
          if (!store.addSubGroup(normalizedName(action.name, '子分组名称'), action.groupId)) {
            throw new Error('新增子分组失败')
          }
          break
        case 'renameSubGroup':
          store.updateSubGroup(
            action.groupId,
            action.subGroupId,
            normalizedName(action.name, '子分组名称')
          )
          break
        case 'deleteSubGroup':
          if (!store.removeSubGroup(action.groupId, action.subGroupId)) throw new Error('删除子分组失败')
          break
      }
    }
  } catch (error) {
    restoreAgentSnapshot(snapshot)
    throw error
  }

  const undoToken = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  undoSnapshots.set(undoToken, { before: snapshot, after: captureAgentSnapshot() })
  while (undoSnapshots.size > 10) {
    const oldest = undoSnapshots.keys().next().value
    if (typeof oldest !== 'string') break
    undoSnapshots.delete(oldest)
  }
  return { message: `已执行 ${proposal.actions.length} 项变更。`, undoToken }
}

export function undoBookmarkAgentExecution(undoToken: string) {
  const record = undoSnapshots.get(undoToken)
  if (!record) throw new Error('这次变更已撤回或撤回记录已失效')
  if (useBookmarkStore.getState().isReadOnly) throw new Error('当前书签库为只读，无法撤回')
  const current = captureAgentSnapshot()
  if (JSON.stringify(current) !== JSON.stringify(record.after)) {
    throw new Error('数据在执行后又发生了变化，为避免覆盖新修改，无法直接撤回')
  }
  restoreAgentSnapshot(record.before)
  undoSnapshots.delete(undoToken)
  return '已撤回，书签与分组已恢复到执行前状态。'
}

const bookmarkAgentTools = {
  loadSkill,
  listGroups,
  searchBookmarks,
  readBookmark,
  checkBookmarkLinks,
  proposeChanges,
  openBookmark,
  searchWeb,
  readWebPage
}

async function buildLanguageModel(settings: AISettingsLike): Promise<LanguageModel> {
  const modelId = settings.selectedModelId?.trim()
  if (!settings.enabled) throw new Error('AI 助手尚未开启，请先到设置中打开')
  if (!settings.useCustomProvider || !settings.customApiKey.trim()) {
    throw new Error('Agent 工具需要支持工具调用的自定义模型，请先配置 AI 服务')
  }
  if (!modelId) throw new Error('请先选择支持工具调用的模型')

  if (settings.protocol === 'openai-responses') {
    const provider = (await import('@ai-sdk/openai')).createOpenAI({
      baseURL: resolveCustomBaseURL(settings.protocol, settings.customBaseURL),
      apiKey: settings.customApiKey.trim(),
      name: 'goose-marks-agent'
    })
    return provider.responses(modelId)
  }
  if (settings.protocol === 'anthropic') {
    const provider = (await import('@ai-sdk/anthropic')).createAnthropic({
      baseURL: resolveCustomBaseURL(settings.protocol, settings.customBaseURL),
      apiKey: settings.customApiKey.trim(),
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
    })
    return provider.languageModel(modelId)
  }
  const provider = (await import('@ai-sdk/openai-compatible')).createOpenAICompatible({
    baseURL: resolveCustomBaseURL(settings.protocol, settings.customBaseURL),
    apiKey: settings.customApiKey.trim(),
    name: 'goose-marks-agent'
  })
  return provider.chatModel(modelId)
}

export async function runBookmarkAgent(
  history: BookmarkAgentMessage[],
  options: {
    abortSignal?: AbortSignal
    onToolEvent?: (event: BookmarkAgentToolEvent) => void
  } = {}
) {
  const settings = selectAiSettings(useSettingsStore.getState())
  const model = await buildLanguageModel(settings)
  const store = useBookmarkStore.getState()
  const context: AgentContext = { loadedSkills: new Set(), proposals: [], onToolEvent: options.onToolEvent }
  const messages: ModelMessage[] = history.map((message) => ({
    role: message.role,
    content: message.content
  }))
  const system = `${agentInstructions.trim()}

# 当前上下文

- 当前日期：${new Date().toISOString().slice(0, 10)}
- 一级分组数量：${store.groups.filter((group) => group.id !== TRASH_GROUP_ID && !group.isDeleted).length}
- 有效书签数量：${store.bookmarks.filter((bookmark) => !bookmark.isDeleted && !store.isBookmarkInTrash(bookmark)).length}

先判断本轮需求，然后调用 loadSkill 加载最匹配的 Skill，再执行。`

  const result = await generateText({
    model,
    system,
    messages,
    tools: bookmarkAgentTools,
    stopWhen: stepCountIs(10),
    abortSignal: options.abortSignal,
    experimental_context: context,
    prepareStep: () => ({
      activeTools: [
        'loadSkill',
        ...new Set([...context.loadedSkills].flatMap((id) => SKILLS[id].tools))
      ] as AgentToolName[]
    })
  })

  const text = result.text.trim()
  return {
    text: text || (context.proposals.length > 0 ? '我已列出准备执行的变更，确认前不会修改数据。' : '任务已执行完成。'),
    proposals: context.proposals
  }
}
