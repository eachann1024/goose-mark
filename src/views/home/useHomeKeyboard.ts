import type * as React from 'react'
import { useEffect, useMemo } from 'react'
import { useBookmarkFormStore } from '@/hooks/useBookmarkForm'
import { shouldDeferListEnterShortcut } from '@/lib/inlineEditKeys'
import { getNavigationIndex, type HomeItem } from './viewModel'
import { type CtxState } from './homeTypes'
import { getSearchSurface } from './homeRuntime'
import { type HomeNavigationBindings, type HomeSearchBindings } from './homeInteractionTypes'

export function useHomeKeyboard({
  screen,
  setScreen,
  view,
  closeCtx,
  searchVal,
  clearSearch,
  headerSearchRef,
  focusSearchInput,
  ctx,
  navigableItems,
  selectedId,
  openHomeItem,
  getApplySearchValRef,
  isSearching,
  searchViewMode,
  isUniversalFallback,
  GRID_COLS,
  lastArrowAtRef,
  rootRef,
  keyboardNavRef,
  setSelectedId,
  syncSidebarForItem
}: Pick<HomeNavigationBindings, 'screen' | 'setScreen' | 'view' | 'selectedId' | 'setSelectedId'> &
  Pick<HomeSearchBindings, 'searchVal' | 'clearSearch' | 'focusSearchInput' | 'isSearching' | 'searchViewMode'> & {
  closeCtx: () => void
  headerSearchRef: React.RefObject<HTMLInputElement | null>
  ctx: CtxState
  navigableItems: HomeItem[]
  openHomeItem: (item: HomeItem) => void
  getApplySearchValRef: () => React.RefObject<(text: string, fromSubInput?: boolean) => void>
  isUniversalFallback: boolean
  GRID_COLS: number
  lastArrowAtRef: React.RefObject<number>
  rootRef: React.RefObject<HTMLDivElement | null>
  keyboardNavRef: React.RefObject<boolean>
  syncSidebarForItem: (itemId: string) => void
}) {
  const navigationIndex = useMemo(() => getNavigationIndex(navigableItems), [navigableItems])

  // ---- 全局键盘：Esc / ⌘K / 方向键导航 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 保存中：禁止 Esc 关闭表单（问题4）
        if (useBookmarkFormStore.getState().isSaving) return
        // 退出 add 表单时统一走关闭逻辑（问题2）
        if (screen === 'add') useBookmarkFormStore.getState().set({ showAdd: false })
        // AI 保存页进入时保留了搜索词，Esc 与「返回」一致：清空搜索后回主列表
        if (screen === 'aiSave') {
          clearSearch()
          setScreen(view)
          closeCtx()
          return
        }
        if (
          screen === 'add' ||
          screen === 'settings' ||
          screen === 'trash' ||
          screen === 'groups'
        ) {
          setScreen(view)
          closeCtx()
          return
        }
        // 列表态：Esc 优先清空内联搜索，其次让搜索框失焦
        if (searchVal) {
          clearSearch()
          closeCtx()
          return
        }
        if (document.activeElement === headerSearchRef.current) headerSearchRef.current?.blur()
        closeCtx()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // 表单页（add/edit）正在编辑时忽略 Cmd+K，避免未保存草稿被卸载
        if (screen === 'add') return
        e.preventDefault()
        focusSearchInput()
        return
      }

      const active = document.activeElement as HTMLElement | null
      const eventTarget = e.target instanceof Element ? e.target : null
      const isEditableElement = (el: Element | null): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false
        return (
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable
        )
      }
      // 同时看 activeElement 与 event.target，避免焦点抖动时 type-to-search 抢走 contentEditable 按键
      const inEditable =
        isEditableElement(active) ||
        isEditableElement(eventTarget) ||
        !!eventTarget?.closest('[contenteditable="true"], [contenteditable=""], textarea, input')

      if (screen !== 'list' && screen !== 'grid') return
      if (ctx.open) return

      // Enter：打开当前选中书签。无论焦点在顶栏搜索框、列表区还是无焦点（鼠标点击 / 方向键
      // 选中后焦点落在 body），都应直接打开；其他交互控件自行处理 Enter。
      // 全局搜索回退：用当前搜索词填入模板 URL 直接跳转（不进模板输入页）。
      if (e.key === 'Enter') {
        if (shouldDeferListEnterShortcut(e, headerSearchRef.current)) return
        if (eventTarget !== headerSearchRef.current) {
          // 卡片是 div[role=button]，由点击处理打开；原生 Enter 不会触发点击。
          const card = eventTarget?.closest<HTMLElement>('.gcard[role="button"]')
          if (card && card === eventTarget && !e.defaultPrevented) {
            e.preventDefault()
            card.click()
            return
          }
          const interactive = 'button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="menu"], [role^="menuitem"], [role="textbox"], [role="combobox"]'
          if (e.defaultPrevented || eventTarget?.closest(interactive) || active?.closest(interactive)) return
        }
        const index = selectedId == null ? undefined : navigationIndex.get(selectedId)
        const hit = index === undefined ? navigableItems[0] : navigableItems[index]
        if (hit) {
          e.preventDefault()
          openHomeItem(hit)
        }
        return
      }

      const isArrowKey =
        e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (inEditable && active === headerSearchRef.current) {
        // 顶栏搜索框聚焦：字符正常键入（内联过滤）；方向键放行到下方导航
        if (!isArrowKey) return
        // 方向键：落到下方导航逻辑
      } else if (inEditable) {
        return
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && e.key !== ' ') {
        // 列表区直接键入字符 → 聚焦当前搜索入口接管输入（type-to-search）
        e.preventDefault()
        getApplySearchValRef().current(searchVal + e.key)
        if (getSearchSurface() === 'utools-subinput') {
          window.utools?.subInputFocus?.()
        } else {
          headerSearchRef.current?.focus()
        }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const items = navigableItems
      if (!items.length) return

      const idx = (selectedId == null ? undefined : navigationIndex.get(selectedId)) ?? 0

      const total = items.length
      // 全局搜索命令条始终按竖条上下导航；搜索格子 / 首页网格才用列跨步
      const isGrid = (isSearching ? searchViewMode === 'grid' : view === 'grid') && !isUniversalFallback
      let newIdx = idx

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          newIdx = Math.min(idx + (isGrid ? GRID_COLS : 1), total - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          newIdx = Math.max(idx - (isGrid ? GRID_COLS : 1), 0)
          break
        case 'ArrowRight':
          if (!isGrid) return
          e.preventDefault()
          newIdx = Math.min(idx + 1, total - 1)
          break
        case 'ArrowLeft':
          if (!isGrid) return
          e.preventDefault()
          newIdx = Math.max(idx - 1, 0)
          break
        default:
          return
      }

      if (newIdx === idx) return
      // 长按方向键节流：系统 keydown repeat 频率很高（常 30+/s），会让选中项飞快掠过。
      // 限制每步最小间隔，把节奏压到 ~10/s，配合平滑滚动手感更稳。e.repeat 为 false（首次按下）时不节流，保证即时响应。
      if (e.repeat) {
        const now = performance.now()
        if (now - lastArrowAtRef.current < 95) return
        lastArrowAtRef.current = now
      } else {
        lastArrowAtRef.current = performance.now()
      }
      const next = items[newIdx]
      if (!next) return
      // 键盘导航期间给根元素打标记，CSS 据此禁用 :hover，避免鼠标停留处卡片一直高亮
      rootRef.current?.classList.add('kbd-nav')
      keyboardNavRef.current = true
      setSelectedId(next.id)
      if (!isGrid) syncSidebarForItem(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    view,
    screen,
    ctx.open,
    closeCtx,
    navigableItems,
    navigationIndex,
    selectedId,
    syncSidebarForItem,
    GRID_COLS,
    isUniversalFallback,
    isSearching,
    searchViewMode,
    openHomeItem,
    searchVal,
    clearSearch,
    focusSearchInput
  ])
}
