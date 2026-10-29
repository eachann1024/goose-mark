import { create } from 'zustand'
import { runAICreate, type AICreateEvent, type AICreatePath } from '@/services/aiCreate'
import { TRASH_GROUP_ID, useBookmarkStore } from '@/stores/bookmark'
import type { BookmarkLocation, IconSource } from '@/types/bookmark'

export type AISaveStep = 'judge' | 'detect' | 'fetch' | 'organize' | 'save'
export type AISavePhase = 'idle' | 'running' | 'done' | 'exists' | 'error'

export const AI_SAVE_STEPS: AISaveStep[] = ['judge', 'detect', 'fetch', 'organize', 'save']

interface AISaveData {
  url: string | null
  /** undefined：尚未抓取；null：抓取完成但没有图标 */
  icon: IconSource | null | undefined
  pageTitle: string
  pageDesc: string
  searched: boolean
  rejected: boolean
  title: string | null
  description: string | null
  path: AICreatePath | null
  location: BookmarkLocation | null
  /** 刚保存或已存在的书签，供完成后改分组 */
  bookmarkId: string | null
  error: string | null
}

interface AISaveSessionState extends AISaveData {
  sessionId: number
  input: string
  phase: AISavePhase
  step: AISaveStep
  begin: (input: string) => number
  apply: (sessionId: number, event: AICreateEvent) => void
}

const EMPTY: AISaveData = {
  url: null,
  icon: undefined,
  pageTitle: '',
  pageDesc: '',
  searched: false,
  rejected: false,
  title: null,
  description: null,
  path: null,
  location: null,
  bookmarkId: null,
  error: null
}

export const useAISaveSession = create<AISaveSessionState>((set, get) => ({
  ...EMPTY,
  sessionId: 0,
  input: '',
  phase: 'idle',
  step: 'judge',
  begin: (input) => {
    const sessionId = get().sessionId + 1
    set({ ...EMPTY, sessionId, input, phase: 'running', step: 'judge' })
    return sessionId
  },
  apply: (sessionId, event) => {
    if (get().sessionId !== sessionId) return
    switch (event.type) {
      case 'judged':
        set({ step: 'detect' })
        break
      case 'searching':
        set({ searched: true, step: 'detect' })
        break
      case 'url':
        set({ url: event.url, step: 'fetch' })
        break
      case 'site':
        set({ icon: event.icon, pageTitle: event.pageTitle, pageDesc: event.pageDesc, step: 'organize' })
        break
      case 'draft':
        set({ title: event.title, description: event.description, step: 'save' })
        break
      case 'placement': {
        const { groupName, subGroupName, createdGroup, createdSub, groupId, subGroupId } = event
        set({ path: { groupName, subGroupName, createdGroup, createdSub }, location: { groupId, subGroupId } })
        break
      }
      case 'done':
        set({ phase: 'done', bookmarkId: event.bookmarkId })
        break
      case 'exists':
        set({
          phase: 'exists',
          icon: event.icon,
          title: event.title,
          description: event.description,
          path: event.path,
          location: event.location,
          bookmarkId: event.bookmarkId
        })
        break
      case 'error':
        set({ phase: 'error', error: event.message, rejected: event.rejected === true })
        break
    }
  }
}))

export const isAISaveRunning = () => useAISaveSession.getState().phase === 'running'

/** 开始一次 AI 保存会话；执行与 UI 解耦，UI 只订阅 store */
export function startAISave(input: string) {
  const { begin, apply } = useAISaveSession.getState()
  const id = begin(input)
  const emit = (event: AICreateEvent) => apply(id, event)
  if (import.meta.env.DEV && input.startsWith('mock:')) {
    void runMock(input.slice(5), emit)
    return
  }
  runAICreate(input, emit).catch(() => {})
}

// ---- 仅开发环境：模拟事件序列，走完各阶段（mock:ok / mock:new / mock:noicon / mock:exists / mock:error）----
const MOCK_URL = 'https://kimi.moonshot.cn/chat'
const MOCK_TITLE = 'Kimi 智能助手'
const MOCK_DESC = '月之暗面出品的对话助手，擅长超长文本阅读、联网搜索与文件解析。'

/** 把模拟书签放进真实分组，完成后的「存到」才能沿用同一条移动逻辑。 */
function mockPlace(icon: IconSource | null) {
  const store = useBookmarkStore.getState()
  const groups = store.groups.filter((g) => g.id !== TRASH_GROUP_ID && g.children.length > 0)
  const group = groups.find((g) => g.name === 'AI') ?? groups[0]
  const sub = group?.children[0]
  if (!group || !sub) return null
  const bookmark = store.addBookmark(
    { title: MOCK_TITLE, url: MOCK_URL, desc: MOCK_DESC, tags: [], icon: icon ?? undefined },
    [{ groupId: group.id, subGroupId: sub.id }]
  )
  return {
    bookmarkId: bookmark.id,
    groupId: group.id,
    subGroupId: sub.id,
    groupName: group.name,
    subGroupName: sub.name
  }
}

async function runMock(variant: string, emit: (event: AICreateEvent) => void) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  await wait(400)
  if (variant === 'reject') {
    emit({ type: 'error', message: '检测不到书签', rejected: true })
    return
  }
  if (variant === 'error') {
    emit({ type: 'url', url: MOCK_URL })
    await wait(900)
    emit({ type: 'error', message: '请求超时' })
    return
  }
  const icon: IconSource | null = variant === 'noicon' ? null : { type: 'text', value: 'K', bgColor: '#16171b' }
  emit({ type: 'url', url: MOCK_URL })
  if (variant === 'exists') {
    await wait(300)
    const placed = mockPlace(icon)
    emit({
      type: 'exists',
      title: MOCK_TITLE,
      description: MOCK_DESC,
      icon,
      location: placed ? { groupId: placed.groupId, subGroupId: placed.subGroupId } : null,
      path: placed
        ? { groupName: placed.groupName, subGroupName: placed.subGroupName, createdGroup: false, createdSub: false }
        : null,
      bookmarkId: placed?.bookmarkId ?? null
    })
    return
  }
  await wait(1200)
  emit({ type: 'site', icon, pageTitle: MOCK_TITLE, pageDesc: MOCK_DESC })
  await wait(1600)
  emit({ type: 'draft', title: MOCK_TITLE, description: MOCK_DESC })
  await wait(400)
  const placed = mockPlace(icon)
  if (!placed) {
    emit({ type: 'error', message: '没有可用分组' })
    return
  }
  const placement = {
    groupId: placed.groupId,
    subGroupId: placed.subGroupId,
    groupName: placed.groupName,
    subGroupName: placed.subGroupName,
    createdGroup: false,
    createdSub: variant === 'new'
  }
  emit({ type: 'placement', ...placement })
  await wait(200)
  emit({ type: 'done', title: MOCK_TITLE, placement, bookmarkId: placed.bookmarkId })
}
