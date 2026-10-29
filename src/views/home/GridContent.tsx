import type * as React from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useSettingsStore } from '@/stores/settings'
import { OverflowHoverTooltip } from '@/components/ui/overflow-tooltip'
import { Ico } from './icon'
import { type HomeGroup, type HomeItem } from './viewModel'
import { Fav, GRID_ICON_SIZE_PX } from './BookmarkCard'
import { HighlightText } from './highlight'
import { SecBlock, SortableGridCell, DropGap, useDragDropGap } from './BookmarkDragParts'
import { SearchEmptyUniversal } from './SearchEmptyUniversal'
import { bookmarkDragId } from './bookmarkDragId'

/** 把落点占位插到指定下标（跨子分组拖拽时用） */
function withGap(cells: React.ReactNode[], gapAt: number | null | undefined, gapNode: React.ReactNode): React.ReactNode[] {
  if (!gapNode || typeof gapAt !== 'number') return cells
  const at = Math.max(0, Math.min(gapAt, cells.length))
  return [...cells.slice(0, at), gapNode, ...cells.slice(at)]
}

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
  gapAt,
  gapNode,
  onInspect,
  onMore,
  searchQuery,
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
  /** 跨子分组拖拽：落点占位插入到该下标处，让后面的格子真正让位 */
  gapAt?: number | null
  gapNode?: React.ReactNode
  onInspect?: (item: HomeItem) => void
  onMore?: (e: React.MouseEvent, item: HomeItem) => void
  searchQuery?: string
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
          onInspect={onInspect}
          onMore={onMore}
          query={searchQuery}
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
        onClick={() => { onSelect(b.id); onInspect?.(b) }}
        onDoubleClick={() => onOpen?.(b)}
      >
        <Fav item={b} />
        <div className="meta">
          <div className="ttl"><HighlightText text={b.ttl} query={searchQuery} /></div>
          {subText && <div className={subClass}><HighlightText text={subText} query={searchQuery} /></div>}
        </div>
        {b.pin && <Ico name="pin" className="pin" />}
        {onMore && (
          <button
            type="button"
            data-more
            className="more"
            aria-label="更多"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMore(e, b) }}
          >
            <Ico name="more-horizontal" />
          </button>
        )}
      </OverflowHoverTooltip>
    )
  })
  return (
    <div
      className="grid"
      style={{ '--grid-icon-size': iconSize } as React.CSSProperties}
    >
      {canDrag ? (
        <SortableContext items={items.map((b) => bookmarkDragId(groupId!, subId!, b.id))} strategy={rectSortingStrategy}>
          {withGap(cells, gapAt, gapNode)}
        </SortableContext>
      ) : withGap(cells, gapAt, gapNode)}
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
  searchQuery,
  onInspect,
  onMore,
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
  onInspect?: (item: HomeItem) => void
  onMore?: (e: React.MouseEvent, item: HomeItem) => void
}) {
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const iconSize = GRID_ICON_SIZE_PX[gridIconSize] ?? '46px'
  // 跨子分组拖拽：目标段靠落点占位让位（同段由 dnd-kit 自身让位）
  const dropGap = useDragDropGap(groups, 'grid')

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
          <b>没有找到匹配的书签</b>
          <span>换个关键词试试，或者直接粘贴网址让 AI 收藏</span>
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
        onInspect={onInspect}
        onMore={onMore}
        searchQuery={searchQuery}
      />
    )
  }

  if (!groups.length) {
    return (
      <div className="empty">
        <b>还没有书签</b>
        <span>点右上角收集，新增第一个</span>
      </div>
    )
  }

  return (
    <>
      {groups.map((g) =>
        g.subs.map((s) => {
          const gap = dropGap && dropGap.subId === s.id ? dropGap : null
          return (
            <SecBlock
              key={`${g.id}-${s.id}`}
              groupId={g.id}
              subId={s.id}
              subName={s.name}
              count={s.items.length}
              view="grid"
            >
              {s.items.length === 0 ? (
                gap ? <DropGap height={gap.height} view="grid" /> : <div className="sec-empty">暂无书签</div>
              ) : (
                <GridCells
                  items={s.items}
                  columns={columns}
                  selectedId={selectedId}
                  iconSize={iconSize}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onInspect={onInspect}
                  onMore={onMore}
                  groupId={g.id}
                  subId={s.id}
                  gapAt={gap?.index ?? null}
                  gapNode={gap ? <DropGap height={gap.height} view="grid" /> : null}
                />
              )}
            </SecBlock>
          )
        })
      )}
    </>
  )
}
