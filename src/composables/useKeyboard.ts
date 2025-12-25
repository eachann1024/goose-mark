
import type { Bookmark } from '@/types/bookmark'
import type { Ref } from 'vue'

export function useKeyboard(
  selectedIndex: Ref<number>,
  activeBookmarks: Ref<Bookmark[]>,
  searchViewOpen: Ref<boolean>,
  isMac: Ref<boolean>,
  showAdd: Ref<boolean>,
  showDeleteConfirm: Ref<boolean>,
  showIconSelector: Ref<boolean>,
  tab: Ref<string>,
  openBookmarkLink: (b: Bookmark) => void
) {
  const settingsStore = useSettingsStore()
  
  const bookmarkGridRef = ref<HTMLElement | null>(null)
  
  // CMD 快捷跳转
  const cmdPressed = ref(false)
  const showCmdHints = ref(false)
  let cmdHoldTimer: ReturnType<typeof setTimeout> | null = null
  let cmdHideTimer: ReturnType<typeof setTimeout> | null = null
  let cmdAutoHideTimer: ReturnType<typeof setTimeout> | null = null
  
  const hintKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const hintKeyById = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    activeBookmarks.value.slice(0, hintKeys.length).forEach((b, idx) => {
      map[b.id] = hintKeys[idx]
    })
    return map
  })

  // Scrolling
  const scrollSelectedIntoView = () => {
    nextTick(() => {
      const gridEl = bookmarkGridRef.value
      if (!gridEl) return
      const cards = gridEl.querySelectorAll<HTMLElement>('[data-bookmark-index]')
      const target = cards[selectedIndex.value]
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
    })
  }

  watch(selectedIndex, (v) => {
    if (v >= 0) scrollSelectedIntoView()
  })

  // Helpers
  const getGridColumns = (): number => {
    const cols = settingsStore.gridColumns
    return cols >= 2 && cols <= 5 ? cols : 4
  }

  const getWindowType = () => {
    try {
      return window.utools?.getWindowType?.()
    } catch {
      return undefined
    }
  }

  const isDetachedWindowNow = () => {
    const type = getWindowType()
    return type === 'detach' || type === 'browser'
  }

  const clearCmdTimer = () => {
    if (cmdHoldTimer) {
      clearTimeout(cmdHoldTimer)
      cmdHoldTimer = null
    }
  }

  const hideCmdHints = () => {
    clearCmdTimer()
    if (cmdHideTimer) {
      clearTimeout(cmdHideTimer)
      cmdHideTimer = null
    }
    if (cmdAutoHideTimer) {
      clearTimeout(cmdAutoHideTimer)
      cmdAutoHideTimer = null
    }
    cmdPressed.value = false
    showCmdHints.value = false
  }

  const scheduleHideCmdHints = () => {
    if (cmdHideTimer) {
      clearTimeout(cmdHideTimer)
      cmdHideTimer = null
    }
    cmdHideTimer = setTimeout(() => {
      cmdPressed.value = false
      showCmdHints.value = false
    }, 200)
  }

  // Key Handler
  const handleKeyNavigation = (e: KeyboardEvent) => {
    if (showAdd.value || showDeleteConfirm.value || showIconSelector.value || tab.value !== 'bookmarks') return
    
    // 有修饰键时直接放行（允许 Cmd+A、Cmd+C 等系统快捷键）
    if (e.metaKey || e.ctrlKey || e.altKey) return
    
    const active = document.activeElement as HTMLElement
    // 焦点在输入框/文本域/可编辑元素时不拦截导航键
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
    
    const key = e.key
    const bookmarks = activeBookmarks.value
    if (bookmarks.length === 0) return
    
    const cols = getGridColumns()
    const total = bookmarks.length
    
    let newIndex = selectedIndex.value
    const detached = isDetachedWindowNow()
    const isGridNav = detached || !searchViewOpen.value
    
    switch (key) {
      case 'ArrowRight':
        if (!isGridNav) return
        e.preventDefault()
        newIndex = selectedIndex.value < 0 ? 0 : Math.min(selectedIndex.value + 1, total - 1)
        break
      case 'ArrowLeft':
        if (!isGridNav) return
        e.preventDefault()
        newIndex = selectedIndex.value < 0 ? 0 : Math.max(selectedIndex.value - 1, 0)
        break
      case 'ArrowDown':
        e.preventDefault()
        newIndex = selectedIndex.value < 0
          ? 0
          : Math.min(selectedIndex.value + (isGridNav ? cols : 1), total - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        newIndex = selectedIndex.value < 0
          ? 0
          : Math.max(selectedIndex.value - (isGridNav ? cols : 1), 0)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex.value >= 0 && selectedIndex.value < bookmarks.length) {
            const bookmark = bookmarks[selectedIndex.value]
            if (bookmark) openBookmarkLink(bookmark)
        }
        return
      default:
        return
    }
    
    selectedIndex.value = newIndex
    if (newIndex >= 0) scrollSelectedIntoView()
  }

  const handleLocalSearchKey = (e: KeyboardEvent) => {
    const key = e.key
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      handleKeyNavigation(e)
    }
  }

  const isHintHoldKey = (key: string) => {
    // 仅使用 Control 触发数字快捷键，不再需要 Option/Alt
    return key === 'Control'
  }

  // Setup Listeners
  useEventListener(window, 'keydown', handleKeyNavigation)
  
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    // 允许在输入框中使用 Ctrl 触发提示，不再拦截 input 焦点


    if (isHintHoldKey(e.key)) {
      if (!cmdPressed.value) {
        cmdPressed.value = true
        if (cmdHideTimer) {
          clearTimeout(cmdHideTimer)
          cmdHideTimer = null
        }
        clearCmdTimer()
        cmdHoldTimer = setTimeout(() => {
          showCmdHints.value = true
          // 10 秒后自动隐藏
          if (cmdAutoHideTimer) clearTimeout(cmdAutoHideTimer)
          cmdAutoHideTimer = setTimeout(() => {
            hideCmdHints()
          }, 10000)
        }, 100)
      }
      return
    }
    if (cmdPressed.value) {
      const codeToKey: Record<string, string> = {
        'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
        'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',
        'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3', 'Numpad4': '4', 'Numpad5': '5',
        'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9', 'Numpad0': '0'
      }
      const key = codeToKey[e.code]
      if (!key) return
      const targetId = Object.entries(hintKeyById.value).find(([, k]) => k === key)?.[0]
      if (targetId) {
        const bookmark = activeBookmarks.value.find(b => b.id === targetId)
        if (bookmark) {
          e.preventDefault()
          e.stopPropagation()
          openBookmarkLink(bookmark)
          hideCmdHints()
        }
      }
    }
  })

  useEventListener(window, 'keyup', (e: KeyboardEvent) => {
    if (isHintHoldKey(e.key)) {
      scheduleHideCmdHints()
    }
  })

  return {
    bookmarkGridRef,
    setBookmarkGridRef: (el: HTMLElement | null) => { bookmarkGridRef.value = el },
    cmdPressed,
    showCmdHints,
    hintKeyById,
    hideCmdHints,
    handleKeyNavigation,
    handleLocalSearchKey
  }
}
