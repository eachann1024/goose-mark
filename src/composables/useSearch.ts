

import PinyinMatch from 'pinyin-match'
import type { Bookmark } from '@/types/bookmark'
import type { Ref } from 'vue'

export function useSearch(
    tab: Ref<'bookmarks' | 'settings'>, 
    selectedIndex: Ref<number>,
    isUTools: Ref<boolean>
) {
  const store = useBookmarkStore()
  const settingsStore = useSettingsStore()

  // Helper to determine if we should use uTools sub-input
  const canUseSubInput = () => {
     // 简单判断：必须是 uTools 环境且非独立/浏览器窗口
     // 注意：isUTools 是 Ref，通过 .value 获取
     if (!isUTools.value) return false
     try {
       const type = window.utools?.getWindowType?.()
       return type !== 'detach' && type !== 'browser'
     } catch {
       return false
     }
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

  const searchAutoExitText = computed(() => {
    const seconds = settingsStore.searchAutoExitSeconds
    return seconds > 0 ? `${seconds} 秒无操作自动退出` : '自动退出已关闭'
  })

  const clearSearchAutoExit = () => {
    if (searchAutoExitTimer) {
      clearTimeout(searchAutoExitTimer)
      searchAutoExitTimer = null
    }
  }

  const markSearchActive = () => {
    searchLastActiveAt.value = Date.now()
  }

  const closeSearchView = () => {
    searchViewOpen.value = false
    clearSearchAutoExit()
    store.setSearch('')
    if (canUseSubInput()) {
      window.utools?.setSubInputValue?.('')
    }
    selectedIndex.value = -1
  }

  const scheduleSearchAutoExit = () => {
    clearSearchAutoExit()
    if (!searchViewOpen.value) return
    const seconds = settingsStore.searchAutoExitSeconds
    if (!seconds || seconds <= 0) return
    markSearchActive()
    searchAutoExitTimer = setTimeout(() => {
      closeSearchView()
    }, seconds * 1000)
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

  const focusUToolsInput = () => {
    window.utools?.subInputFocus?.()
  }

  const syncUToolsSubInputValue = (text: string) => {
    window.utools?.setSubInputValue?.(text)
  }

  type OpenSearchOptions = { initialQuery?: string; selectText?: boolean }
  const openSearchView = (options: OpenSearchOptions = {}) => {
    const { initialQuery, selectText = false } = options
    tab.value = 'bookmarks'
    searchViewOpen.value = true
    markSearchActive()
    
    selectedIndex.value = -1
    if (typeof initialQuery === 'string') {
      store.setSearch(initialQuery)
    }
    scheduleSearchAutoExit()
    if (canUseSubInput()) {
      focusUToolsInput()
      syncUToolsSubInputValue(store.search)
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
    if (canUseSubInput() && searchViewOpen.value) return
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
      focusUToolsInput()
      syncUToolsSubInputValue(nextValue)
    } else {
      focusLocalSearchInput()
    }
  }

  const handleSubInput = ({ text }: { text: string }) => {
    store.setSearch(text)
  }

  const syncSearchAutoExitOnReturn = () => {
    if (!searchViewOpen.value) return
    const seconds = settingsStore.searchAutoExitSeconds
    if (!seconds || seconds <= 0) return
    const last = searchLastActiveAt.value || Date.now()
    const elapsed = Date.now() - last
    if (elapsed >= seconds * 1000) {
      closeSearchView()
      return
    }
    clearSearchAutoExit()
    searchAutoExitTimer = setTimeout(() => {
      closeSearchView()
    }, seconds * 1000 - elapsed)
  }

  // Watchers
  watch(() => store.search, (val) => {
    if (searchViewOpen.value) {
      selectedIndex.value = -1
      markSearchActive()
    } else {
      const list = activeBookmarks.value
      selectedIndex.value = list.length > 0 ? 0 : -1
    }
    if (val && !searchViewOpen.value) openSearchView()
    if (searchViewOpen.value) scheduleSearchAutoExit()
  })

  watch(() => settingsStore.searchAutoExitSeconds, () => {
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
    // uTools 吸附模式下 Tab 退出搜索，独立窗口模式用 Esc
    if (e.key === 'Tab' && searchViewOpen.value && canUseSubInput()) {
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
    focusUToolsInput,
    handleSubInput,
    scheduleSearchAutoExit,
    clearSearchAutoExit,
    syncSearchAutoExitOnReturn
  }
}
