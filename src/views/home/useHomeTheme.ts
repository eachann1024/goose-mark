import type * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { type Screen, type ViewMode, type Theme, type ThemePref } from './homeTypes'
import { RUNTIME_PLATFORM, resolveTheme } from './homeRuntime'

export function useHomeThemeState({
  homeViewMode
}: {
  homeViewMode: ReturnType<typeof useSettingsStore.getState>['homeViewMode']
}) {

  // ---- UI 状态 ----
  // 主题偏好（system/light/dark）和实际渲染主题分开存储
  const storedTheme = useSettingsStore(state => state.themePreference)
  const [themePref, setThemePref] = useState<ThemePref>(storedTheme)
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(storedTheme))
  // 视图：从 settings store 读取初始值
  const [view, setView] = useState<ViewMode>(() =>
    homeViewMode === 'grid' ? 'grid' : 'list'
  )
  const [screen, setScreen] = useState<Screen>('list')

  useEffect(() => {
    setThemePref(storedTheme)
    setTheme(resolveTheme(storedTheme))
  }, [storedTheme])
  useEffect(() => { setView(homeViewMode === 'grid' ? 'grid' : 'list') }, [homeViewMode])

  return { themePref, setThemePref, theme, setTheme, view, setView, screen, setScreen }
}

export function useHomeThemeEffects({
  themePref,
  setTheme,
  theme,
  easterEggEnabled
}: {
  themePref: ThemePref
  setTheme: React.Dispatch<React.SetStateAction<Theme>>
  theme: Theme
  easterEggEnabled: boolean
}) {

  // 当 themePref 为 system 时，监听系统颜色方案变化并同步 theme
  useEffect(() => {
    if (themePref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themePref])

  // 同步 .dark class 到 documentElement，让 Tailwind token（index.css 第 83 行）在深色模式下生效
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const eggOn = theme === 'dark' && easterEggEnabled
    const rootEl = document.getElementById('root')
    if (RUNTIME_PLATFORM === 'utools') {
      const bg = eggOn ? 'transparent' : theme === 'dark' ? '#090A0C' : '#faf9f5'
      const fg = theme === 'dark' ? '#eae8e1' : '#1f1e1d'
      document.body.style.backgroundColor = bg
      document.body.style.color = fg
      document.documentElement.style.backgroundColor = bg
      if (rootEl) rootEl.style.backgroundColor = eggOn ? 'transparent' : ''
      return
    }
    if (eggOn) {
      document.body.style.backgroundColor = 'transparent'
      document.documentElement.style.backgroundColor = 'transparent'
      if (rootEl) rootEl.style.backgroundColor = 'transparent'
    } else {
      document.body.style.backgroundColor = ''
      document.documentElement.style.backgroundColor = ''
      if (rootEl) rootEl.style.backgroundColor = ''
    }
  }, [theme, easterEggEnabled])
}

export function useHomeViewPreferences({
  setThemePref,
  setTheme,
  setView,
  setHomeViewMode,
  setScreen,
  focusSearchInput
}: {
  setThemePref: React.Dispatch<React.SetStateAction<ThemePref>>
  setTheme: React.Dispatch<React.SetStateAction<Theme>>
  setView: React.Dispatch<React.SetStateAction<ViewMode>>
  setHomeViewMode: ReturnType<typeof useSettingsStore.getState>['setHomeViewMode']
  setScreen: React.Dispatch<React.SetStateAction<Screen>>
  focusSearchInput: () => void
}) {


  // ---- 交互：主题偏好进入设置 store。 ----
  const applyThemePref = useCallback((pref: ThemePref) => {
    useSettingsStore.getState().setThemePreference(pref)
    setThemePref(pref)
    setTheme(resolveTheme(pref))
  }, [])

  // ---- 交互：列表/网格切换（设计稿 setView，同步持久化到 settings store） ----
  const changeView = useCallback(
    (v: ViewMode) => {
      setView(v)
      setHomeViewMode(v)
      // 书签视图内切换布局；回收站下点视图切换视为「回到书签视图」。
      // 搜索/设置/表单态下不切走（避免误关浮层丢状态）。
      setScreen((prev) => (prev === 'list' || prev === 'grid' || prev === 'trash' ? v : prev))
      // 网格与列表现已同为全量连续渲染，导航集合一致，无需再收敛回首组
      // 切换布局后聚焦当前搜索入口
      focusSearchInput()
    },
    [setHomeViewMode, focusSearchInput]
  )

  return { applyThemePref, changeView }
}
