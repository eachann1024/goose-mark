import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import { isAISaveRunning, startAISave } from '@/stores/aiSaveSession'
import { type HomeItem } from './viewModel'
import { type Screen } from './homeTypes'

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
  clearSearch,
  setScreen,
  aiCreateFnRef
}: {
  clearSearch: () => void
  setScreen: (screen: Screen) => void
  aiCreateFnRef: React.RefObject<(text: string) => void>
}) {
  const trigger = useCallback((text: string) => {
    clearSearch()
    setScreen('aiSave')
    // 已有任务进行中：只切到进度页，不重复启动
    if (isAISaveRunning()) return
    startAISave(text)
  }, [clearSearch, setScreen])

  aiCreateFnRef.current = trigger

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __aiSave?: (text: string) => void }
    w.__aiSave = trigger
    return () => { delete w.__aiSave }
  }, [trigger])
}
