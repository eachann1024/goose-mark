import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PinyinMatch from 'pinyin-match'
import type { Bookmark } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { AI_CREATE_ID, AI_CREATE_ITEM } from './useHomeAICreate'
import { useBookmarkOperations } from '@/hooks/useBookmarkOperations'
import { bookmarkToHomeItem, type HomeGroup, type HomeItem } from './viewModel'
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

  // 已访问过的一级分组：保活内容面板，避免切 Tab 卸载卡片导致图标重新解码闪白
  const [visitedGroupIds, setVisitedGroupIds] = useState<string[]>(() => {
    const gid = useBookmarkStore.getState().activeGroupId
    return gid ? [gid] : []
  })
  useEffect(() => {
    if (!activeGroupId) return
    setVisitedGroupIds((prev) => (prev.includes(activeGroupId) ? prev : [...prev, activeGroupId]))
  }, [activeGroupId])
  // 分组被删除时清掉已失效的 keep-alive 面板
  useEffect(() => {
    const valid = new Set(homeGroups.map((g) => g.id))
    setVisitedGroupIds((prev) => {
      const next = prev.filter((id) => valid.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [homeGroups])

  // 面板内联搜索：searchVal 非空时跨全部分组过滤，
  // 支持标题/链接/描述/标签 + 拼音匹配；UI 以扁平结果面展示。
  const filteredGroups = useMemo<HomeGroup[]>(() => {
    const q = searchVal.trim().toLowerCase()
    // 非搜索态：两层导航 —— 只显示当前选中的一级分组（activeGroupId 为空则回退首个）
    if (!q) {
      const current = activeGroupId
        ? homeGroups.filter((g) => g.id === activeGroupId)
        : homeGroups.slice(0, 1)
      return current.length ? current : homeGroups.slice(0, 1)
    }
    // 搜索态：跨所有一级分组全量匹配
    const match = (b: HomeItem) => {
      const haystack = [b.ttl, b.url, b.dsc, b.tags.join(' ')].join(' ').toLowerCase()
      if (haystack.includes(q)) return true
      return !!PinyinMatch.match(haystack, q)
    }
    return homeGroups
      .map((g) => ({
        ...g,
        subs: g.subs
          .map((s) => ({ ...s, items: s.items.filter(match) }))
          .filter((s) => s.items.length > 0)
      }))
      .filter((g) => g.subs.length > 0)
  }, [homeGroups, searchVal, activeGroupId])

  // keep-alive：已访问分组各自挂一份内容（隐藏非当前），图标/滚动都保留在 DOM 里
  const keptGroups = useMemo(() => {
    if (isSearching) return [] as HomeGroup[]
    const byId = new Map(homeGroups.map((g) => [g.id, g]))
    const ids = visitedGroupIds.length
      ? visitedGroupIds
      : (activeGroupId ? [activeGroupId] : homeGroups[0] ? [homeGroups[0].id] : [])
    return ids.map((id) => byId.get(id)).filter(Boolean) as HomeGroup[]
  }, [homeGroups, visitedGroupIds, activeGroupId, isSearching])

  // 搜索态：全局匹配的扁平结果（按 id 去重），列表/格子共用，不再按分组分段展示。
  const searchResultItems = useMemo<HomeItem[]>(() => {
    if (!isSearching) return []
    const seen = new Set<string>()
    return filteredGroups
      .flatMap((g) => g.subs.flatMap((s) => s.items))
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
  }, [isSearching, filteredGroups])

  // 搜索无本地匹配时：展示已开启 allowUniversal 的模板/全局搜索书签，回车用当前搜索词跳转。
  const universalFallbackItems = useMemo<HomeItem[]>(() => {
    if (!isSearching) return []
    const store = useBookmarkStore.getState()
    const hasLocalMatch = filteredGroups.some((g) => g.subs.some((s) => s.items.length > 0))
    if (hasLocalMatch) return []
    return store.bookmarks
      .filter(
        (b) =>
          b.allowUniversal === true &&
          !store.isBookmarkInTrash(b) &&
          typeof b.title === 'string' &&
          !!b.title.trim()
      )
      .map(bookmarkToHomeItem)
  }, [isSearching, filteredGroups, bookmarks])
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
    const seen = new Set<string>()
    const local = filteredGroups
      .flatMap((g) => g.subs.flatMap((s) => s.items))
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
    return aiCreateItem ? [...local, aiCreateItem] : local
  }, [filteredGroups, isUniversalFallback, universalFallbackItems, aiCreateItem])

  /** 打开列表项：全局搜索回退态用当前搜索词填模板并直跳；其余走常规 open（含模板输入页） */
  const openHomeItem = useCallback(
    (item: HomeItem) => {
      if (item.id === AI_CREATE_ID) {
        aiCreateFnRef.current(searchVal)
        return
      }
      const realBookmark = bookmarks.find((b) => b.id === item.id)
      if (!realBookmark) return
      if (isUniversalFallback && realBookmark.allowUniversal) {
        const q = searchVal.trim()
        openBookmarkLinkBase(realBookmark, {
          query: q,
          useUiQuery: false,
          source: 'template-universal-fallback'
        })
        // 点开后默认退出搜索态（搜索框与结果面板一并清空）
        clearSearchFnRef.current()
        return
      }
      // 模板入口由 enterTemplateMode 清搜索；直开由 openBookmarkLink 清搜索
      openBookmarkLink(realBookmark)
    },
    [bookmarks, isUniversalFallback, searchVal, openBookmarkLinkBase, openBookmarkLink]
  )

  // 切换视图后，若当前选中项不在可导航列表内则回退到首项
  useEffect(() => {
    if (!navigableItems.length) return
    if (!navigableItems.some((i) => i.id === selectedId)) {
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
