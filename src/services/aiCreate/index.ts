import { runAIText, type AIStructuredOutput } from '@/lib/aiProvider'
import { parseAIJsonObject, truncateAIText } from '@/lib/aiOutput'
import { TRASH_GROUP_ID, useBookmarkStore } from '@/stores/bookmark'
import { fetchAndCacheIcon } from '@/services/iconCache'
import { fetchPageContent } from '@/services/metadata/content'
import { isSamePage } from '@/services/metadata/quality'
import type { BookmarkLocation, IconSource } from '@/types/bookmark'
import { extractUrlCandidates } from './extractUrl'
import { resolvePlacement, type Placement } from './placement'
import { getAICreateSettings } from './settings'
import {
  JUDGE_OUTPUT, JUDGE_SYSTEM, ORGANIZE_OUTPUT, ORGANIZE_SYSTEM, PICK_HIT_SYSTEM, PICK_URL_OUTPUT, PICK_URL_SYSTEM,
  SEARCH_QUERY_OUTPUT, SEARCH_QUERY_SYSTEM,
  buildJudgePrompt, buildOrganizePrompt, buildPickHitPrompt, buildPickUrlPrompt, buildSearchQueryPrompt, type PromptGroup
} from './prompts'
import { searchWeb, type SearchHit } from './webSearch'

/** 分组落点（展示用） */
export interface AICreatePath {
  groupName: string
  subGroupName: string
  createdGroup: boolean
  createdSub: boolean
}

/** 执行过程事件：每一步拿到数据立即发出，供 UI 渐进揭示 */
export type AICreateEvent =
  | { type: 'judged' }
  | { type: 'searching' }
  | { type: 'url'; url: string }
  | { type: 'site'; icon: IconSource | null; pageTitle: string; pageDesc: string }
  | { type: 'draft'; title: string; description: string }
  | ({ type: 'placement' } & AICreatePath & BookmarkLocation)
  | { type: 'done'; title: string; placement: Placement }
  | {
      type: 'exists'
      title: string
      description: string
      icon: IconSource | null
      location: BookmarkLocation | null
      path: AICreatePath | null
    }
  | { type: 'error'; message: string; rejected?: boolean }

export const BOOKMARK_NOT_FOUND = '检测不到书签'

export class BookmarkNotFound extends Error {
  readonly rejected = true
  constructor() {
    super(BOOKMARK_NOT_FOUND)
  }
}

function isRejected(err: unknown) {
  return err instanceof BookmarkNotFound
}

export type AICreateResult =
  | { status: 'exists'; title: string; location: BookmarkLocation | null }
  | { status: 'created'; title: string; placement: Placement }

const TITLE_MAX = 20
const DESC_MAX = 150
const SAMPLE_COUNT = 4

async function askJSON(
  messages: { role: 'system' | 'user'; content: string }[],
  output: AIStructuredOutput
) {
  const raw = await runAIText(getAICreateSettings().ai, messages, { output })
  return parseAIJsonObject(raw)
}

function fallbackQuery(text: string) {
  const cleaned = text
    .replace(/[，。！？、；,.!?]/g, ' ')
    .replace(/帮我|请你|麻烦|查询一下|查一下|搜一下|搜索一下|看一下|了解一下|这个网站|是做什么的|做什么的|干什么的|并且|然后|收藏到|保存到|加到|放到|分组里|分组/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || text.trim()).slice(0, 80)
}

async function resolveSearchQuery(text: string) {
  try {
    const picked = await askJSON(
      [{ role: 'system', content: SEARCH_QUERY_SYSTEM }, { role: 'user', content: buildSearchQueryPrompt(text) }],
      SEARCH_QUERY_OUTPUT
    )
    const query = typeof picked.query === 'string' ? picked.query.trim() : ''
    if (query) return query.slice(0, 80)
  } catch {
    // 抽词失败时用原话里剩下的关键词
  }
  return fallbackQuery(text)
}

async function assertIntent(text: string) {
  if (!text.trim()) throw new BookmarkNotFound()
  const picked = await askJSON(
    [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: buildJudgePrompt(text) }],
    JUDGE_OUTPUT
  )
  if (picked.ok !== true) throw new BookmarkNotFound()
}

async function pickHit(text: string, hits: SearchHit[]) {
  const picked = await askJSON(
    [{ role: 'system', content: PICK_HIT_SYSTEM }, { role: 'user', content: buildPickHitPrompt(text, hits) }],
    PICK_URL_OUTPUT
  )
  const url = typeof picked.url === 'string' ? picked.url : ''
  const hit = hits.find((item) => item.url === url || isSamePage(url, item.url))
  if (!hit) throw new BookmarkNotFound()
  return hit.url
}

async function resolveUrl(text: string, emit: (event: AICreateEvent) => void): Promise<string> {
  const candidates = extractUrlCandidates(text)
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    try {
      const picked = await askJSON(
        [{ role: 'system', content: PICK_URL_SYSTEM }, { role: 'user', content: buildPickUrlPrompt(text, candidates) }],
        PICK_URL_OUTPUT
      )
      const url = typeof picked.url === 'string' ? picked.url : ''
      return candidates.find((c) => c === url || isSamePage(url, c)) ?? candidates[0]
    } catch {
      return candidates[0]
    }
  }

  emit({ type: 'searching' })
  const query = await resolveSearchQuery(text)
  if (!query) throw new BookmarkNotFound()
  const hits = await searchWeb(query)
  if (!hits.length) throw new BookmarkNotFound()
  return pickHit(text, hits)
}

function findExisting(url: string) {
  const store = useBookmarkStore.getState()
  return store.bookmarks.find((b) => !b.isDeleted && !store.isBookmarkInTrash(b) && isSamePage(b.url, url))
}

function buildGroupTree(): PromptGroup[] {
  const { groups, bookmarks } = useBookmarkStore.getState()
  const titleOf = new Map(bookmarks.filter((b) => !b.isDeleted).map((b) => [b.id, b.title]))
  return groups
    .filter((g) => g.id !== TRASH_GROUP_ID)
    .map((g) => ({
      id: g.id,
      name: g.name,
      subGroups: g.children.map((s) => ({
        id: s.id,
        name: s.name,
        samples: s.bookmarkIds.map((id) => titleOf.get(id)).filter((t): t is string => !!t).slice(0, SAMPLE_COUNT)
      }))
    }))
}

const optionalString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

function existingPath(location: BookmarkLocation | null): AICreatePath | null {
  if (!location) return null
  const group = useBookmarkStore.getState().groups.find((g) => g.id === location.groupId)
  const sub = group?.children.find((c) => c.id === location.subGroupId)
  if (!group || !sub) return null
  return { groupName: group.name, subGroupName: sub.name, createdGroup: false, createdSub: false }
}

/** AI 创建书签：文本里没有网址时先搜索，再抓取、整理并保存 */
export async function runAICreate(
  input: string,
  onEvent: (event: AICreateEvent) => void = () => {}
): Promise<AICreateResult> {
  try {
    const result = await runSteps(input, onEvent)
    return result
  } catch (err) {
    onEvent({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      rejected: isRejected(err)
    })
    throw err
  }
}

async function runSteps(input: string, emit: (event: AICreateEvent) => void): Promise<AICreateResult> {
  await assertIntent(input)
  emit({ type: 'judged' })
  const url = await resolveUrl(input, emit)
  emit({ type: 'url', url })
  const existing = findExisting(url)
  if (existing) {
    const location = useBookmarkStore.getState().getBookmarkLocations(existing.id)[0] ?? null
    const title = existing.title || existing.url
    emit({
      type: 'exists',
      title,
      description: existing.desc || '',
      icon: existing.icon ?? null,
      location,
      path: existingPath(location)
    })
    return { status: 'exists', title, location }
  }

  const [site, content] = await Promise.all([
    fetchAndCacheIcon(url).catch(() => null),
    fetchPageContent(url).catch(() => '')
  ])
  const { title: pageTitle, description: pageDesc, ...icon } = site ?? {}
  const siteIcon = site ? (icon as IconSource) : null
  emit({ type: 'site', icon: siteIcon, pageTitle: pageTitle || '', pageDesc: pageDesc || '' })

  const { permissions } = getAICreateSettings()
  const draft = await askJSON(
    [
      { role: 'system', content: ORGANIZE_SYSTEM },
      {
        role: 'user',
        content: buildOrganizePrompt({
          url,
          title: pageTitle || '',
          description: pageDesc || '',
          content,
          groups: buildGroupTree(),
          permissions,
          instruction: input
        })
      }
    ],
    ORGANIZE_OUTPUT
  )
  const title = truncateAIText(draft.title, TITLE_MAX) || truncateAIText(pageTitle, TITLE_MAX) || new URL(url).hostname
  const desc = truncateAIText(draft.description, DESC_MAX)
  emit({ type: 'draft', title, description: desc })

  const placement = resolvePlacement(
    {
      groupId: optionalString(draft.groupId),
      subGroupId: optionalString(draft.subGroupId),
      newGroupName: optionalString(draft.newGroupName),
      newSubGroupName: optionalString(draft.newSubGroupName)
    },
    permissions
  )
  emit({ type: 'placement', ...placement })
  useBookmarkStore.getState().addBookmark(
    { title, url, desc, tags: [], icon: siteIcon ?? undefined },
    [{ groupId: placement.groupId, subGroupId: placement.subGroupId }]
  )
  emit({ type: 'done', title, placement })
  return { status: 'created', title, placement }
}
