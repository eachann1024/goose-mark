import type * as React from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useSettingsStore } from '@/stores/settings'
import { OverflowHoverTooltip } from '@/components/ui/overflow-tooltip'
import { Ico } from './icon'
import { type HomeGroup, type HomeItem } from './viewModel'
import { Fav, GRID_ICON_SIZE_PX } from './BookmarkCard'
import { SecBlock, SortableGridCell } from './BookmarkDragParts'
import { SearchEmptyUniversal } from './SearchEmptyUniversal'

/** 单个宫格集合（共用：分组段内与搜索扁平态） */
export function GridCells({
  items,
  columns,
  selectedId,
  iconSize,
  onSelect,
  onOpen,
  groupId,
  subId,
  subtitleMode = 'default',
}: {
  items: HomeItem[]
  columns: number
  selectedId: string | null
  iconSize: string
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  groupId?: string
  subId?: string
  /** default=首页设置；host=搜索格子固定展示 host */
  subtitleMode?: 'default' | 'host'
}) {
  const showDescription = useSettingsStore((s) => s.listShowDescription)
  // 非搜索态（有归属分组）才可拖拽；搜索扁平宫格无 groupId，保持普通渲染
  const canDrag = !!groupId && !!subId
  const cells = items.map((b) => {
    const subText =
      subtitleMode === 'host'
        ? (b.host || b.regDomain || '')
        : showDescription
          ? (b.dsc || b.regDomain)
          : ''
    const subClass =
      subtitleMode === 'host'
        ? 'url'
        : showDescription && b.dsc
          ? 'dsc'
          : 'url'
    if (canDrag) {
      return (
        <SortableGridCell
          key={b.id}
          item={b}
          groupId={groupId!}
          subId={subId!}
          selected={b.id === selectedId}
          subText={subText}
          subClass={subClass}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      )
    }
    return (
      <OverflowHoverTooltip
        key={b.id}
        className={`gcard${b.id === selectedId ? ' sel' : ''}`}
        title={b.ttl}
        description={subClass === 'dsc' ? subText : undefined}
        data-item-id={b.id}
        data-group-id={groupId}
        data-sub-id={subId}
        onClick={() => { onSelect(b.id); onOpen?.(b) }}
      >
        <Fav item={b} />
        <div className="ttl">{b.ttl}</div>
        {subText && <div className={subClass}>{subText}</div>}
      </OverflowHoverTooltip>
    )
  })
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        '--grid-icon-size': iconSize
      } as React.CSSProperties}
    >
      {canDrag ? (
        <SortableContext items={items.map((b) => b.id)} strategy={rectSortingStrategy}>
          {cells}
        </SortableContext>
      ) : cells}
    </div>
  )
}



/**
 * 网格视图：全量渲染所有分组段，连续滚动可达任意分组。
 * 每个子分组一个 .sec-block（复用列表视图的 data-sec-id / data-sub-id 锚点协议，
 * 让 scroll-spy 与侧栏点击定位无缝共用）。搜索态退化为单个扁平宫格。
 */
export function GridContent({
  groups,
  columns,
  selectedId,
  onSelect,
  onOpen,
  searching,
  searchItems,
  universalItems,
  searchQuery
}: {
  groups: HomeGroup[]
  columns: number
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  searching?: boolean
  searchItems?: HomeItem[]
  universalItems?: HomeItem[]
  searchQuery?: string
}) {
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const iconSize = GRID_ICON_SIZE_PX[gridIconSize] ?? '46px'

  // 搜索态：全局匹配结果扁平成一个宫格，不分段
  if (searching) {
    if (!searchItems || !searchItems.length) {
      if (universalItems && universalItems.length > 0) {
        return (
          <SearchEmptyUniversal
            items={universalItems}
            selectedId={selectedId}
            searchQuery={searchQuery || ''}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        )
      }
      return (
        <div className="empty">
          <Ico name="search-x" />
          <span>没有找到匹配的书签</span>
        </div>
      )
    }
    return (
      <GridCells
        items={searchItems}
        columns={columns}
        selectedId={selectedId}
        iconSize={iconSize}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    )
  }

  if (!groups.length) {
    return (
      <div className="empty">
        <Ico name="inbox" />
        <span>还没有书签，点右上角 + 新增第一个</span>
      </div>
    )
  }

  return (
    <>
      {groups.map((g) =>
        g.subs.map((s) => (
          <SecBlock
            key={`${g.id}-${s.id}`}
            groupId={g.id}
            subId={s.id}
            subName={s.name}
            count={s.items.length}
            view="grid"
          >
            {s.items.length === 0 ? (
              <div className="sec-empty">暂无书签</div>
            ) : (
              <GridCells
                items={s.items}
                columns={columns}
                selectedId={selectedId}
                iconSize={iconSize}
                onSelect={onSelect}
                onOpen={onOpen}
                groupId={g.id}
                subId={s.id}
              />
            )}
          </SecBlock>
        ))
      )}
    </>
  )
}
