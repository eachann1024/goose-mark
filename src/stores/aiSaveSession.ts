import { create } from 'zustand'
import { runAICreate, type AICreateEvent, type AICreatePath } from '@/services/aiCreate'
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
        set({ phase: 'done' })
        break
      case 'exists':
        set({
          phase: 'exists',
          icon: event.icon,
          title: event.title,
          description: event.description,
          path: event.path,
          location: event.location
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
async function runMock(variant: string, emit: (event: AICreateEvent) => void) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const url = 'https://github.com/pmndrs/zustand'
  await wait(400)
  if (variant === 'reject') {
    emit({ type: 'error', message: '检测不到书签', rejected: true })
    return
  }
  if (variant === 'error') {
    emit({ type: 'url', url })
    await wait(900)
    emit({ type: 'error', message: '请求超时' })
    return
  }
  emit({ type: 'url', url })
  if (variant === 'exists') {
    await wait(300)
    emit({
      type: 'exists',
      title: 'Zustand',
      description: '轻量的 React 状态管理库',
      icon: { type: 'remote', src: 'https://github.githubassets.com/favicons/favicon.svg' },
      location: null,
      path: { groupName: '开发', subGroupName: '前端', createdGroup: false, createdSub: false }
    })
    return
  }
  await wait(1200)
  emit({
    type: 'site',
    icon: variant === 'noicon' ? null : { type: 'remote', src: 'https://github.githubassets.com/favicons/favicon.svg' },
    pageTitle: 'GitHub - pmndrs/zustand',
    pageDesc: 'Bear necessities for state management in React'
  })
  await wait(1600)
  emit({ type: 'draft', title: 'Zustand 状态管理', description: '小巧、快速、可扩展的 React 状态管理方案，基于 hooks 的极简 API，无需 Provider 包裹。' })
  await wait(400)
  const created = variant === 'new'
  const placement = {
    groupId: 'mock-g',
    subGroupId: 'mock-s',
    groupName: '开发',
    subGroupName: created ? '状态管理' : '前端',
    createdGroup: false,
    createdSub: created
  }
  emit({ type: 'placement', ...placement })
  await wait(200)
  emit({ type: 'done', title: 'Zustand 状态管理', placement })
}
