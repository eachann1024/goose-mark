import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import { flushBookmarkStorePersistence, useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { runAggressiveAiSave, AggressiveAiSaveError, undoAggressiveAiSave, type AggressiveAiSaveResult } from '@/services/aggressiveAiSave'
import { bookmarkToHomeItem } from './viewModel'
import { type Screen, type AggressiveSaveJob, type AggressiveSaveSuccess, type AggressiveSaveFailure } from './homeTypes'
import { aggressiveSaveHostOf } from './homeRuntime'
import { type HomeNavigationBindings, type HomeBookmarkBindings } from './homeInteractionTypes'

export function useHomeAggressivePanel({
  setFormEditItem,
  setFormKey,
  setScreen,
  setAggressiveSaveUrl,
  setAggressiveSaveAutoStart,
  setAggressiveSaveFailure,
  aggressiveSaveSuccessTimersRef,
  setAggressiveSaveSuccesses
}: Pick<HomeBookmarkBindings, 'setFormEditItem' | 'setFormKey'> & {
  setScreen: React.Dispatch<React.SetStateAction<Screen>>
  setAggressiveSaveUrl: React.Dispatch<React.SetStateAction<string>>
  setAggressiveSaveAutoStart: React.Dispatch<React.SetStateAction<boolean>>
  setAggressiveSaveFailure: React.Dispatch<React.SetStateAction<AggressiveSaveFailure | null>>
  aggressiveSaveSuccessTimersRef: React.RefObject<Map<number, number>>
  setAggressiveSaveSuccesses: React.Dispatch<React.SetStateAction<AggressiveSaveSuccess[]>>
}) {

  const openAggressiveSavePanel = useCallback((
    url?: string,
    options: { autoStart?: boolean; clearFailure?: boolean } = {}
  ) => {
    if (!useSettingsStore.getState().aiEnabled) {
      setFormEditItem(null)
      setFormKey((k) => k + 1)
      setScreen('add')
      return
    }
    if (url !== undefined) setAggressiveSaveUrl(url)
    setAggressiveSaveAutoStart(Boolean(options.autoStart))
    if (options.clearFailure) setAggressiveSaveFailure(null)
    setScreen('ai-aggressive-save')
  }, [])

  const clearAggressiveSaveSuccessTimer = useCallback((id: number) => {
    const timer = aggressiveSaveSuccessTimersRef.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    aggressiveSaveSuccessTimersRef.current.delete(id)
  }, [])

  const dismissAggressiveSaveSuccess = useCallback((id: number) => {
    clearAggressiveSaveSuccessTimer(id)
    setAggressiveSaveSuccesses((items) => items.filter((item) => item.id !== id))
  }, [clearAggressiveSaveSuccessTimer])

  const scheduleAggressiveSaveSuccessDismiss = useCallback((id: number, delay = 6200) => {
    clearAggressiveSaveSuccessTimer(id)
    const timer = window.setTimeout(() => dismissAggressiveSaveSuccess(id), delay)
    aggressiveSaveSuccessTimersRef.current.set(id, timer)
  }, [clearAggressiveSaveSuccessTimer, dismissAggressiveSaveSuccess])

  return { openAggressiveSavePanel, clearAggressiveSaveSuccessTimer, dismissAggressiveSaveSuccess, scheduleAggressiveSaveSuccessDismiss }
}

export function useHomeAggressiveQueue({
  dismissAggressiveSaveSuccess,
  fireToast,
  setFormEditItem,
  setFormKey,
  setScreen,
  aggressiveSaveRunnerRef,
  aggressiveSaveQueueRef,
  setAggressiveSaveJobs,
  aggressiveSaveMountedRef,
  setAggressiveSaveFailure,
  setAggressiveSaveUrl,
  setAggressiveSaveAutoStart,
  setAggressiveSaveSuccesses,
  jumpToAggressiveSaveResult,
  scheduleAggressiveSaveSuccessDismiss,
  getScreenRef,
  pumpAggressiveSaveQueueRef,
  aggressiveSaveJobSeqRef,
  applySearchVal,
  view
}: Pick<HomeNavigationBindings, 'setScreen' | 'view'> &
  Pick<HomeBookmarkBindings, 'fireToast' | 'setFormEditItem' | 'setFormKey'> & {
  dismissAggressiveSaveSuccess: (id: number) => void
  aggressiveSaveRunnerRef: React.RefObject<boolean>
  aggressiveSaveQueueRef: React.RefObject<{ id: number; url: string; }[]>
  setAggressiveSaveJobs: React.Dispatch<React.SetStateAction<AggressiveSaveJob[]>>
  aggressiveSaveMountedRef: React.RefObject<boolean>
  setAggressiveSaveFailure: React.Dispatch<React.SetStateAction<AggressiveSaveFailure | null>>
  setAggressiveSaveUrl: React.Dispatch<React.SetStateAction<string>>
  setAggressiveSaveAutoStart: React.Dispatch<React.SetStateAction<boolean>>
  setAggressiveSaveSuccesses: React.Dispatch<React.SetStateAction<AggressiveSaveSuccess[]>>
  jumpToAggressiveSaveResult: (result: AggressiveAiSaveResult) => void
  scheduleAggressiveSaveSuccessDismiss: (id: number, delay?: number) => void
  getScreenRef: () => React.RefObject<Screen>
  pumpAggressiveSaveQueueRef: React.RefObject<() => void>
  aggressiveSaveJobSeqRef: React.RefObject<number>
  applySearchVal: (text: string, fromSubInput?: boolean) => void
}) {

  const takeOverAggressiveSave = useCallback(
    (notice: AggressiveSaveSuccess) => {
      const bookmark = useBookmarkStore
        .getState()
        .bookmarks.find((item) => item.id === notice.result.bookmark.id && !item.isDeleted)
      dismissAggressiveSaveSuccess(notice.id)
      if (!bookmark) {
        fireToast('书签已不存在，无法接管')
        return
      }
      setFormEditItem(bookmarkToHomeItem(bookmark))
      setFormKey((key) => key + 1)
      setScreen('add')
    },
    [dismissAggressiveSaveSuccess, fireToast]
  )

  const undoAggressiveSave = useCallback(
    (notice: AggressiveSaveSuccess) => {
      const outcome = undoAggressiveAiSave(notice.result)
      dismissAggressiveSaveSuccess(notice.id)
      if (outcome === 'removed') fireToast('已撤销，书签已移入回收站')
      else if (outcome === 'restored') fireToast('已撤销，本次 AI 修改已恢复')
      else fireToast('书签已不存在，无需撤销')
      void flushBookmarkStorePersistence()
    },
    [dismissAggressiveSaveSuccess, fireToast]
  )

  const runAggressiveSaveQueue = useCallback(async () => {
    if (aggressiveSaveRunnerRef.current) return
    aggressiveSaveRunnerRef.current = true

    while (aggressiveSaveQueueRef.current.length > 0) {
      const job = aggressiveSaveQueueRef.current.shift()
      if (!job) break
      setAggressiveSaveJobs((items) =>
        items.map((item) => item.id === job.id
          ? { ...item, status: 'running', phase: 'validating', detail: '正在检查链接和 AI 设置…' }
          : item)
      )

      try {
        const result = await runAggressiveAiSave(job.url, {
          onProgress: ({ phase, detail }) => {
            if (!aggressiveSaveMountedRef.current) return
            setAggressiveSaveJobs((items) =>
              items.map((item) => item.id === job.id ? { ...item, phase, detail } : item)
            )
          }
        })
        if (!aggressiveSaveMountedRef.current) break
        // Promise 返回即进入成功终态；不要再依赖中间定时器，否则 uTools
        // 窗口被挂起或旧内核节流时会永远停在 completed 进度态。
        setAggressiveSaveJobs((items) => items.filter((item) => item.id !== job.id))
        setAggressiveSaveFailure((failure) => (failure?.id === job.id ? null : failure))
        setAggressiveSaveUrl('')
        setAggressiveSaveAutoStart(false)
        const notice: AggressiveSaveSuccess = { id: job.id, result }
        setAggressiveSaveSuccesses((items) => [notice, ...items].slice(0, 2))
        jumpToAggressiveSaveResult(result)
        scheduleAggressiveSaveSuccessDismiss(job.id)
        void flushBookmarkStorePersistence()
      } catch (error) {
        setAggressiveSaveJobs((items) => items.filter((item) => item.id !== job.id))
        const normalized = error instanceof AggressiveAiSaveError
          ? error
          : new AggressiveAiSaveError('ai_failed', 'AI 快速保存失败', {
              detail: error instanceof Error ? error.message : String(error || '未知错误'),
              recovery: '请检查 AI 设置后重试。'
            })
        const failure: AggressiveSaveFailure = {
          id: job.id,
          url: job.url,
          host: aggressiveSaveHostOf(job.url),
          ...normalized.toFailure()
        }
        setAggressiveSaveUrl(job.url)
        setAggressiveSaveAutoStart(false)
        setAggressiveSaveFailure(failure)
        if (getScreenRef().current !== 'ai-aggressive-save') {
          fireToast(failure.message, {
            description: `${failure.detail} 链接已保留。`,
            duration: 10_000,
            tone: 'error',
            action: 'open-ai-save'
          })
        }
      }
    }

    aggressiveSaveRunnerRef.current = false
  }, [fireToast, jumpToAggressiveSaveResult, scheduleAggressiveSaveSuccessDismiss])
  pumpAggressiveSaveQueueRef.current = () => {
    void runAggressiveSaveQueue()
  }

  const enqueueAggressiveSave = useCallback(
    (url: string) => {
      const id = ++aggressiveSaveJobSeqRef.current
      aggressiveSaveQueueRef.current.push({ id, url })
      setAggressiveSaveFailure(null)
      setAggressiveSaveJobs((items) => [
        ...items,
        {
          id,
          url,
          host: aggressiveSaveHostOf(url),
          phase: 'queued',
          detail: '排队中…',
          status: 'queued'
        }
      ])
      setAggressiveSaveUrl(url)
      setAggressiveSaveAutoStart(false)
      // 粘贴或提交后立即回首页；任务在右上角后台状态区继续执行。
      applySearchVal('')
      setScreen(view)
      queueMicrotask(() => pumpAggressiveSaveQueueRef.current())
    },
    [applySearchVal, view]
  )

  return { takeOverAggressiveSave, undoAggressiveSave, enqueueAggressiveSave }
}

export function useHomeAiAvailability({
  screen,
  aiEnabled,
  setFormEditItem,
  setFormKey,
  setScreen
}: Pick<HomeNavigationBindings, 'screen' | 'setScreen'> &
  Pick<HomeBookmarkBindings, 'setFormEditItem' | 'setFormKey'> & {
  aiEnabled: boolean
}) {

  useEffect(() => {
    if (screen === 'ai-aggressive-save' && !aiEnabled) {
      setFormEditItem(null)
      setFormKey((k) => k + 1)
      setScreen('add')
    }
  }, [screen, aiEnabled])
}
