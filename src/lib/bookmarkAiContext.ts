import PinyinMatch from 'pinyin-match'
import { TRASH_GROUP_ID } from '@/stores/bookmarkSeed'
import type { Bookmark, Group } from '@/types/bookmark'

export type BookmarkAiReferenceKind = 'bookmark' | 'group' | 'subgroup'

export interface BookmarkAiReference {
  kind: BookmarkAiReferenceKind
  id: string
  titleSnapshot: string
  descriptionSnapshot: string
  groupId?: string
}

export interface BookmarkAiReferenceSuggestion extends BookmarkAiReference {
  searchText: string
}

export type BookmarkAiComposerToken =
  | { type: 'text'; text: string }
  | { type: 'reference'; reference: BookmarkAiReference }

export interface BookmarkAiImageAttachment {
  id: string
  name: string
  mediaType: string
  dataUrl: string
  size: number
  /** 快速样本指纹；完整 SHA-256 可用时另写入 sha256。 */
  fingerprint: string
  sha256?: string
}

export type BookmarkAiPersistedImageMetadata = Omit<BookmarkAiImageAttachment, 'dataUrl'>

export interface BookmarkAiRequiredCapabilities {
  /** runtime 应在模型不支持图片输入时给出明确错误。 */
  imageInput: boolean
}

export interface BookmarkAiSkillCommand {
  source: 'builtin' | 'local'
  id: string
  command: string
  name: string
  description: string
  content?: string
  path?: string
}

export interface BookmarkAiComposerPayload {
  promptText: string
  freeformText: string
  tokens: BookmarkAiComposerToken[]
  references: BookmarkAiReference[]
  images: BookmarkAiImageAttachment[]
  invokedSkill: BookmarkAiSkillCommand | null
  requiredCapabilities: BookmarkAiRequiredCapabilities
}

export interface BookmarkAiComposerPersistedPayload {
  promptText: string
  freeformText: string
  tokens: BookmarkAiComposerToken[]
  references: BookmarkAiReference[]
  images: BookmarkAiPersistedImageMetadata[]
  invokedSkill: Omit<BookmarkAiSkillCommand, 'content'> | null
  requiredCapabilities: BookmarkAiRequiredCapabilities
}

export interface BookmarkAiLibrarySnapshot {
  bookmarks: Bookmark[]
  groups: Group[]
  activeGroupId?: string
  activeSubGroupId?: string
  isBookmarkInTrash?: (bookmark: Bookmark) => boolean
}

export interface InvalidBookmarkAiReference {
  reference: BookmarkAiReference
  reason: 'missing' | 'deleted' | 'trashed'
  message: string
}

export interface BookmarkAiReferenceValidation {
  valid: BookmarkAiReference[]
  invalid: InvalidBookmarkAiReference[]
}

export const BUILTIN_BOOKMARK_AI_SKILLS: readonly BookmarkAiSkillCommand[] = [
  { source: 'builtin', id: 'chat', command: 'chat', name: '对话', description: '基于当前对话回答，不修改书签' },
  { source: 'builtin', id: 'searchBookmarks', command: 'search-bookmarks', name: '搜索书签', description: '搜索和读取当前书签库' },
  { source: 'builtin', id: 'manageBookmarks', command: 'manage-bookmarks', name: '管理书签', description: '检查链接并管理书签或分组' },
  { source: 'builtin', id: 'webResearch', command: 'web-research', name: '网页研究', description: '联网搜索并读取网页' },
  { source: 'builtin', id: 'generateMetadata', command: 'generate-metadata', name: '生成元信息', description: '为网址生成标题和简介' },
  { source: 'builtin', id: 'categorizeBookmark', command: 'categorize-bookmark', name: '推荐分类', description: '从已有分组中推荐分类' },
  { source: 'builtin', id: 'saveBookmark', command: 'save-bookmark', name: '保存书签', description: '自动整理并生成待确认保存方案' }
]

const MAX_LOCAL_SKILL_CHARACTERS = 32_000
const LOCAL_SKILL_CACHE_MS = 3_000

export interface LocalSkillScanResult {
  status: 'ready' | 'missing' | 'denied' | 'unavailable' | 'error'
  skills: Array<{ path: string; content: string }>
  message?: string
}

let localSkillCache: { at: number; result: LocalSkillScanResult } | null = null

export function clearBookmarkAiLocalSkillCache() {
  localSkillCache = null
}

function frontmatterValue(content: string, key: string) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return ''
  const line = match[1]
    .split(/\r?\n/)
    .find((item) => item.trimStart().startsWith(`${key}:`))
  return line?.slice(line.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '') ?? ''
}

function fallbackSkillName(path: string) {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-2) ?? 'skill'
}

export function normalizeBookmarkAiSkillCommand(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return /^[a-z0-9][a-z0-9-]*$/.test(normalized) ? normalized : ''
}

export function parseBookmarkAiLocalSkills(scan: LocalSkillScanResult): BookmarkAiSkillCommand[] {
  const reserved = new Set(BUILTIN_BOOKMARK_AI_SKILLS.map((skill) => skill.command))
  const seen = new Set<string>()
  return scan.skills
    .map(({ path, content }) => {
      const command = normalizeBookmarkAiSkillCommand(
        frontmatterValue(content, 'name') || fallbackSkillName(path)
      )
      return {
        source: 'local' as const,
        id: command,
        command,
        name: frontmatterValue(content, 'name') || fallbackSkillName(path),
        description: frontmatterValue(content, 'description') || '本地 Skill',
        path,
        content: content.trim().slice(0, MAX_LOCAL_SKILL_CHARACTERS)
      }
    })
    .filter((skill) => {
      if (!skill.command || reserved.has(skill.command) || seen.has(skill.command)) return false
      seen.add(skill.command)
      return true
    })
    .sort((a, b) => a.command.localeCompare(b.command, 'en'))
}

export function getBookmarkAiLocalSkillScan(forceRefresh = false): LocalSkillScanResult {
  if (!forceRefresh && localSkillCache && Date.now() - localSkillCache.at < LOCAL_SKILL_CACHE_MS) {
    return localSkillCache.result
  }
  const bridge = window.gooseAiContext?.listLocalSkills
  const result = bridge
    ? bridge()
    : { status: 'unavailable' as const, skills: [], message: '当前运行环境无法读取本地 Skill' }
  localSkillCache = { at: Date.now(), result }
  return result
}

export function getBookmarkAiSkillSuggestions(
  query: string,
  options: { readLocalSkills: boolean; forceRefresh?: boolean } = { readLocalSkills: false }
) {
  const scan = options.readLocalSkills
    ? getBookmarkAiLocalSkillScan(options.forceRefresh)
    : { status: 'unavailable' as const, skills: [], message: '本地 Skill 读取已关闭' }
  const skills = [
    ...BUILTIN_BOOKMARK_AI_SKILLS,
    ...(options.readLocalSkills ? parseBookmarkAiLocalSkills(scan) : [])
  ]
  const normalized = query.trim().toLowerCase()
  return {
    scan,
    items: skills
      .filter((skill) => {
        if (!normalized) return true
        const text = `${skill.command} ${skill.name} ${skill.description}`
        return text.toLowerCase().includes(normalized) || Boolean(PinyinMatch.match(text, query))
      })
      .slice(0, 30)
  }
}

export function resolveInvokedBookmarkAiSkill(
  promptText: string,
  skills: readonly BookmarkAiSkillCommand[]
) {
  const match = promptText.trimStart().match(/^\/([a-z0-9][a-z0-9-]*)\b/i)
  if (!match) return null
  const command = normalizeBookmarkAiSkillCommand(match[1])
  return skills.find((skill) => skill.command === command) ?? null
}

function isInTrash(snapshot: BookmarkAiLibrarySnapshot, bookmark: Bookmark) {
  if (snapshot.isBookmarkInTrash?.(bookmark)) return true
  if (bookmark.locations?.some((location) => location.groupId === TRASH_GROUP_ID)) return true
  const trash = snapshot.groups.find((group) => group.id === TRASH_GROUP_ID)
  return Boolean(trash?.children.some((subgroup) => subgroup.bookmarkIds.includes(bookmark.id)))
}

function matchesQuery(text: string, query: string) {
  const normalized = query.trim().toLowerCase()
  return !normalized || text.toLowerCase().includes(normalized) || Boolean(PinyinMatch.match(text, query))
}

export function getBookmarkAiReferenceSuggestions(
  query: string,
  snapshot: BookmarkAiLibrarySnapshot
): BookmarkAiReferenceSuggestion[] {
  const candidates: Array<BookmarkAiReferenceSuggestion & { priority: number }> = []
  const groupNames = new Map(snapshot.groups.map((group) => [group.id, group.name]))

  for (const bookmark of snapshot.bookmarks) {
    if (bookmark.isDeleted || isInTrash(snapshot, bookmark)) continue
    const locations = bookmark.locations ?? []
    const locationText = locations.map((location) => groupNames.get(location.groupId) ?? '').join(' ')
    const searchText = [bookmark.title, bookmark.url, bookmark.desc ?? '', ...(bookmark.tags ?? []), locationText].join(' ')
    if (!matchesQuery(searchText, query)) continue
    const inActiveSubgroup = locations.some((item) => item.subGroupId === snapshot.activeSubGroupId)
    const inActiveGroup = locations.some((item) => item.groupId === snapshot.activeGroupId)
    candidates.push({
      kind: 'bookmark',
      id: bookmark.id,
      titleSnapshot: bookmark.title || bookmark.url,
      descriptionSnapshot: bookmark.desc || bookmark.url,
      searchText,
      priority: inActiveSubgroup ? 0 : inActiveGroup ? 1 : 3
    })
  }

  for (const group of snapshot.groups) {
    if (group.id === TRASH_GROUP_ID || group.isDeleted) continue
    const groupText = `${group.name} ${group.children.filter((sub) => !sub.isDeleted).map((sub) => sub.name).join(' ')}`
    if (matchesQuery(groupText, query)) {
      candidates.push({
        kind: 'group',
        id: group.id,
        titleSnapshot: group.name,
        descriptionSnapshot: '一级分组',
        searchText: groupText,
        priority: group.id === snapshot.activeGroupId ? 0 : 4
      })
    }
    for (const subgroup of group.children) {
      if (subgroup.isDeleted) continue
      const searchText = `${group.name} ${subgroup.name}`
      if (!matchesQuery(searchText, query)) continue
      candidates.push({
        kind: 'subgroup',
        id: subgroup.id,
        groupId: group.id,
        titleSnapshot: subgroup.name,
        descriptionSnapshot: `${group.name} / 二级分组`,
        searchText,
        priority: subgroup.id === snapshot.activeSubGroupId ? 0 : group.id === snapshot.activeGroupId ? 2 : 5
      })
    }
  }

  return candidates
    .sort((a, b) =>
      a.priority - b.priority ||
      a.titleSnapshot.localeCompare(b.titleSnapshot, 'zh-CN', { numeric: true }) ||
      `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)
    )
    .slice(0, 30)
    .map(({ priority: _priority, ...item }) => item)
}

export function dedupeBookmarkAiReferences(references: readonly BookmarkAiReference[]) {
  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.id}`
    if (!reference.id || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function validateBookmarkAiReferences(
  references: readonly BookmarkAiReference[],
  snapshot: BookmarkAiLibrarySnapshot
): BookmarkAiReferenceValidation {
  const valid: BookmarkAiReference[] = []
  const invalid: InvalidBookmarkAiReference[] = []
  const bookmarks = new Map(snapshot.bookmarks.map((bookmark) => [bookmark.id, bookmark]))
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]))

  for (const reference of dedupeBookmarkAiReferences(references)) {
    if (reference.kind === 'bookmark') {
      const bookmark = bookmarks.get(reference.id)
      if (!bookmark) invalid.push({ reference, reason: 'missing', message: `书签“${reference.titleSnapshot}”已不存在` })
      else if (bookmark.isDeleted) invalid.push({ reference, reason: 'deleted', message: `书签“${reference.titleSnapshot}”已删除` })
      else if (isInTrash(snapshot, bookmark)) invalid.push({ reference, reason: 'trashed', message: `书签“${reference.titleSnapshot}”在回收站中` })
      else valid.push(reference)
      continue
    }
    const groupId = reference.kind === 'group' ? reference.id : reference.groupId
    const group = groupId ? groups.get(groupId) : undefined
    if (!group) invalid.push({ reference, reason: 'missing', message: `分组“${reference.titleSnapshot}”已不存在` })
    else if (group.isDeleted || group.id === TRASH_GROUP_ID) invalid.push({ reference, reason: 'deleted', message: `分组“${reference.titleSnapshot}”不可用` })
    else if (reference.kind === 'subgroup') {
      const subgroup = group.children.find((item) => item.id === reference.id)
      if (!subgroup) invalid.push({ reference, reason: 'missing', message: `子分组“${reference.titleSnapshot}”已不存在` })
      else if (subgroup.isDeleted) invalid.push({ reference, reason: 'deleted', message: `子分组“${reference.titleSnapshot}”已删除` })
      else valid.push(reference)
    } else valid.push(reference)
  }
  return { valid, invalid }
}

export function buildBookmarkAiComposerPayload(
  tokens: readonly BookmarkAiComposerToken[],
  skills: readonly BookmarkAiSkillCommand[],
  images: readonly BookmarkAiImageAttachment[] = []
): BookmarkAiComposerPayload {
  let promptText = ''
  let freeformText = ''
  const references: BookmarkAiReference[] = []
  for (const token of tokens) {
    if (token.type === 'text') {
      promptText += token.text
      freeformText += token.text
    } else {
      promptText += `@${token.reference.titleSnapshot}`
      references.push(token.reference)
    }
  }
  const normalizedPrompt = promptText.trim()
  return {
    promptText: normalizedPrompt,
    freeformText: freeformText.trim(),
    tokens: [...tokens],
    references: dedupeBookmarkAiReferences(references),
    images: [...images],
    invokedSkill: resolveInvokedBookmarkAiSkill(normalizedPrompt, skills),
    requiredCapabilities: { imageInput: images.length > 0 }
  }
}

/** 持久化草稿/会话时使用：保证 dataUrl 不进入本地数据库。 */
export function toBookmarkAiComposerPersistedPayload(
  payload: BookmarkAiComposerPayload
): BookmarkAiComposerPersistedPayload {
  return {
    promptText: payload.promptText,
    freeformText: payload.freeformText,
    tokens: payload.tokens,
    references: payload.references,
    images: payload.images.map(({ dataUrl: _dataUrl, ...metadata }) => metadata),
    invokedSkill: payload.invokedSkill
      ? (({ content: _content, ...skill }) => skill)(payload.invokedSkill)
      : null,
    requiredCapabilities: payload.requiredCapabilities
  }
}
