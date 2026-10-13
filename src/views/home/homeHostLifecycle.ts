import type * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { Bookmark, Group } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore, selectAiSettings } from '@/stores/settings'
import { useUTools } from '@/hooks/useUTools'
import { getAIAvailability } from '@/lib/aiProvider'
import { UTOOLS_PLUGIN_ENTER_EVENT, UTOOLS_PLUGIN_OUT_EVENT, isDetachedUToolsWindow, readCurrentWindowPosition, moveDetachedWindowTo, getLatestUpdatedAt } from './homeRuntime'

export function useHomeLifecycle({
  toastTimer,
  aggressiveSaveMountedRef,
  aggressiveSaveSuccessTimersRef,
  aggressiveSaveRevealTimersRef,
  setScrollTimeout,
  smoothRafRef
}: {
  toastTimer: React.RefObject<number | undefined>
  aggressiveSaveMountedRef: React.RefObject<boolean>
  aggressiveSaveSuccessTimersRef: React.RefObject<Map<number, number>>
  aggressiveSaveRevealTimersRef: React.RefObject<Set<number>>
  setScrollTimeout: React.RefObject<ReturnType<typeof setTimeout> | null>
  smoothRafRef: React.RefObject<number | null>
}) {

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => {
    aggressiveSaveMountedRef.current = true
    return () => {
      aggressiveSaveMountedRef.current = false
      aggressiveSaveSuccessTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      aggressiveSaveSuccessTimersRef.current.clear()
      aggressiveSaveRevealTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      aggressiveSaveRevealTimersRef.current.clear()
    }
  }, [])
  useEffect(() => () => {
    if (setScrollTimeout.current) clearTimeout(setScrollTimeout.current)
    if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current)
  }, [])
}

export function useHomeDetachedWindow() {

  // 窗口模式 toggle 所需：记录窗口最近一次获得焦点的时间（blur 清零）。
  // uTools 唤起分离窗口时会先聚焦再发 plugin-enter，document.hasFocus() 彼时必为 true，
  // 单看它无法区分「快捷键唤起聚焦」与「窗口原本就激活时再次按下」，需配合该时间戳判断。
  const lastWindowFocusAtRef = useRef(document.hasFocus() ? Date.now() : 0)
  useEffect(() => {
    const onFocus = () => { lastWindowFocusAtRef.current = Date.now() }
    const onBlur = () => { lastWindowFocusAtRef.current = 0 }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const lastDetachedWindowPositionKeyRef = useRef('')
  const saveDetachedWindowPosition = useCallback(() => {
    if (!isDetachedUToolsWindow()) return
    const position = readCurrentWindowPosition()
    if (!position) return
    const key = `${position.x},${position.y}`
    if (key === lastDetachedWindowPositionKeyRef.current) return
    lastDetachedWindowPositionKeyRef.current = key
    useSettingsStore.getState().setDetachedWindowPosition(position)
  }, [])

  useEffect(() => {
    if (!window.utools) return

    const restore = () => {
      const position = useSettingsStore.getState().detachedWindowPosition
      window.setTimeout(() => moveDetachedWindowTo(position), 0)
      window.setTimeout(() => moveDetachedWindowTo(position), 120)
    }
    const save = () => saveDetachedWindowPosition()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save()
    }

    restore()
    const saveTimer = window.setInterval(save, 1000)
    window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, restore)
    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, save)
    window.addEventListener('blur', save)
    window.addEventListener('beforeunload', save)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(saveTimer)
      save()
      window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, restore)
      window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, save)
      window.removeEventListener('blur', save)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [saveDetachedWindowPosition])

  return { lastWindowFocusAtRef, saveDetachedWindowPosition }
}

export function useHomeStorageSync() {

  // ---- storage-sync：分离窗口/多标签场景下另一侧写入存储 → 本侧合并（对齐 App.tsx:1507-1547，
  // 略去 App 独有的本地镜像目录联动）----
  useEffect(() => {
    if (!window.utools) return
    const onStorageSync = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: string }>).detail
      const { key, value } = detail || {}
      if (!value) return
      try {
        const data = JSON.parse(value)
        if (key === 'settings' && data && typeof data === 'object') {
          const settingsStore = useSettingsStore.getState()
          const localMirrorDirectory = settingsStore.localMirrorDirectory
          const nextSettings = { ...(data as Record<string, unknown>) }
          delete nextSettings.localMirrorDirectory
          useSettingsStore.setState(nextSettings as Partial<typeof settingsStore>)
          settingsStore.setLocalMirrorDirectory(localMirrorDirectory)
        }
        if (key === 'bookmark') {
          const store = useBookmarkStore.getState()
          const incomingStamp = getLatestUpdatedAt(data)
          const localStamp = getLatestUpdatedAt({ groups: store.groups, bookmarks: store.bookmarks })
          // 严格大于才应用：persist 序列化含本窗口 active 选择，两窗口选择不同时
          // `>=` 会让等时间戳数据互相写回、BroadcastChannel 无限回弹
          if (incomingStamp > localStamp) {
            const preferredGroupId = store.activeGroupId
            const preferredSubGroupId = store.activeSubGroupId
            const nextGroups = Array.isArray((data as { groups?: unknown }).groups)
              ? (data as { groups: Group[] }).groups
              : store.groups
            const nextBookmarks = Array.isArray((data as { bookmarks?: unknown }).bookmarks)
              ? (data as { bookmarks: Bookmark[] }).bookmarks
              : store.bookmarks
            store.setData({ groups: nextGroups, bookmarks: nextBookmarks })
            store.ensureValidSelection(preferredGroupId, preferredSubGroupId)
          }
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage-sync', onStorageSync)
    return () => window.removeEventListener('storage-sync', onStorageSync)
  }, [])
}

export function useHomeFeatures({
  syncFeatures,
  bookmarks,
  aiSettingsKey
}: {
  syncFeatures: ReturnType<typeof useUTools>['syncFeatures']
  bookmarks: Bookmark[]
  aiSettingsKey: string
}) {

  // ---- syncFeatures：书签数据变化 → 注册/反注册动态 uTools 特性 ----
  // checkAiAvailable 是纯函数（读 store），直接在 callback 内调用，不需要作为依赖
  const syncUToolsFeatures = useCallback(() => {
    if (!window.utools) return
    const settings = useSettingsStore.getState()
    const { aiAggressiveSaveEnabled: aggressiveSetting } = settings
    const aiOk = getAIAvailability(selectAiSettings(settings)).ok
    const aiAggressiveSaveEnabled = !!(aggressiveSetting && aiOk)
    syncFeatures(useBookmarkStore.getState().bookmarks, { aiAggressiveSaveEnabled })
  }, [syncFeatures])

  // 书签数据变化 → 同步 uTools 特性（对齐 App.tsx:1294-1297）
  useEffect(() => {
    syncUToolsFeatures()
  }, [bookmarks, syncUToolsFeatures])

  // AI 设置变化 → 同步 uTools 特性（对齐 App.tsx:1300-1304）
  useEffect(() => {
    syncUToolsFeatures()
  }, [aiSettingsKey, syncUToolsFeatures])
}
