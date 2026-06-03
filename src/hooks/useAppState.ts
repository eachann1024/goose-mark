import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { useTheme } from '@heroui/react'
import { getPersistentItem } from '@/lib/utoolsStorage'

/**
 * 应用级共享状态（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 用模块级 ref + @vueuse useDark/useToggle。React 等价：
 *   - tab（书签 / 设置）：模块级 Zustand store + localStorage 持久化（跨组件共享）。
 *   - 暗色模式：交给 HeroUI v3 的 useTheme（其把 .dark class 挂到 <html>，
 *     与项目 CSS token 机制一致），useAppState 内做一层 isDark/toggleDark 适配。
 *   - isUTools / isTauri / isMac：环境探测，纯计算。
 *
 * 历史主题键迁移（vueuse-color-scheme → goose-marks.theme-mode）保留，避免升级后丢配置。
 */

const themeStorageKey = 'goose-marks.theme-mode'
// 迁移历史主题配置（与旧版一致），避免老版本切换结果在升级后丢失。
getPersistentItem(themeStorageKey, ['vueuse-color-scheme'])

export type AppTab = 'bookmarks' | 'settings'

interface AppTabState {
  tab: AppTab
  setTab: (tab: AppTab) => void
}

const readStoredTab = (): AppTab => {
  if (typeof localStorage === 'undefined') return 'bookmarks'
  return localStorage.getItem('app-tab') === 'settings' ? 'settings' : 'bookmarks'
}

/** 模块级共享 tab 状态（等价旧版模块级 ref），并持久化到 localStorage。 */
export const useAppTabStore = create<AppTabState>((set) => ({
  tab: readStoredTab(),
  setTab: (tab) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('app-tab', tab)
    set({ tab })
  }
}))

const detectIsUTools = () => typeof window !== 'undefined' && !!window.utools
const detectIsTauri = () =>
  typeof window !== 'undefined' &&
  (!!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__)
const detectIsMac = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform = (navigator as any).platform || ''
  return /mac/i.test(platform) || /macintosh/i.test(ua)
}

export function useAppState() {
  const tab = useAppTabStore((s) => s.tab)
  const setTab = useAppTabStore((s) => s.setTab)

  // HeroUI v3：useTheme 把 .dark class 同步到 <html>；这里转成 isDark/toggleDark 接口。
  const { resolvedTheme, setTheme } = useTheme('system')
  const isDark = resolvedTheme === 'dark'
  const toggleDark = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark')
  }, [isDark, setTheme])

  const isUTools = useMemo(detectIsUTools, [])
  const isTauri = useMemo(detectIsTauri, [])
  const isMac = useMemo(detectIsMac, [])

  return {
    tab,
    setTab,
    isDark,
    toggleDark,
    isUTools,
    isTauri,
    isMac
  }
}
