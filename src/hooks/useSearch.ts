import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import PinyinMatch from 'pinyin-match'
import type { Bookmark, BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore, selectFilteredBookmarks, TRASH_GROUP_ID } from '@/stores/bookmark'

/**
 * 搜索浮层 / 直输触发搜索 / 自动退出（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue：computed + watch + refDebounced + useEventListener + Ref 入参。
 * React 版：
 *   - 入参从 Vue Ref 改为 React 受控值 + setter（tab/setTab、selectedIndex/setSelectedIndex），
 *     subInput 相关回调直接传函数（canUseSubInput 改为 getter）。
 *   - debouncedSearch 用 useState + setTimeout 150ms 防抖。
 *   - searchResults / activeBookmarks 用 useMemo + store 订阅。
 *   - watch(store.search) → useEffect 依赖 store.search；keydown 监听用 useEffect 注册/清理。
 * 无埋点。store.getBookmarkLocations / filteredBookmarks 为业务阶段方法。
 */

const SEARCH_AUTO_EXIT_SECONDS = 15

export type UseSearchOptions = {
  canUseSubInput: () => boolean
  focusSubInput: (forceRemount?: boolean) => void
  syncSubInputValue: (text: string) => void
  suppressAutoOpenOverlay?: () => boolean
}

type CloseSearchOptions = { restoreFocus?: boolean }
type OpenSearchOptions = { initialQuery?: string; selectText?: boolean; focusInput?: boolean }

export function useSearch(
  tab: 'bookmarks' | 'settings',
  setTab: (tab: 'bookmarks' | 'settings') => void,
  selectedIndex: number,
  setSelectedIndex: (index: number) => void,
  options: UseSearchOptions
) {
  const search = useBookmarkStore((s) => s.search)
  const setSearch = useBookmarkStore((s) => s.setSearch)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  // selectFilteredBookmarks 每次返回新数组；直接作为 zustand 选择器会让 useSyncExternalStore
  // 的 getSnapshot 每次拿到新引用 → 无限重渲染（React error #185）。用 useShallow 做浅比较，
  // 仅当数组内容变化才重渲染。
  const filteredBookmarks = useBookmarkStore(useShallow(selectFilteredBookmarks))

  // 稳定保存依赖项，供监听器与回调读取最新值
  const optionsRef = useRef(options)
  optionsRef.current = options
  const setTabRef = useRef(setTab)
  setTabRef.current = setTab
  const setSelectedIndexRef = useRef(setSelectedIndex)
  setSelectedIndexRef.current = setSelectedIndex

  const localSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [searchViewOpen, setSearchViewOpen] = useState(false)
  const searchViewOpenRef = useRef(false)
  searchViewOpenRef.current = searchViewOpen

  const searchAutoExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchLastActiveAt = useRef(0)

  // 防抖搜索关键词（150ms）
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(timer)
  }, [search])

  const searchResults = useMemo(() => {
    const query = (typeof debouncedSearch === 'string' ? debouncedSearch : '').trim().toLowerCase()
    if (!query) return [] as Bookmark[]

    const store = useBookmarkStore.getState()
    const pool = bookmarks.filter((item) => {
      const locs: BookmarkLocation[] = store.getBookmarkLocations(item.id)
      return !locs.some((loc) => loc.groupId === TRASH_GROUP_ID)
    })

    return pool.filter((item) => {
      const haystack = [item.title, item.desc ?? '', item.url, item.tags.join(' ')].join(' ').toLowerCase()
      if (haystack.includes(query)) return true
      return !!PinyinMatch.match(haystack, query)
    })
  }, [debouncedSearch, bookmarks])

  const activeBookmarks = useMemo(
    () => (searchViewOpen ? searchResults : filteredBookmarks),
    [searchViewOpen, searchResults, filteredBookmarks]
  )
  const activeBookmarksRef = useRef(activeBookmarks)
  activeBookmarksRef.current = activeBookmarks

  const searchAutoExitText = `${SEARCH_AUTO_EXIT_SECONDS} 秒无操作自动退出`

  const clearSearchAutoExit = useCallback(() => {
    if (searchAutoExitTimer.current) {
      clearTimeout(searchAutoExitTimer.current)
      searchAutoExitTimer.current = null
    }
  }, [])

  const markSearchActive = useCallback(() => {
    searchLastActiveAt.current = Date.now()
  }, [])

  const closeSearchView = useCallback(
    ({ restoreFocus = true }: CloseSearchOptions = {}) => {
      setSearchViewOpen(false)
      searchViewOpenRef.current = false
      clearSearchAutoExit()
      setSearch('')
      if (restoreFocus && optionsRef.current.canUseSubInput()) {
        optionsRef.current.syncSubInputValue('')
        optionsRef.current.focusSubInput(true)
      }
      setSelectedIndexRef.current(-1)
    },
    [clearSearchAutoExit, setSearch]
  )

  const scheduleSearchAutoExit = useCallback(() => {
    clearSearchAutoExit()
    if (!searchViewOpenRef.current) return
    markSearchActive()
    searchAutoExitTimer.current = setTimeout(() => {
      closeSearchView()
    }, SEARCH_AUTO_EXIT_SECONDS * 1000)
  }, [clearSearchAutoExit, markSearchActive, closeSearchView])

  const focusLocalSearchInput = useCallback((selectText = false) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const el = localSearchInputRef.current
        if (!el || typeof el.focus !== 'function') return
        el.focus()
        if (selectText) {
          el.select?.()
        } else {
          const len = el.value?.length ?? 0
          try {
            el.setSelectionRange(len, len)
          } catch {
            // ignore
          }
        }
      })
    })
  }, [])

  const openSearchView = useCallback(
    (settings: OpenSearchOptions = {}) => {
      const { initialQuery, selectText = false, focusInput = true } = settings
      setTabRef.current('bookmarks')
      setSearchViewOpen(true)
      searchViewOpenRef.current = true
      markSearchActive()

      setSelectedIndexRef.current(-1)
      if (typeof initialQuery === 'string') setSearch(initialQuery)
      scheduleSearchAutoExit()

      const opts = optionsRef.current
      if (opts.canUseSubInput()) {
        if (focusInput) opts.focusSubInput()
        opts.syncSubInputValue(useBookmarkStore.getState().search)
      } else {
        focusLocalSearchInput(selectText)
      }
    },
    [markSearchActive, scheduleSearchAutoExit, setSearch, focusLocalSearchInput]
  )

  const isEditableElement = (el: HTMLElement | null) => {
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  const handleTypeToSearch = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      if (isEditableElement(active)) return
      // uTools 原生 subInput 会自行维护输入值；这里再拼接一次会造成竞态丢字。
      if (optionsRef.current.canUseSubInput()) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key
      if (!key || key.length !== 1) return
      if (key === ' ' || key < ' ') return
      e.preventDefault()

      if (!searchViewOpenRef.current) {
        setSearch(key)
        openSearchView()
        return
      }

      const nextValue = useBookmarkStore.getState().search + key
      setSearch(nextValue)
      if (optionsRef.current.canUseSubInput()) {
        optionsRef.current.focusSubInput()
        optionsRef.current.syncSubInputValue(nextValue)
      } else {
        focusLocalSearchInput()
      }
    },
    [setSearch, openSearchView, focusLocalSearchInput]
  )

  const syncSearchAutoExitOnReturn = useCallback(() => {
    if (!searchViewOpenRef.current) return
    const last = searchLastActiveAt.current || Date.now()
    const elapsed = Date.now() - last
    if (elapsed >= SEARCH_AUTO_EXIT_SECONDS * 1000) {
      closeSearchView()
      return
    }
    clearSearchAutoExit()
    searchAutoExitTimer.current = setTimeout(() => {
      closeSearchView()
    }, SEARCH_AUTO_EXIT_SECONDS * 1000 - elapsed)
  }, [closeSearchView, clearSearchAutoExit])

  // watch(store.search) 等价：search 变化时调整浮层与选中态
  const prevSearchRef = useRef(search)
  useEffect(() => {
    const nextText = typeof search === 'string' ? search : ''
    const prevText = typeof prevSearchRef.current === 'string' ? prevSearchRef.current : ''
    prevSearchRef.current = search

    if (searchViewOpenRef.current && !nextText.trim() && prevText.trim()) {
      closeSearchView()
      return
    }

    if (searchViewOpenRef.current) {
      setSelectedIndexRef.current(-1)
      markSearchActive()
    } else {
      const list = activeBookmarksRef.current
      setSelectedIndexRef.current(list.length > 0 ? 0 : -1)
    }
    if (nextText && !searchViewOpenRef.current && !optionsRef.current.suppressAutoOpenOverlay?.()) {
      openSearchView()
    }
    if (searchViewOpenRef.current) scheduleSearchAutoExit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // 全局 keydown：Escape / Tab 退出，字符直输触发搜索
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const isInput = isEditableElement(active)

      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInput && !searchViewOpenRef.current) return

      if (e.key === 'Escape' && searchViewOpenRef.current) {
        e.preventDefault()
        closeSearchView()
        return
      }
      if (e.key === 'Tab' && searchViewOpenRef.current) {
        e.preventDefault()
        closeSearchView()
        return
      }
      handleTypeToSearch(e)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeSearchView, handleTypeToSearch])

  return {
    localSearchInputRef,
    searchViewOpen,
    searchValue: search,
    setSearchValue: setSearch,
    debouncedSearch,
    searchResults,
    activeBookmarks,
    searchAutoExitText,
    openSearchView,
    closeSearchView,
    handleTypeToSearch,
    focusLocalSearchInput,
    scheduleSearchAutoExit,
    clearSearchAutoExit,
    syncSearchAutoExitOnReturn
  }
}
