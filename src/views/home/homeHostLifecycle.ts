import type * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { useUTools } from '@/hooks/useUTools'
import { UTOOLS_PLUGIN_ENTER_EVENT, UTOOLS_PLUGIN_OUT_EVENT, isDetachedUToolsWindow, readCurrentWindowPosition, moveDetachedWindowTo } from './homeRuntime'

export function useHomeLifecycle({
  toastTimer,
  smoothRafRef
}: {
  toastTimer: React.RefObject<number | undefined>
  smoothRafRef: React.RefObject<number | null>
}) {

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => () => {
    if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current)
  }, [])
}

export function useHomeDetachedWindow() {

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
        // 书签通知统一由持久化层重新读取数据库，不直接应用广播里的整库快照。
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage-sync', onStorageSync)
    return () => window.removeEventListener('storage-sync', onStorageSync)
  }, [])
}

export function useHomeFeatures({
  syncFeatures
}: {
  syncFeatures: ReturnType<typeof useUTools>['syncFeatures']
}) {

  // 安装/升级后清理旧入口；AI 配置变化时同步「AI 保存到书签」全局入口。
  useEffect(() => {
    void syncFeatures()
    return useSettingsStore.subscribe((state, prev) => {
      if (
        state.aiEnabled !== prev.aiEnabled ||
        state.aiSelectedModelId !== prev.aiSelectedModelId ||
        state.aiCustomApiKey !== prev.aiCustomApiKey ||
        state.aiUseCustomProvider !== prev.aiUseCustomProvider ||
        state.aiAllowLegacyUTools !== prev.aiAllowLegacyUTools ||
        state.aiCustomModelOptions !== prev.aiCustomModelOptions
      ) void syncFeatures()
    })
  }, [syncFeatures])
}
