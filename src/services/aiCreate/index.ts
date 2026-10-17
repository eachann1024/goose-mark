import { runAIText, type AIStructuredOutput } from '@/lib/aiProvider'
import { parseAIJsonObject, truncateAIText } from '@/lib/aiOutput'
import { TRASH_GROUP_ID, useBookmarkStore } from '@/stores/bookmark'
import { fetchAndCacheIcon } from '@/services/iconCache'
import { fetchPageContent } from '@/services/metadata/content'
import { isSamePage } from '@/services/metadata/quality'
import type { BookmarkLocation } from '@/types/bookmark'
import { extractUrlCandidates } from './extractUrl'
import { resolvePlacement, type Placement } from './placement'
import { getAICreateSettings } from './settings'
import {
  ORGANIZE_OUTPUT, ORGANIZE_SYSTEM, PICK_URL_OUTPUT, PICK_URL_SYSTEM,
  buildOrganizePrompt, buildPickUrlPrompt, type PromptGroup
} from './prompts'

export type AICreateStage = '识别网址…' | '抓取网页…' | 'AI 整理中…' | '保存中…'

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

async function resolveUrl(text: string): Promise<string> {
  const candidates = extractUrlCandidates(text)
  if (candidates.length === 0) throw new Error('未识别到网址')
  if (candidates.length === 1) return candidates[0]
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

/** AI 创建书签：识别网址 → 抓取 → AI 整理 → 校验分组并保存 */
export async function runAICreate(
  input: string,
  onProgress: (stage: AICreateStage) => void = () => {}
): Promise<AICreateResult> {
  onProgress('识别网址…')
  const url = await resolveUrl(input)
  const existing = findExisting(url)
  if (existing) {
    return { status: 'exists', title: existing.title || existing.url, location: useBookmarkStore.getState().getBookmarkLocations(existing.id)[0] ?? null }
  }

  onProgress('抓取网页…')
  const [site, content] = await Promise.all([
    fetchAndCacheIcon(url).catch(() => null),
    fetchPageContent(url).catch(() => '')
  ])
  const { title: pageTitle, description: pageDesc, ...icon } = site ?? {}

  onProgress('AI 整理中…')
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
          permissions
        })
      }
    ],
    ORGANIZE_OUTPUT
  )
  const title = truncateAIText(draft.title, TITLE_MAX) || truncateAIText(pageTitle, TITLE_MAX) || new URL(url).hostname
  const desc = truncateAIText(draft.description, DESC_MAX)

  onProgress('保存中…')
  const placement = resolvePlacement(
    {
      groupId: optionalString(draft.groupId),
      subGroupId: optionalString(draft.subGroupId),
      newGroupName: optionalString(draft.newGroupName),
      newSubGroupName: optionalString(draft.newSubGroupName)
    },
    permissions
  )
  useBookmarkStore.getState().addBookmark(
    { title, url, desc, tags: [], icon: site ? (icon as NonNullable<typeof site>) : undefined },
    [{ groupId: placement.groupId, subGroupId: placement.subGroupId }]
  )
  return { status: 'created', title, placement }
}
