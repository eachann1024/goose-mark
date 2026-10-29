import type * as React from 'react'
import { useSettingsStore } from '@/stores/settings'
import { Ico } from './icon'
import { type HomeGroup, type HomeItem } from './viewModel'
import { GRID_ICON_SIZE_PX, BookmarkCard } from './BookmarkCard'
import { AICreateCommand, SearchEmptyUniversal } from './SearchEmptyUniversal'
import { GridCells } from './GridContent'

/** 搜索独立结果面：工具条 + 按分组分段的宫格/列表；搜索态禁用拖拽 */
export function SearchResultsSurface({
  query,
  items,
  groups,
  viewMode,
  columns,
  selectedId,
  universalItems,
  aiItem,
  onViewModeChange,
  onSelect,
  onOpen,
  onInspect,
  onMore,
  onClear,
}: {
  query: string
  items: HomeItem[]
  groups?: HomeGroup[]
  viewMode: 'list' | 'grid'
  columns: number
  selectedId: string | null
  universalItems: HomeItem[]
  aiItem: HomeItem | null
  onViewModeChange: (mode: 'list' | 'grid') => void
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  onInspect?: (item: HomeItem) => void
  onMore?: (e: React.MouseEvent, item: HomeItem) => void
  onClear: () => void
}) {
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const iconSize = GRID_ICON_SIZE_PX[gridIconSize] ?? '46px'
  const count = items.length
  const hasUniversal = count === 0 && universalItems.length > 0
  const hasCommands = count === 0 && (hasUniversal || !!aiItem)
  const aiFooter = aiItem && count > 0 ? (
    <div className="search-ai-foot">
      <AICreateCommand item={aiItem} selected={aiItem.id === selectedId} onSelect={onSelect} onOpen={onOpen} />
    </div>
  ) : null

  return (
    <div className="search-surface">
      <div className="search-toolbar">
        <div className="search-toolbar-meta">
          <span className="search-toolbar-label">搜索结果</span>
          <span className="search-toolbar-query" title={query}>
            {query}
          </span>
          <span className="search-toolbar-count">
            {hasUniversal ? '无本地匹配' : `${count} 个书签`}
          </span>
        </div>
        <div className="search-toolbar-actions">
          <div className="seg" role="group" aria-label="搜索结果布局">
            <button type="button" className={viewMode === 'grid' ? 'on' : ''} onClick={() => onViewModeChange('grid')}>
              <Ico name="layout-grid" />宫格
            </button>
            <button type="button" className={viewMode === 'list' ? 'on' : ''} onClick={() => onViewModeChange('list')}>
              <Ico name="list" />列表
            </button>
          </div>
          <button type="button" className="search-exit" title="清空搜索 (Esc)" onClick={onClear}>
            <Ico name="x" />
            <span>清空</span>
          </button>
        </div>
      </div>

      {count === 0 ? (
        hasCommands ? (
          <SearchEmptyUniversal
            items={universalItems}
            aiItem={aiItem}
            selectedId={selectedId}
            searchQuery={query}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ) : (
          <div className="empty search-empty">
            <b>没有找到匹配的书签</b>
            <span>换个关键词试试，或者直接粘贴网址让 AI 收藏</span>
          </div>
        )
      ) : (
        <div className={viewMode === 'grid' ? 'search-grid-wrap' : 'search-list'}>
          {(groups && groups.length ? groups : [{ id: 'flat', name: '', subs: [{ id: 'flat', name: '', items }] }]).map((group) =>
            group.subs.map((sub) => (
              <div className="sec-block" key={`${group.id}-${sub.id}`}>
                {group.name && (
                  <div className="sec-head">
                    <span className="g">{group.name}</span>
                    <span className="s">{sub.name}</span>
                  </div>
                )}
                {viewMode === 'grid' ? (
                  <GridCells
                    items={sub.items}
                    columns={columns}
                    selectedId={selectedId}
                    iconSize={iconSize}
                    onSelect={onSelect}
                    onOpen={onOpen}
                    onInspect={onInspect}
                    onMore={onMore}
                    searchQuery={query}
                  />
                ) : (
                  sub.items.map((item) => (
                    <BookmarkCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      query={query}
                      showHost
                      onMore={onMore ? (e) => onMore(e, item) : undefined}
                      onClick={() => { onSelect(item.id); onInspect?.(item) }}
                      onDoubleClick={() => onOpen?.(item)}
                    />
                  ))
                )}
              </div>
            ))
          )}
          {aiFooter}
        </div>
      )}
    </div>
  )
}
