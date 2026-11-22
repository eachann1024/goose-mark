import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PinyinMatch from 'pinyin-match'
import type { Bookmark } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { AI_CREATE_ID, AI_CREATE_ITEM } from './useHomeAICreate'
import { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import { trackSearch } from '@/lib/appTelemetry'
import { bookmarkToHomeItem, getBookmarkIndex, getHomeGroupIndex, getNavigationIndex, type HomeGroup, type HomeItem } from './viewModel'
import { type Screen, type ViewMode } from './homeTypes'
import { UTOOLS_INPUT_EVENT, UTOOLS_SYNC_EVENT, UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT, UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE, type SearchSurface } from './homeRuntime'
import { type HomeNavigationBindings, type HomeSearchBindings, type HomeBookmarkBindings } from './homeInteractionTypes'

export function useHomeSearchFocus({
  searchSurface,
  headerSearchRef
}: {
  searchSurface: SearchSurface
  headerSearchRef: React.RefObject<HTMLInputElement | null>
}) {

  /** 聚焦当前搜索入口并全选已有文本（方便直接覆盖输入） */
  const focusSearchInput = useCallback(() => {
    if (searchSurface === 'utools-subinput') {
      window.utools?.subInputFocus?.()
      return
    }
    requestAnimationFrame(() => {
      const el = headerSearchRef.current
      if (!el) return
      el.focus()
      el.select()
    })
  }, [searchSurface])

  // 软件打开后自动聚焦搜索入口：主面板挂载 uTools subInput，独立窗口/浏览器聚焦页内输入框。
  useEffect(() => {
    if (searchSurface === 'utools-subinput') {
      window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
      return
    }
    const timer = setTimeout(focusSearchInput, 50)
    return () => clearTimeout(timer)
  }, [focusSearchInput, searchSurface])

  return { focusSearchInput }
}

const searchTextCache = new WeakMap<HomeItem, { text: string; compactAscii: string | null }>()

function getSearchText(item: HomeItem) {
  let cached = searchTextCache.get(item)
  if (!cached) {
    const text = [item.ttl, item.url, item.dsc, item.tags.join(' ')].join(' ').toLowerCase()
    const compactAscii = /[^\x20-\x7e]/.test(text) ? null : text.replaceAll(' ', '')
    cached = { text, compactAscii }
    searchTextCache.set(item, cached)
  }
  return cached
}

export function useHomeSearchResults({
  activeGroupId,
  homeGroups,
  searchVal,
  isSearching,
  bookmarks,
  openBookmarkLinkBase,
  clearSearchFnRef,
  aiCreateFnRef,
  openBookmarkLink,
  selectedId,
  setSelectedId
}: Pick<HomeNavigationBindings, 'activeGroupId' | 'selectedId' | 'setSelectedId'> &
  Pick<HomeSearchBindings, 'searchVal' | 'isSearching'> &
  Pick<HomeBookmarkBindings, 'homeGroups' | 'bookmarks' | 'openBookmarkLink'> & {
  openBookmarkLinkBase: ReturnType<typeof useBookmarkOperations>['openBookmarkLink']
  clearSearchFnRef: React.RefObject<() => void>
  aiCreateFnRef: React.RefObject<(text: string) => void>
}) {

  // 切换 Tab 只改变当前分组，跨分组搜索复用按原顺序去重后的书签。
  const activeGroup = homeGroups.find((group) => group.id === activeGroupId) ?? homeGroups[0]
  const keptGroups = useMemo(() => !isSearching && activeGroup ? [activeGroup] : [], [activeGroup, isSearching])
  const searchableItems = useMemo(() => {
    if (!isSearching) return []
    const byId = new Map<string, HomeItem>()
    for (const group of homeGroups) {
      for (const item of getHomeGroupIndex(group).navigableItems) {
        if (!byId.has(item.id)) byId.set(item.id, item)
      }
    }
    return Array.from(byId.values())
  }, [homeGroups, isSearching])

  const query = searchVal.trim().toLowerCase()
  const searchResultItems = useMemo(() => {
    if (!query) return []
    const plainQuery = /^[a-z0-9]+$/.test(query)
    return searchableItems.filter((item) => {
      const { text, compactAscii } = getSearchText(item)
      if (text.includes(query)) return true
      // 纯 ASCII 文本没有拼音字，普通字母/数字查询仍保留跨空格匹配。
      if (plainQuery && compactAscii !== null) return compactAscii.includes(query)
      return !!PinyinMatch.match(text, query)
    })
  }, [query, searchableItems])

  const needsFallback = isSearching && searchResultItems.length === 0
  const universalFallbackItems = useMemo<HomeItem[]>(() => {
    if (!needsFallback) return []
    const store = useBookmarkStore.getState()
    return bookmarks
      .filter(
        (b) =>
          b.allowUniversal === true &&
          !store.isBookmarkInTrash(b) &&
          typeof b.title === 'string' &&
          !!b.title.trim()
      )
      .map(bookmarkToHomeItem)
  }, [needsFallback, bookmarks, homeGroups])
  const isUniversalFallback = isSearching && universalFallbackItems.length > 0

  // 开启 AI 后，任意搜索词都给出「AI 创建书签」，不要求文本里已有网址
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const aiCreateItem = useMemo<HomeItem | null>(
    () => (aiEnabled && isSearching && searchVal.trim().length > 0 ? AI_CREATE_ITEM : null),
    [aiEnabled, isSearching, searchVal]
  )

  // 当前视图下可键盘导航的扁平书签列表（基于过滤后的数据）
  // 网格与列表现已同为全量连续渲染，导航集合一致：全部分组扁平去重。
  // 搜索无匹配且有全局搜索书签时，导航落到底部命令条。
  const navigableItems = useMemo<HomeItem[]>(() => {
    if (isUniversalFallback) return aiCreateItem ? [aiCreateItem, ...universalFallbackItems] : universalFallbackItems
    const local = !isSearching && activeGroup ? getHomeGroupIndex(activeGroup).navigableItems : searchResultItems
    return aiCreateItem ? [...local, aiCreateItem] : local
  }, [activeGroup, isSearching, searchResultItems, isUniversalFallback, universalFallbackItems, aiCreateItem])

  const searchContext = useRef({ searchVal, isUniversalFallback })
  searchContext.current = { searchVal, isUniversalFallback }

  /** 打开列表项：全局搜索回退态用当前搜索词填模板并直跳；其余走常规 open（含模板输入页） */
  const openHomeItem = useCallback(
    (item: HomeItem, via: 'click' | 'enter' = 'click') => {
      const { searchVal, isUniversalFallback } = searchContext.current
      if (item.id === AI_CREATE_ID) {
        aiCreateFnRef.current(searchVal)
        return
      }
      const realBookmark = getBookmarkIndex(bookmarks).get(item.id)
      if (!realBookmark) return
      if (isUniversalFallback && realBookmark.allowUniversal) {
        const q = searchVal.trim()
        openBookmarkLinkBase(realBookmark, {
          query: q,
          useUiQuery: false,
          source: 'template-universal-fallback',
          via: 'universal'
        })
        // 点开后默认退出搜索态（搜索框与结果面板一并清空）
        clearSearchFnRef.current()
        return
      }
      // 模板入口由 enterTemplateMode 清搜索；直开由 openBookmarkLink 清搜索
      openBookmarkLink(realBookmark, { via })
    },
    [bookmarks, openBookmarkLinkBase, openBookmarkLink]
  )

  // 防抖记录搜索：停止输入后最多记一次，绝不带搜索词
  const searchResultCountRef = useRef(0)
  searchResultCountRef.current = searchResultItems.length
  const trimmedSearch = searchVal.trim()
  useEffect(() => {
    if (!trimmedSearch) return
    const timer = window.setTimeout(() => {
      trackSearch(searchResultCountRef.current)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [trimmedSearch])

  // 切换视图后，若当前选中项不在可导航列表内则回退到首项
  useEffect(() => {
    if (!navigableItems.length) return
    if ((!selectedId || !getNavigationIndex(navigableItems).has(selectedId))) {
      setSelectedId(navigableItems[0].id)
    }
  }, [navigableItems, selectedId])

  // 搜索词变化（含清空）：默认选中过滤结果第一项，Enter 即可直接打开
  const navigableItemsRef = useRef(navigableItems)
  navigableItemsRef.current = navigableItems
  // 清搜索 / 恢复滚动时禁止「选中项滚入视口」把列表拽回顶部
  const suppressScrollIntoViewRef = useRef(false)
  useEffect(() => {
    setSelectedId(navigableItemsRef.current[0]?.id ?? null)
  }, [searchVal])

  return { keptGroups, searchResultItems, universalFallbackItems, aiCreateItem, isUniversalFallback, navigableItems, openHomeItem, suppressScrollIntoViewRef }
}

export function useHomeSearchActions({
  setSearchVal,
  searchSurface,
  searchVal,
  suppressScrollIntoViewRef,
  clearSearchFnRef
}: {
  setSearchVal: React.Dispatch<React.SetStateAction<string>>
  searchSurface: SearchSurface
  searchVal: string
  suppressScrollIntoViewRef: React.RefObject<boolean>
  clearSearchFnRef: React.RefObject<() => void>
}) {

  /**
   * 统一搜索值更新入口：setSearchVal 并在 uTools 环境下把值同步到 subInput。
   * fromSubInput=true 时跳过 subInput 同步（避免回环）。
   * 注意：必须定义在 clearSearch / applySearchValRef 等引用点之前（const TDZ）。
   */
  const applySearchVal = useCallback((text: string, fromSubInput = false) => {
    setSearchVal(text)
    if (searchSurface === 'utools-subinput' && !fromSubInput) {
      window.dispatchEvent(new CustomEvent(UTOOLS_SYNC_EVENT, { detail: { text } }))
    }
  }, [searchSurface])

  // ---- 工具：清空面板内联搜索 ----
  const clearSearch = useCallback(() => {
    // 退出搜索前钉住主列表滚动，避免结果面板卸掉后内容区从 0 起、再被选中项滚入顶掉
    if (searchVal.trim()) {
      suppressScrollIntoViewRef.current = true
    }
    applySearchVal('')
  }, [applySearchVal, searchVal])
  clearSearchFnRef.current = clearSearch

  return { applySearchVal, clearSearch }
}

export function useHomeUniversalMatch() {

  // universal 书签匹配：payload 文本「标题 + 分隔符 + 关键词」→ 命中 allowUniversal 书签
  const findUniversalBookmarkMatch = useCallback((payloadText: string): { bookmark: Bookmark; query: string; exact: boolean } | null => {
    const store = useBookmarkStore.getState()
    const candidates = store.bookmarks
      .filter(
        (bookmark): bookmark is Bookmark =>
          bookmark.allowUniversal === true &&
          !store.isBookmarkInTrash(bookmark) &&
          typeof bookmark.title === 'string' &&
          !!bookmark.title.trim()
      )
      .sort((left, right) => right.title.trim().length - left.title.trim().length)
    for (const bookmark of candidates) {
      const title = bookmark.title.trim()
      if (!title) continue
      if (payloadText === title) return { bookmark, query: '', exact: true }
      if (!payloadText.startsWith(title)) continue
      const suffix = payloadText.slice(title.length)
      if (!suffix || !UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE.test(suffix)) continue
      const query = suffix.replace(UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE, '').trim()
      return { bookmark, query, exact: query.length === 0 }
    }
    return null
  }, [])

  return { findUniversalBookmarkMatch }
}

export function useHomeSubInputSync({
  activeTemplateBookmarkRef,
  screenRef,
  setScreenRef,
  viewRef,
  applySearchValRef
}: {
  activeTemplateBookmarkRef: React.RefObject<Bookmark | null>
  screenRef: React.RefObject<Screen>
  setScreenRef: React.RefObject<React.Dispatch<React.SetStateAction<Screen>>>
  viewRef: React.RefObject<ViewMode>
  applySearchValRef: React.RefObject<(text: string, fromSubInput?: boolean) => void>
}) {

  // ---- uTools subInput → 应用层搜索同步 ----
  // 用 ref 读取最新状态，避免重复绑定监听。
  // 规则：模板输入态忽略；add 表单页忽略；settings/trash 先切回主视图再过滤。
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text ?? ''
      if (activeTemplateBookmarkRef.current) return
      const curScreen = screenRef.current
      if (curScreen === 'add' || curScreen === 'aiSave') return
      if (curScreen === 'settings' || curScreen === 'trash' || curScreen === 'groups') {
        setScreenRef.current(viewRef.current)
      }
      applySearchValRef.current(text, true)
    }
    window.addEventListener(UTOOLS_INPUT_EVENT, handler)
    return () => window.removeEventListener(UTOOLS_INPUT_EVENT, handler)
  }, [])
}
