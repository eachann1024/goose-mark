import type * as React from 'react'
import { useCallback, useRef } from 'react'
import { runAICreate } from '@/services/aiCreate'
import { type HomeItem } from './viewModel'
import { type HomeToastHandler } from './homeInteractionTypes'

export const AI_CREATE_ID = '__ai-create__'

/** 「AI 创建书签」虚拟命令项：仅用于导航与选中，不对应真实书签 */
export const AI_CREATE_ITEM: HomeItem = {
  id: AI_CREATE_ID,
  ttl: 'AI 创建书签',
  url: '',
  host: '',
  regDomain: '',
  dsc: '',
  fav: '✦',
  favColor: 'transparent',
  favFg: 'currentColor',
  pin: false,
  tags: []
}

export function useHomeAICreate({
  fireToast,
  clearSearch,
  aiCreateFnRef
}: {
  fireToast: HomeToastHandler
  clearSearch: () => void
  aiCreateFnRef: React.RefObject<(text: string) => void>
}) {
  const busyRef = useRef(false)

  const trigger = useCallback((text: string) => {
    if (busyRef.current) {
      fireToast('已有 AI 创建任务进行中', { tone: 'error' })
      return
    }
    busyRef.current = true
    clearSearch()
    fireToast('识别网址…', { tone: 'loading' })
    runAICreate(text, (stage) => fireToast(stage, { tone: 'loading' }))
      .then((result) => {
        if (result.status === 'exists') {
          fireToast(`已存在：${result.title}`, { jump: result.location, description: '该网址已在书签中' })
          return
        }
        const { groupName, subGroupName, createdGroup, createdSub, groupId, subGroupId } = result.placement
        fireToast(`已保存：${result.title}`, {
          description: `${groupName}${createdGroup ? '（新建）' : ''}/${subGroupName}${createdSub ? '（新建）' : ''}`,
          jump: { groupId, subGroupId }
        })
      })
      .catch((err) => {
        fireToast('AI 创建失败', { tone: 'error', description: err instanceof Error ? err.message : String(err) })
      })
      .finally(() => {
        busyRef.current = false
      })
  }, [fireToast, clearSearch])

  aiCreateFnRef.current = trigger
}
