import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { Bookmark } from '@/types/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Search, List, LayoutGrid, TextCursorInput } from 'lucide-react'
import { SearchHintLine } from './SearchHintLine'
import { BookmarkPreview } from './BookmarkPreview'
import { BookmarksList } from './BookmarksList'
import { BookmarksGrid } from './BookmarksGrid'
import './bookmarks.css'

/**
 * SearchOverlay（React 版）
 * --------------------------------------------------------------------------
 * 全屏搜索浮层：输入框（独立模式）/ 提示（uTools 模式）、结果计数、list/grid 视图切换
 * （独立持久化到 settings）、空态/无结果态、列表+预览栏 / 网格视图、底部提示。
 * 等价旧版 Vue SearchOverlay.vue。i-ph 图标 → lucide-react；组合本模块子组件。
 * 通过 ref 暴露 focus()（等价旧版 defineExpose）。受控值 + 回调。无埋点。
 */
export interface SearchOverlayHandle {
  focus: () => void
}

export interface SearchOverlayProps {
  open: boolean
  isUTools: boolean
  searchValue: string
  activeBookmarks: Bookmark[]
  selectedIndex: number
  enableSubInput: boolean
  storeSearch: string
  searchAutoExitText: string
  showCmdHints: boolean
  hintKeyById: Record<string, string>
  gridColumns: number
  setGridRef: (el: HTMLElement | null) => void
  onSearchValueChange: (value: string) => void
  onSelectedIndexChange: (value: number) => void
  onClose: () => void
  onKeydown: (e: React.KeyboardEvent) => void
  onRefocus?: () => void
  onEdit: (bookmark: Bookmark, el?: HTMLElement) => void
  onOpen: (bookmark: Bookmark) => void
  onCopyUrl: (bookmark: Bookmark) => void
  onRemove: (bookmark: Bookmark) => void
  onContextMenu: (e: React.MouseEvent, bookmark: Bookmark) => void
  onReorder: (payload: { fromId: string; toId: string }) => void
  onLocate: (bookmark: Bookmark) => void
}

const OVERLAY_HINT_TEXT = '按下 Tab 退出搜索模式'

export const SearchOverlay = forwardRef<SearchOverlayHandle, SearchOverlayProps>(function SearchOverlay(
  {
    open,
    isUTools,
    searchValue,
    activeBookmarks,
    selectedIndex,
    enableSubInput,
    storeSearch,
    searchAutoExitText,
    showCmdHints,
    hintKeyById,
    gridColumns,
    setGridRef,
    onSearchValueChange,
    onSelectedIndexChange,
    onClose,
    onKeydown,
    onEdit,
    onOpen,
    onCopyUrl,
    onRemove,
    onContextMenu,
    onReorder,
    onLocate
  },
  ref
) {
  const settingsViewMode = useSettingsStore((s) => s.searchViewMode)
  const setSearchViewMode = useSettingsStore((s) => s.setSearchViewMode)

  // 本地视图模式（防抖持久化），等价旧版 ref + watch
  const [searchViewMode, setLocalViewMode] = useState<'list' | 'grid'>(settingsViewMode)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      if (useSettingsStore.getState().searchViewMode !== searchViewMode) {
        setSearchViewMode(searchViewMode)
      }
    }, 0)
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [searchViewMode, setSearchViewMode])

  const inputRef = useRef<HTMLInputElement | null>(null)
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus()
  }))

  const selectedBookmark =
    selectedIndex < 0 || selectedIndex >= activeBookmarks.length ? null : activeBookmarks[selectedIndex]

  const emptyStateTitle = storeSearch
    ? '未找到匹配结果'
    : enableSubInput
      ? '在上方搜索框输入关键字'
      : '输入关键字开始搜索'

  const EmptyIcon = storeSearch ? TextCursorInput : Search
  const resultCountText = activeBookmarks.length === 0 ? '' : `共 ${activeBookmarks.length} 条结果`

  if (!open) return null

  return (
    <section className="search-overlay fixed inset-0 z-[2000] backdrop-blur-md overflow-hidden flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 py-3.5 flex items-center gap-3 border-b border-border/20">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose}>
          <ArrowLeft className="size-[18px]" />
        </Button>

        {!isUTools ? (
          <Input
            ref={inputRef}
            value={searchValue}
            onChange={(e) => onSearchValueChange(e.target.value)}
            onKeyDown={onKeydown}
            placeholder="输入关键字搜索书签..."
            className="flex-1 h-10 text-sm bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl"
            autoFocus
          />
        ) : (
          <div className="flex-1 flex items-center gap-2 h-10 px-4 rounded-xl bg-muted/30 text-sm text-muted-foreground">
            <Search className="size-4 text-muted-foreground/50" />
            <span className="truncate">{storeSearch || OVERLAY_HINT_TEXT}</span>
          </div>
        )}

        {resultCountText && (
          <span className="text-xs text-muted-foreground/60 shrink-0 hidden sm:block">{resultCountText}</span>
        )}

        {/* 视图切换 */}
        <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5 shrink-0">
          <button
            type="button"
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-md text-xs transition-colors',
              searchViewMode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setLocalViewMode('list')}
          >
            <List className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-md text-xs transition-colors',
              searchViewMode === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setLocalViewMode('grid')}
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!storeSearch ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/35 text-foreground/55">
              <EmptyIcon className="size-9" />
            </div>
            <div className="text-base font-medium text-foreground/60 mb-2">{emptyStateTitle}</div>
            <SearchHintLine enableSubInput={enableSubInput} searchAutoExitText={searchAutoExitText} />
          </div>
        ) : activeBookmarks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/35 text-foreground/55">
              <EmptyIcon className="size-9" />
            </div>
            <div className="text-base font-medium text-foreground/60 mb-2">{emptyStateTitle}</div>
            <div className="text-[13px] text-muted-foreground">
              <SearchHintLine enableSubInput={enableSubInput} searchAutoExitText={searchAutoExitText} />
            </div>
          </div>
        ) : searchViewMode === 'list' ? (
          <div className="h-full flex">
            <div className="flex-1 min-w-0 overflow-y-auto px-4 py-2">
              <BookmarksList
                bookmarks={activeBookmarks}
                selectedIndex={selectedIndex}
                isTrashActive={false}
                showCommandHints={showCmdHints}
                hintKeyById={hintKeyById}
                readonly
                clickableIcon
                onSelect={onSelectedIndexChange}
                onOpen={onOpen}
                onContextMenu={(e, b) => {
                  e.preventDefault()
                  onCopyUrl(b)
                }}
                onIconClick={onCopyUrl}
                onLocate={onLocate}
              />
            </div>
            <BookmarkPreview
              bookmark={selectedBookmark}
              isTrashActive={false}
              onOpen={onOpen}
              onEdit={onEdit}
              onRemove={onRemove}
              onCopyUrl={onCopyUrl}
              onLocate={onLocate}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-5 py-3">
            <BookmarksGrid
              bookmarks={activeBookmarks}
              selectedIndex={selectedIndex}
              isTrashActive={false}
              columns={gridColumns}
              setGridRef={setGridRef}
              hideAddCard
              showCommandHints={showCmdHints}
              hintKeyById={hintKeyById}
              readonly
              showEdit={false}
              showDelete={false}
              showLocate
              selectionVariant="search"
              onEdit={onEdit}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onReorder={onReorder}
              onLocate={onLocate}
            />
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-5 py-2 border-t border-border/20 flex items-center justify-between text-[11px] text-muted-foreground/50">
        <span>{searchAutoExitText}</span>
        <span className="hidden sm:inline">Tab 退出 · 双击打开 · 右键复制</span>
      </div>
    </section>
  )
})

export default SearchOverlay
