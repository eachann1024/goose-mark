

import PinyinMatch from 'pinyin-match'
import type { Bookmark } from '@/types/bookmark'
import type { Ref } from 'vue'

const SEARCH_AUTO_EXIT_SECONDS = 15

type UseSearchOptions = {
  canUseSubInputRef: Ref<boolean>
  focusSubInput: (forceRemount?: boolean) => void
  syncSubInputValue: (text: string) => void
  suppressAutoOpenOverlayRef?: Ref<boolean>
}

export function useSearch(
    tab: Ref<'bookmarks' | 'settings'>, 
    selectedIndex: Ref<number>,
    options: UseSearchOptions
) {
  const store = useBookmarkStore()

  // Helper to determine if we should use uTools sub-input
  const canUseSubInput = () => {
     return options.canUseSubInputRef.value
  }

  const localSearchInputRef = ref<HTMLInputElement | { $el?: HTMLElement } | null>(null)
  const searchViewOpen = ref(false)
  let searchAutoExitTimer: ReturnType<typeof setTimeout> | null = null
  const searchLastActiveAt = ref(0)

  const searchValue = computed({
    get: () => store.search,
    set: v => store.setSearch(typeof v === 'string' ? v : '')
  })

  // 防抖搜索关键词（150ms）
  const debouncedSearch = refDebounced(toRef(store, 'search'), 150)

  const searchResults = computed(() => {
    const query = (typeof debouncedSearch.value === 'string' ? debouncedSearch.value : '').trim().toLowerCase()
    if (!query) return [] as Bookmark[]

    const pool = store.bookmarks.filter(item => {
      const locs = store.getBookmarkLocations(item.id)
      return !locs.some(loc => loc.groupId === TRASH_GROUP_ID)
    })

    return pool.filter(item => {
      const haystack = [item.title, item.desc ?? '', item.url, item.tags.join(' ')].join(' ').toLowerCase()
      if (haystack.includes(query)) return true
      return !!PinyinMatch.match(haystack, query)
    })
  })

  const activeBookmarks = computed(() => searchViewOpen.value ? searchResults.value : store.filteredBookmarks)

  const searchAutoExitText = computed(() => `${SEARCH_AUTO_EXIT_SECONDS} 秒无操作自动退出`)

  const clearSearchAutoExit = () => {
    if (searchAutoExitTimer) {
      clearTimeout(searchAutoExitTimer)
      searchAutoExitTimer = null
    }
  }

  const markSearchActive = () => {
    searchLastActiveAt.value = Date.now()
  }

  type CloseSearchOptions = { restoreFocus?: boolean }
  const closeSearchView = ({ restoreFocus = true }: CloseSearchOptions = {}) => {
    searchViewOpen.value = false
    clearSearchAutoExit()
    store.setSearch('')
    if (restoreFocus && canUseSubInput()) {
      options.syncSubInputValue('')
      options.focusSubInput(true)
    }
    selectedIndex.value = -1
  }

  const scheduleSearchAutoExit = () => {
    clearSearchAutoExit()
    if (!searchViewOpen.value) return
    markSearchActive()
    searchAutoExitTimer = setTimeout(() => {
      closeSearchView()
    }, SEARCH_AUTO_EXIT_SECONDS * 1000)
  }

  const getLocalSearchInputEl = () => {
    const holder = localSearchInputRef.value
    if (!holder) return null
    if (holder instanceof HTMLElement) return holder as HTMLInputElement
    const el = holder.$el
    return el instanceof HTMLInputElement ? el : null
  }

  const focusLocalSearchInput = (selectText = false) => {
    nextTick(() => {
      requestAnimationFrame(() => {
        const el = getLocalSearchInputEl()
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
  }

  type OpenSearchOptions = { initialQuery?: string; selectText?: boolean; focusInput?: boolean }
  const openSearchView = (settings: OpenSearchOptions = {}) => {
    const { initialQuery, selectText = false, focusInput = true } = settings
    tab.value = 'bookmarks'
    searchViewOpen.value = true
    markSearchActive()
    
    selectedIndex.value = -1
    if (typeof initialQuery === 'string') {
      store.setSearch(initialQuery)
    }
    scheduleSearchAutoExit()
    if (canUseSubInput()) {
      if (focusInput) {
        options.focusSubInput()
      }
      options.syncSubInputValue(store.search)
    } else {
      focusLocalSearchInput(selectText)
    }
  }

  const isEditableElement = (el: HTMLElement | null) => {
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  const handleTypeToSearch = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null
    if (isEditableElement(active)) return
    // uTools 原生 subInput 会自行维护输入值；这里再拼接一次会造成竞态丢字。
    if (canUseSubInput()) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key
    if (!key || key.length !== 1) return
    if (key === ' ' || key < ' ') return
    e.preventDefault()

    if (!searchViewOpen.value) {
      store.setSearch(key)
      openSearchView()
      return
    }

    const nextValue = store.search + key
    store.setSearch(nextValue)
    if (canUseSubInput()) {
      options.focusSubInput()
      options.syncSubInputValue(nextValue)
    } else {
      focusLocalSearchInput()
    }
  }

  const syncSearchAutoExitOnReturn = () => {
    if (!searchViewOpen.value) return
    const last = searchLastActiveAt.value || Date.now()
    const elapsed = Date.now() - last
    if (elapsed >= SEARCH_AUTO_EXIT_SECONDS * 1000) {
      closeSearchView()
      return
    }
    clearSearchAutoExit()
    searchAutoExitTimer = setTimeout(() => {
      closeSearchView()
    }, SEARCH_AUTO_EXIT_SECONDS * 1000 - elapsed)
  }

  // Watchers
  watch(() => store.search, (val, prevVal) => {
    const nextText = typeof val === 'string' ? val : ''
    const prevText = typeof prevVal === 'string' ? prevVal : ''

    if (searchViewOpen.value && !nextText.trim() && prevText.trim()) {
      closeSearchView()
      return
    }

    if (searchViewOpen.value) {
      selectedIndex.value = -1
      markSearchActive()
    } else {
      const list = activeBookmarks.value
      selectedIndex.value = list.length > 0 ? 0 : -1
    }
    if (nextText && !searchViewOpen.value && !options.suppressAutoOpenOverlayRef?.value) openSearchView()
    if (searchViewOpen.value) scheduleSearchAutoExit()
  })

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null
    const isInput = isEditableElement(active)

    // 忽略有修饰键的组合键，避免拦截系统快捷键（如 Cmd+A, Cmd+C 等）
    // 如果在输入框中，或者按下了 Cmd/Ctrl/Alt，则不处理搜索逻辑
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (isInput && !searchViewOpen.value) return 

    if (e.key === 'Escape' && searchViewOpen.value) {
      e.preventDefault()
      closeSearchView()
      return
    }
    // 搜索视图下统一使用 Tab 退出，避免浮层内外出现两套提示
    if (e.key === 'Tab' && searchViewOpen.value) {
      e.preventDefault()
      closeSearchView()
      return
    }
    // 直接输入字符触发搜索
    handleTypeToSearch(e)
  })

  return {
    localSearchInputRef,
    searchViewOpen,
    searchValue,
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
