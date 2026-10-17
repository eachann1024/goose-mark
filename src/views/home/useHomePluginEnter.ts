import type * as React from 'react'
import { useEffect, useRef } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { flushBookmarkStorePersistence, useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { useBookmarkFormStore, enqueueMetadataHydration } from '@/hooks/useBookmarkForm'
import { resolveBookmarkLaunchUrl } from '@/lib/utils'
import { AI_SAVE_FEATURE_CODE } from '@/hooks/useUTools'
import { type Screen, type ViewMode } from './homeTypes'
import { UTOOLS_PLUGIN_ENTER_EVENT, RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS, BROWSER_URL_READ_TIMEOUT_MS, withFallbackTimeout, DETACH_TOGGLE_FOCUS_GRACE_MS, isDetachedUToolsWindow, type UToolsPluginEnterPayload } from './homeRuntime'
import { type HomeToastHandler, type HomeScrollBindings, type HomeSearchBindings } from './homeInteractionTypes'

export function useHomePluginEnter({
  getEnterText,
  FEATURE_PREFIX,
  openNewBookmarkForm,
  fireToastRef,
  activeTemplateBookmarkRef,
  recentDynamicTemplateEnterAtRef,
  templateQueryRef,
  enterTemplateMode,
  openUrl,
  exitTemplateModeRef,
  findUniversalBookmarkMatch,
  lastWindowFocusAtRef,
  saveDetachedWindowPosition,
  searchValRef,
  suppressScrollIntoViewRef,
  applySearchValRef,
  focusSearchInput,
  setScreenRef,
  view,
  restoreHomeScrollRef,
  aiCreateFnRef
}: Pick<HomeScrollBindings, 'suppressScrollIntoViewRef' | 'restoreHomeScrollRef'> &
  Pick<HomeSearchBindings, 'applySearchValRef' | 'focusSearchInput'> & {
  getEnterText: (payload: unknown) => string
  FEATURE_PREFIX: string
  openNewBookmarkForm: () => void
  fireToastRef: React.RefObject<HomeToastHandler>
  activeTemplateBookmarkRef: React.RefObject<Bookmark | null>
  recentDynamicTemplateEnterAtRef: React.RefObject<number>
  templateQueryRef: React.RefObject<string>
  enterTemplateMode: (bookmark: Bookmark) => void
  openUrl: (url: string) => void
  exitTemplateModeRef: React.RefObject<() => void>
  findUniversalBookmarkMatch: (payloadText: string) => { bookmark: Bookmark; query: string; exact: boolean; } | null
  lastWindowFocusAtRef: React.RefObject<number>
  saveDetachedWindowPosition: () => void
  searchValRef: React.RefObject<string>
  setScreenRef: React.RefObject<React.Dispatch<React.SetStateAction<Screen>>>
  view: ViewMode
  aiCreateFnRef: React.RefObject<(text: string) => void>
}) {

  // plugin-enter 事件：处理 bookmarks / quick_save / bm_tpl: 功能码
  // handler 用 ref 包裹，保持监听器长生命周期的同时始终调用最新逻辑
  const pluginEnterHandlerRef = useRef<(e: Event) => void>(() => {})
  pluginEnterHandlerRef.current = (e: Event) => {
    const rawDetail = (e as CustomEvent<UToolsPluginEnterPayload & { params?: unknown }>).detail
    // preload 可能包一层 { params }（对齐 App.tsx getUToolsPluginEnterParams）
    const params: UToolsPluginEnterPayload =
      rawDetail && typeof rawDetail === 'object' && rawDetail.params && typeof rawDetail.params === 'object'
        ? (rawDetail.params as UToolsPluginEnterPayload)
        : (rawDetail ?? {})
    const code = params?.code
    const enterType = typeof params?.type === 'string' ? params.type : ''
    const payloadText = getEnterText(params?.payload).trim()
    const isTemplateFeature = typeof code === 'string' && code.startsWith(FEATURE_PREFIX)
    const store = useBookmarkStore.getState()

    // ---- ai_save：AI 保存到书签（无 payload 时读取当前浏览器网址）----
    if (code === AI_SAVE_FEATURE_CODE) {
      if (payloadText) {
        aiCreateFnRef.current(payloadText)
        return
      }
      void (async () => {
        const utoolsApi = window.utools as unknown as { readCurrentBrowserUrl?: () => Promise<string> } | undefined
        const browserUrl = typeof utoolsApi?.readCurrentBrowserUrl === 'function'
          ? (await withFallbackTimeout(utoolsApi.readCurrentBrowserUrl(), '', BROWSER_URL_READ_TIMEOUT_MS).catch(() => '')).trim()
          : ''
        if (browserUrl) aiCreateFnRef.current(browserUrl)
        else fireToastRef.current('未检测到网址', { tone: 'error' })
      })()
      return
    }

    // ---- quick_save：普通保存当前网址 ----
    if (code === 'quick_save') {
      let urlToSave = ''
      const payload = params?.payload
      if (typeof payload === 'string') urlToSave = payload.trim()
      else if (payload && typeof payload === 'object' && 'text' in payload) {
        urlToSave = String((payload as { text: unknown }).text).trim()
      }
      // 无 payload（主入口直接执行）：读取当前浏览器页面 URL
      if (!urlToSave) {
        void (async () => {
          try {
            const utoolsApi = window.utools as unknown as { readCurrentBrowserUrl?: () => Promise<string> } | undefined
            if (typeof utoolsApi?.readCurrentBrowserUrl === 'function') {
              const browserUrl = (
                await withFallbackTimeout(utoolsApi.readCurrentBrowserUrl(), '', BROWSER_URL_READ_TIMEOUT_MS)
              ).trim()
              if (browserUrl) {
                pluginEnterHandlerRef.current({ detail: { code, payload: browserUrl } } as unknown as Event)
                return
              }
            }
          } catch (err) {
            console.warn('[quick_save] 获取浏览器 URL 失败:', err)
          }
          // 兜底：打开新增表单手动填写
          openNewBookmarkForm()
          fireToastRef.current('未检测到有效链接，请手动填写')
        })()
        return
      }
      // URL 校验三段分类：
      //   1. 带 ://（http/https 之外拒绝）；2. 形如 scheme: 但非 host:port 拒绝；3. 无 scheme 补 https://
      const normalizeQuickUrl = (raw: string): string | null => {
        if (!raw) return null
        try {
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
            const u = new URL(raw)
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
            return raw
          }
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) && !/^[a-zA-Z0-9.-]+:\d+([/?#]|$)/.test(raw)) {
            return null
          }
          const normalized = `https://${raw}`
          new URL(normalized)
          return normalized
        } catch { return null }
      }
      const finalUrl = normalizeQuickUrl(urlToSave)
      if (finalUrl) {
        const bookmark = store.quickSaveBookmark(finalUrl)
        // 快存先即时落库，随后后台抓取标题/简介；仅新建（标题为空）时触发
        if (!bookmark.title) {
          enqueueMetadataHydration(bookmark.id, {
            url: finalUrl,
            initialTitle: '',
            initialDesc: ''
          })
        }
        fireToastRef.current(`已保存：${bookmark.title || urlToSave}`)
        void flushBookmarkStorePersistence().finally(() => window.utools?.outPlugin())
      } else {
        openNewBookmarkForm()
        fireToastRef.current('未检测到有效链接，请手动填写')
      }
      return
    }

    // ---- bm_tpl:<bookmarkId>：模板书签快捷入口 ----
    if (isTemplateFeature) {
      const id = (code as string).slice(FEATURE_PREFIX.length)
      const bookmark = store.bookmarks.find((b) => b.id === id)
      if (!bookmark) {
        window.utools?.outPlugin()
        return
      }
      const hasTemplate = /{[^}]+}/.test(bookmark.url)
      const isInTemplateMode = activeTemplateBookmarkRef.current?.id === id
      // 已在该书签的模板态（首屏直接挂载模板页后回放的同一 enter 事件）：
      // 无 payload 视为重复进入，忽略并保持模板态，否则会走下方「拼接空关键词直接开链接」分支
      if (isInTemplateMode && !payloadText) {
        recentDynamicTemplateEnterAtRef.current = Date.now()
        return
      }
      const query = isInTemplateMode ? templateQueryRef.current.trim() : payloadText

      if (hasTemplate) {
        // 无关键词（或仅书签标题本身）时进入模板输入态，等待用户键入参数
        const shouldEnterTemplateMode =
          enterType === 'over'
            ? !payloadText && !isInTemplateMode
            : (!payloadText || payloadText === bookmark.title) && !isInTemplateMode
        if (shouldEnterTemplateMode) {
          recentDynamicTemplateEnterAtRef.current = Date.now()
          enterTemplateMode(bookmark)
          return
        }
      }

      let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      fireToastRef.current('正在打开…')
      openUrl(url)
      if (!isDetachedUToolsWindow()) { try { window.utools?.hideMainWindow?.() } catch { /* ignore */ } }
      if (activeTemplateBookmarkRef.current) exitTemplateModeRef.current()
      recentDynamicTemplateEnterAtRef.current = Date.now()
      return
    }

    // ---- bookmarks：默认入口 ----
    if (code === 'bookmarks') {
      // universal 书签匹配：payload「标题 关键词」直达
      if (payloadText) {
        const match = findUniversalBookmarkMatch(payloadText)
        if (match) {
          recentDynamicTemplateEnterAtRef.current = Date.now()
          if (match.exact && /{[^}]+}/.test(match.bookmark.url)) {
            enterTemplateMode(match.bookmark)
            return
          }
          const resolvedUrl = resolveBookmarkLaunchUrl(match.bookmark.url, match.query)
          if (resolvedUrl) {
            fireToastRef.current('正在打开…')
            openUrl(resolvedUrl)
            if (!isDetachedUToolsWindow()) { try { window.utools?.hideMainWindow?.() } catch { /* ignore */ } }
            return
          }
        }
      }
      // bm_tpl 进入后 1s 内 uTools 会补发一次 bookmarks code，忽略避免打断模板态
      if (
        recentDynamicTemplateEnterAtRef.current > 0 &&
        Date.now() - recentDynamicTemplateEnterAtRef.current <= RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS
      ) {
        recentDynamicTemplateEnterAtRef.current = 0
        return
      }
      // 窗口模式 toggle：分离窗口在按下快捷键前就处于激活状态 → 再次唤起视为「收起」，关闭窗口。
      // lastWindowFocusAtRef 距今足够久才算「原本就激活」，刚被唤起聚焦（间隔极短）不触发
      if (
        isDetachedUToolsWindow() &&
        document.hasFocus() &&
        lastWindowFocusAtRef.current > 0 &&
        Date.now() - lastWindowFocusAtRef.current > DETACH_TOGGLE_FOCUS_GRACE_MS
      ) {
        if (activeTemplateBookmarkRef.current) exitTemplateModeRef.current()
        saveDetachedWindowPosition()
        try { window.utools?.outPlugin?.() } catch { /* ignore */ }
        return
      }
      if (activeTemplateBookmarkRef.current) exitTemplateModeRef.current()
      // bookmarks 主入口：universal 书签未命中后根据连贯模式决定是否重置视图。
      // 不能因为 payloadText 非空就进搜索——uTools 用命令词（"书签"/"bookmark"）触发主入口时，
      // 会把命令词本身当 payload 传进来。真正的关键词检索在面板内搜索框完成。
      // 搜索态不跨次唤出：uTools 退出后 subInput 已空，退搜索；滚动位置单独处理，避免被顶到顶部。
      useBookmarkFormStore.getState().set({ showAdd: false })
      const wasSearching = searchValRef.current.trim().length > 0
      if (wasSearching) {
        suppressScrollIntoViewRef.current = true
        applySearchValRef.current('')
      }
      if (useSettingsStore.getState().panelContinuous) {
        // 连贯开：保留分组/选中，并聚焦搜索
        focusSearchInput()
      } else {
        // 连贯关：若在设置/回收站等则回主视图；滚动默认始终保留
        setScreenRef.current(view)
        focusSearchInput()
      }
      // 滚动默认始终还原（与连贯开关无关）；设高度后还会再补一次
      restoreHomeScrollRef.current('keep')
      return
    }
  }
  useEffect(() => {
    if (!window.utools) return
    // 绑定稳定的 wrapper，内部走 ref 取最新 handler
    const wrapper = (e: Event) => {
      // preload 在 onPluginEnter 也会设高度，但可能读到旧存储；页面已挂载时在此用 store 纠正。
      if (typeof window.utools?.setExpendHeight === 'function') {
        try {
          window.utools.setExpendHeight(useSettingsStore.getState().windowHeight)
        } catch { /* ignore */ }
      }
      pluginEnterHandlerRef.current(e)
      // setExpendHeight 后布局会变、scrollTop 常被冲掉，enter 处理后再补还原
      if (!activeTemplateBookmarkRef.current) {
        restoreHomeScrollRef.current('keep')
      }
    }
    window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, wrapper)

    // 回放 preload 缓存的 pending plugin-enter 事件（对齐 App.tsx:1609-1623）
    const pendingEvents = (window as unknown as {
      __gooseMarksPendingPluginEnterEvents?: Array<{ params: UToolsPluginEnterPayload }>
    }).__gooseMarksPendingPluginEnterEvents || []
    if (pendingEvents.length > 0) {
      // 优先回放 bm_tpl: 动态模板事件（uTools 会在其后补发 bookmarks，取最后一条会丢模板入口，
      // 对齐 App.tsx:1613-1619 的反向查找策略）
      const selectedEvent =
        [...pendingEvents]
          .reverse()
          .find((entry) => {
            const c = entry?.params?.code
            return typeof c === 'string' && c.startsWith(FEATURE_PREFIX)
          }) ?? pendingEvents[pendingEvents.length - 1]
      if (selectedEvent) {
        wrapper({ detail: selectedEvent.params } as unknown as Event)
      }
      ;(window as unknown as { __gooseMarksPendingPluginEnterEvents?: unknown[] }).__gooseMarksPendingPluginEnterEvents = []
    }
    if (typeof window.utools?.setExpendHeight === 'function') {
      try {
        window.utools.setExpendHeight(useSettingsStore.getState().windowHeight)
      } catch { /* ignore */ }
    }


    return () => window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, wrapper)
  }, [])
}
