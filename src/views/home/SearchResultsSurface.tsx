import { useSettingsStore } from '@/stores/settings'
import { Ico } from './icon'
import { type HomeItem } from './viewModel'
import { Fav, GRID_ICON_SIZE_PX } from './BookmarkCard'
import { SearchEmptyUniversal } from './SearchEmptyUniversal'
import { GridCells } from './GridContent'

/** 搜索结果行（列表布局）：密度按搜索场景收紧，扁平无分组段 */
export function SearchResultRow({
  item,
  selected,
  onSelect,
  onOpen,
}: {
  item: HomeItem
  selected?: boolean
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  const showTags = useSettingsStore((s) => s.listShowTags)
  const sub = item.dsc?.trim() || item.url || item.host
  return (
    <div
      className={`search-row${selected ? ' sel' : ''}`}
      data-item-id={item.id}
      onClick={() => {
        onSelect(item.id)
        onOpen?.(item)
      }}
    >
      <Fav item={item} />
      <div className="search-row-body">
        <div className="search-row-top">
          <span className="search-row-ttl">{item.ttl}</span>
          {item.pin && <Ico name="pin" className="pin" />}
        </div>
        {sub && <div className="search-row-sub">{sub}</div>}
        {showTags && item.tags.length > 0 && (
          <div className="search-row-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



/** 搜索独立结果面：工具条 + 列表/格子两版布局；搜索态禁用拖拽（无分组上下文） */
export function SearchResultsSurface({
  query,
  items,
  viewMode,
  columns,
  selectedId,
  universalItems,
  onViewModeChange,
  onSelect,
  onOpen,
  onClear,
}: {
  query: string
  items: HomeItem[]
  viewMode: 'list' | 'grid'
  columns: number
  selectedId: string | null
  universalItems: HomeItem[]
  onViewModeChange: (mode: 'list' | 'grid') => void
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  onClear: () => void
}) {
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const iconSize = GRID_ICON_SIZE_PX[gridIconSize] ?? '46px'
  const count = items.length
  const hasUniversal = count === 0 && universalItems.length > 0

  return (
    <div className="search-surface">
      <div className="search-toolbar">
        <div className="search-toolbar-meta">
          <span className="search-toolbar-label">搜索</span>
          <span className="search-toolbar-query" title={query}>
            {query}
          </span>
          <span className="search-toolbar-count">
            {hasUniversal ? '无本地匹配' : `${count} 个结果`}
          </span>
        </div>
        <div className="search-toolbar-actions">
          <div className="search-view-toggle" role="group" aria-label="搜索结果布局">
            <button
              type="button"
              className={viewMode === 'list' ? 'on' : ''}
              title="列表布局"
              aria-pressed={viewMode === 'list'}
              onClick={() => onViewModeChange('list')}
            >
              <Ico name="list" />
            </button>
            <button
              type="button"
              className={viewMode === 'grid' ? 'on' : ''}
              title="格子布局"
              aria-pressed={viewMode === 'grid'}
              onClick={() => onViewModeChange('grid')}
            >
              <Ico name="layout-grid" />
            </button>
          </div>
          <button type="button" className="search-exit" title="清空搜索 (Esc)" onClick={onClear}>
            <Ico name="x" />
            <span>清空</span>
          </button>
        </div>
      </div>

      {count === 0 ? (
        hasUniversal ? (
          <SearchEmptyUniversal
            items={universalItems}
            selectedId={selectedId}
            searchQuery={query}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ) : (
          <div className="empty search-empty">
            <Ico name="search-x" />
            <span>没有找到匹配的书签</span>
          </div>
        )
      ) : viewMode === 'grid' ? (
        <div className="search-grid-wrap">
          <GridCells
            items={items}
            columns={columns}
            selectedId={selectedId}
            iconSize={iconSize}
            onSelect={onSelect}
            onOpen={onOpen}
            subtitleMode="host"
          />
        </div>
      ) : (
        <div className="search-list">
          {items.map((item) => (
            <SearchResultRow
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
