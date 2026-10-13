import type * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { useBookmarkFormStore } from '@/hooks/useBookmarkForm'
import { UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT, isDetachedUToolsWindow, type UToolsPluginEnterPayload } from './homeRuntime'
import { type HomeToastHandler, type HomeNavigationBindings } from './homeInteractionTypes'

export function useHomeTemplateState({
  FEATURE_PREFIX,
  getEnterText
}: {
  FEATURE_PREFIX: string
  getEnterText: (payload: unknown) => string
}) {
  // 模板输入态：当前处于模板输入模式的书签。
  // 惰性初始化：uTools 搜索框呼出模板书签时首屏直接渲染模板页，
  // 避免「先进首页闪一下、等 plugin-enter 事件回放后才跳模板页」。
  const [activeTemplateBookmark, setActiveTemplateBookmark] = useState<Bookmark | null>(() => {
    try {
      if (!window.utools) return null
      const pending = (window as unknown as {
        __gooseMarksPendingPluginEnterEvents?: Array<{ params?: UToolsPluginEnterPayload }>
      }).__gooseMarksPendingPluginEnterEvents
      if (!pending?.length) return null
      const entry = [...pending].reverse().find((e) => {
        const c = e?.params?.code
        return typeof c === 'string' && c.startsWith(FEATURE_PREFIX)
      })
      const params = entry?.params
      const code = params?.code
      if (!code) return null
      const payloadText = getEnterText(params?.payload).trim()
      const enterType = typeof params?.type === 'string' ? params.type : ''
      const bookmark = useBookmarkStore.getState().bookmarks.find((b) => b.id === code.slice(FEATURE_PREFIX.length))
      if (!bookmark || !/{[^}]+}/.test(bookmark.url)) return null
      // 进入条件与 plugin-enter handler 一致：over 类型要求无 payload；其余要求无 payload 或 payload 恰为书签标题
      const shouldEnter = enterType === 'over' ? !payloadText : !payloadText || payloadText === bookmark.title
      return shouldEnter ? bookmark : null
    } catch {
      return null
    }
  })
  const [templateQuery, setTemplateQuery] = useState('')
  const templateQueryRef = useRef('')
  // 1000ms 防重入：模板 enter 后短时间内忽略 bookmarks 主入口
  const recentDynamicTemplateEnterAtRef = useRef(0)

  // templateQueryRef 保持与 templateQuery state 同步（供 keydown handler 读取最新值）
  templateQueryRef.current = templateQuery

  return { activeTemplateBookmark, setActiveTemplateBookmark, templateQuery, setTemplateQuery, templateQueryRef, recentDynamicTemplateEnterAtRef }
}

export function useHomeTemplates({
  setActiveTemplateBookmark,
  activeTemplateBookmarkRef,
  setTemplateQuery,
  templateQueryRef,
  applySearchVal,
  setScreen,
  view,
  enterTemplateModeFnRef,
  fireToastRef,
  openUrl,
  activeTemplateBookmark
}: Pick<HomeNavigationBindings, 'setScreen' | 'view'> & {
  setActiveTemplateBookmark: React.Dispatch<React.SetStateAction<Bookmark | null>>
  activeTemplateBookmarkRef: React.RefObject<Bookmark | null>
  setTemplateQuery: React.Dispatch<React.SetStateAction<string>>
  templateQueryRef: React.RefObject<string>
  applySearchVal: (text: string, fromSubInput?: boolean) => void
  enterTemplateModeFnRef: React.RefObject<(b: Bookmark) => void>
  fireToastRef: React.RefObject<HomeToastHandler>
  openUrl: (url: string) => void
  activeTemplateBookmark: Bookmark | null
}) {

  // ---- 模板书签输入态 ----
  // uTools subInput 已整体下线，模板参数改由独立页面（tpl-page：仅 logo + 输入框）承接。
  const enterTemplateMode = useCallback((bookmark: Bookmark) => {
    setActiveTemplateBookmark(bookmark)
    activeTemplateBookmarkRef.current = bookmark
    setTemplateQuery('')
    templateQueryRef.current = ''
    // 关闭可能打开的表单 / 清空搜索，回到主视图
    useBookmarkFormStore.getState().set({ showAdd: false })
    applySearchVal('')
    setScreen((prev) => (prev === 'add' ? view : prev))
  }, [view, applySearchVal])
  // 供前方 openBookmarkLink 包装通过 ref 调用（避免声明顺序 TDZ）
  enterTemplateModeFnRef.current = enterTemplateMode

  const exitTemplateMode = useCallback(() => {
    setActiveTemplateBookmark(null)
    activeTemplateBookmarkRef.current = null
    setTemplateQuery('')
    templateQueryRef.current = ''
  }, [])
  const exitTemplateModeRef = useRef(exitTemplateMode)
  exitTemplateModeRef.current = exitTemplateMode

  const executeTemplateSearch = useCallback(() => {
    const bookmark = activeTemplateBookmarkRef.current
    if (!bookmark) return
    const query = templateQueryRef.current.trim()
    if (!query) return
    let url = bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query))
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    fireToastRef.current('正在打开…')
    openUrl(url)
    // 打开后收起主窗口并退出模板态（不退出插件进程）
    if (!isDetachedUToolsWindow()) { try { window.utools?.hideMainWindow?.() } catch { /* ignore */ } }
    exitTemplateModeRef.current()
  }, [openUrl])
  const executeTemplateSearchRef = useRef(executeTemplateSearch)
  executeTemplateSearchRef.current = executeTemplateSearch

  // 模板态键盘：Enter 执行 / Esc 退出（独立监听，优先于全局键盘逻辑）
  useEffect(() => {
    if (!activeTemplateBookmark) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        // 中文输入法组词中的 Enter 是确认候选，不能当作「执行搜索」
        if (e.isComposing || e.keyCode === 229) return
        e.preventDefault()
        e.stopPropagation()
        executeTemplateSearchRef.current()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        exitTemplateModeRef.current()
        // 回到主页后重挂 uTools 顶部搜索框（模板入口时被 preload 移除）
        window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
      }
    }
    // capture 阶段注册，先于全局 keydown 处理
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activeTemplateBookmark])

  // 模板页输入框聚焦：首屏直挂 / 事件回放进入都要确保焦点落在页内输入框
  const templateInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!activeTemplateBookmark) return
    const raf = requestAnimationFrame(() => templateInputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [activeTemplateBookmark])

  return { enterTemplateMode, exitTemplateModeRef, templateInputRef }
}
