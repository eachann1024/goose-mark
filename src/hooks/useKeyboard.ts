import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { useSettingsStore } from '@/stores/settings'

/**
 * 键盘导航 / Cmd(⌘) 或 Alt + 数字 快速跳转书签（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue：大量 Ref 入参 + computed + watch + useEventListener + nextTick。
 * React 版：
 *   - 入参改为 React 受控值 / getter；selectedIndex 用 value + setter。
 *   - 内部状态（cmdPressed / showCmdHints）用 useState；定时器与最新值用 useRef 镜像。
 *   - keydown / keyup 监听用 useEffect 注册并卸载清理；watch(selectedIndex) → useEffect。
 *   - 修复旧版引用未定义 showDeleteConfirm 的 bug：改用入参 showDeleteConfirm()（默认 false）。
 * 无埋点。
 */

type OpenBookmarkLink = (
  b: Bookmark,
  options?: { source?: string; openMethod?: 'keyboard' | 'click' | 'command' | 'plugin' }
) => void

export type UseKeyboardParams = {
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  activeBookmarks: Bookmark[]
  searchViewOpen: boolean
  isMac: boolean
  showAdd: boolean
  showIconSelector: boolean
  showDeleteConfirm?: boolean
  tab: string
  openBookmarkLink: OpenBookmarkLink
}

const hintKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export function useKeyboard(params: UseKeyboardParams) {
  const paramsRef = useRef(params)
  paramsRef.current = params

  const gridColumns = useSettingsStore((s) => s.gridColumns)

  const bookmarkGridRef = useRef<HTMLElement | null>(null)
  const setBookmarkGridRef = useCallback((el: HTMLElement | null) => {
    bookmarkGridRef.current = el
  }, [])

  // CMD 快捷跳转状态
  const [cmdPressed, setCmdPressed] = useState(false)
  const cmdPressedRef = useRef(false)
  const [showCmdHints, setShowCmdHints] = useState(false)
  const updateCmdPressed = useCallback((v: boolean) => {
    cmdPressedRef.current = v
    setCmdPressed(v)
  }, [])

  const cmdHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cmdHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cmdAutoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hintKeyById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    params.activeBookmarks.slice(0, hintKeys.length).forEach((b, idx) => {
      map[b.id] = hintKeys[idx]
    })
    return map
  }, [params.activeBookmarks])
  const hintKeyByIdRef = useRef(hintKeyById)
  hintKeyByIdRef.current = hintKeyById

  const scrollSelectedIntoView = useCallback(() => {
    queueMicrotask(() => {
      const gridEl = bookmarkGridRef.current
      if (!gridEl) return
      const cards = gridEl.querySelectorAll<HTMLElement>('[data-bookmark-index]')
      const target = cards[paramsRef.current.selectedIndex]
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
    })
  }, [])

  // watch(selectedIndex) → 滚动到可见
  useEffect(() => {
    if (params.selectedIndex >= 0) scrollSelectedIntoView()
  }, [params.selectedIndex, scrollSelectedIntoView])

  const getGridColumns = useCallback((): number => {
    const cols = gridColumns
    return cols >= 2 && cols <= 5 ? cols : 4
  }, [gridColumns])

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

  const clearCmdTimer = useCallback(() => {
    if (cmdHoldTimer.current) {
      clearTimeout(cmdHoldTimer.current)
      cmdHoldTimer.current = null
    }
  }, [])

  const hideCmdHints = useCallback(() => {
    clearCmdTimer()
    if (cmdHideTimer.current) {
      clearTimeout(cmdHideTimer.current)
      cmdHideTimer.current = null
    }
    if (cmdAutoHideTimer.current) {
      clearTimeout(cmdAutoHideTimer.current)
      cmdAutoHideTimer.current = null
    }
    updateCmdPressed(false)
    setShowCmdHints(false)
  }, [clearCmdTimer, updateCmdPressed])

  const scheduleHideCmdHints = useCallback(() => {
    if (cmdHideTimer.current) {
      clearTimeout(cmdHideTimer.current)
      cmdHideTimer.current = null
    }
    cmdHideTimer.current = setTimeout(() => {
      updateCmdPressed(false)
      setShowCmdHints(false)
    }, 200)
  }, [updateCmdPressed])

  const handleKeyNavigation = useCallback(
    (e: KeyboardEvent) => {
      const p = paramsRef.current
      if (p.showAdd || p.showIconSelector || p.tab !== 'bookmarks') return

      const hasModifier = p.isMac ? e.metaKey : e.altKey
      if (hasModifier) return
      if (e.ctrlKey) return

      const active = document.activeElement as HTMLElement
      const isInInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      // 搜索浮层打开时，允许方向键从输入框内穿透，用于上下选中结果
      if (isInInput && !p.searchViewOpen) return

      const key = e.key
      const bookmarks = p.activeBookmarks
      if (bookmarks.length === 0) return

      const cols = getGridColumns()
      const total = bookmarks.length

      let newIndex = p.selectedIndex
      const detached = isDetachedWindowNow()
      const isGridNav = detached || !p.searchViewOpen

      switch (key) {
        case 'ArrowRight':
          if (!isGridNav) return
          e.preventDefault()
          newIndex = p.selectedIndex < 0 ? 0 : Math.min(p.selectedIndex + 1, total - 1)
          break
        case 'ArrowLeft':
          if (!isGridNav) return
          e.preventDefault()
          newIndex = p.selectedIndex < 0 ? 0 : Math.max(p.selectedIndex - 1, 0)
          break
        case 'ArrowDown':
          e.preventDefault()
          newIndex = p.selectedIndex < 0 ? 0 : Math.min(p.selectedIndex + (isGridNav ? cols : 1), total - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          newIndex = p.selectedIndex < 0 ? 0 : Math.max(p.selectedIndex - (isGridNav ? cols : 1), 0)
          break
        case 'Enter':
          e.preventDefault()
          if (p.selectedIndex >= 0 && p.selectedIndex < bookmarks.length) {
            const bookmark = bookmarks[p.selectedIndex]
            if (bookmark)
              p.openBookmarkLink(bookmark, {
                source: p.searchViewOpen ? 'search' : 'bookmark',
                openMethod: 'keyboard'
              })
          }
          return
        default:
          return
      }

      p.setSelectedIndex(newIndex)
      if (newIndex >= 0) scrollSelectedIntoView()
    },
    [getGridColumns, scrollSelectedIntoView]
  )

  const handleLocalSearchKey = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      const key = e.key
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        handleKeyNavigation(e as KeyboardEvent)
      }
    },
    [handleKeyNavigation]
  )

  const getModifierKeyName = useCallback(() => (paramsRef.current.isMac ? 'Meta' : 'Alt'), [])

  // 监听器：导航键 + ⌘/Alt+数字跳转 + keyup 隐藏 hint
  useEffect(() => {
    window.addEventListener('keydown', handleKeyNavigation)
    return () => window.removeEventListener('keydown', handleKeyNavigation)
  }, [handleKeyNavigation])

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      const p = paramsRef.current
      if (p.showAdd || p.showDeleteConfirm || p.showIconSelector) return

      const hasModifier = p.isMac ? e.metaKey : e.altKey

      if (hasModifier) {
        if (!cmdPressedRef.current) {
          updateCmdPressed(true)
          if (cmdHideTimer.current) {
            clearTimeout(cmdHideTimer.current)
            cmdHideTimer.current = null
          }
          clearCmdTimer()
          cmdHoldTimer.current = setTimeout(() => {
            setShowCmdHints(true)
            if (cmdAutoHideTimer.current) clearTimeout(cmdAutoHideTimer.current)
            cmdAutoHideTimer.current = setTimeout(() => {
              hideCmdHints()
            }, 10000)
          }, 150)
        }

        const codeToKey: Record<string, string> = {
          Digit1: '1',
          Digit2: '2',
          Digit3: '3',
          Digit4: '4',
          Digit5: '5',
          Digit6: '6',
          Digit7: '7',
          Digit8: '8',
          Digit9: '9',
          Digit0: '0',
          Numpad1: '1',
          Numpad2: '2',
          Numpad3: '3',
          Numpad4: '4',
          Numpad5: '5',
          Numpad6: '6',
          Numpad7: '7',
          Numpad8: '8',
          Numpad9: '9',
          Numpad0: '0'
        }
        const key = codeToKey[e.code]
        if (key) {
          const targetId = Object.entries(hintKeyByIdRef.current).find(([, k]) => k === key)?.[0]
          if (targetId) {
            const bookmark = paramsRef.current.activeBookmarks.find((b) => b.id === targetId)
            if (bookmark) {
              e.preventDefault()
              e.stopPropagation()
              paramsRef.current.openBookmarkLink(bookmark)
              hideCmdHints()
            }
          }
        }
        return
      }
    }

    const onKeyup = (e: KeyboardEvent) => {
      if (e.key === getModifierKeyName()) scheduleHideCmdHints()
    }

    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
    return () => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('keyup', onKeyup)
    }
  }, [updateCmdPressed, clearCmdTimer, hideCmdHints, scheduleHideCmdHints, getModifierKeyName])

  // 卸载时清理所有定时器
  useEffect(() => {
    return () => {
      ;[cmdHoldTimer, cmdHideTimer, cmdAutoHideTimer].forEach((t) => {
        if (t.current) clearTimeout(t.current)
      })
    }
  }, [])

  return {
    bookmarkGridRef,
    setBookmarkGridRef,
    cmdPressed,
    showCmdHints,
    hintKeyById,
    hideCmdHints,
    handleKeyNavigation,
    handleLocalSearchKey
  }
}
