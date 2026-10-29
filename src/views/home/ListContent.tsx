import type * as React from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { type HomeGroup, type HomeItem } from './viewModel'
import { BookmarkCard } from './BookmarkCard'
import { SecBlock, SortableCard, DropGap, useDragDropGap, insertDropGap } from './BookmarkDragParts'
import { SearchEmptyUniversal } from './SearchEmptyUniversal'
import { bookmarkDragId } from './bookmarkDragId'

export function ListContent({
  groups,
  selectedId,
  onSelect,
  onOpen,
  searching,
  universalItems,
  searchQuery,
  onInspect,
  onMore,
}: {
  groups: HomeGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  searching?: boolean
  universalItems?: HomeItem[]
  searchQuery?: string
  onInspect?: (item: HomeItem) => void
  onMore?: (e: React.MouseEvent, item: HomeItem) => void
}) {
  const dropGap = useDragDropGap(groups, 'list')

  if (!groups.length) {
    if (searching && universalItems && universalItems.length > 0) {
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
        <b>{searching ? '没有找到匹配的书签' : '还没有书签'}</b>
        <span>{searching ? '换个关键词试试，或者直接粘贴网址让 AI 收藏' : '点右上角收集，新增第一个'}</span>
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
              view="list"
            >
              {s.items.length === 0 ? (
                gap ? <DropGap height={gap.height} view="list" /> : <div className="sec-empty">暂无书签</div>
              ) : searching ? (
                s.items.map((b) => (
                  <BookmarkCard
                    key={`${g.id}-${s.id}-${b.id}`}
                    item={b}
                    selected={b.id === selectedId}
                    groupId={g.id}
                    subId={s.id}
                    query={searchQuery}
                    showHost
                    onMore={onMore ? (e) => onMore(e, b) : undefined}
                    onClick={() => { onSelect(b.id); onInspect?.(b) }}
                    onDoubleClick={() => onOpen?.(b)}
                  />
                ))
              ) : (
                <SortableContext items={s.items.map((b) => bookmarkDragId(g.id, s.id, b.id))} strategy={verticalListSortingStrategy}>
                  {insertDropGap(
                    s.items.map((b) => (
                      <SortableCard
                        key={`${g.id}-${s.id}-${b.id}`}
                        item={b}
                        groupId={g.id}
                        subId={s.id}
                        selected={b.id === selectedId}
                        onSelect={onSelect}
                        onOpen={onOpen}
                        onInspect={onInspect}
                        onMore={onMore}
                        query={searchQuery}
                      />
                    )),
                    gap
                  )}
                </SortableContext>
              )}
            </SecBlock>
          )
        })
      )}
    </>
  )
}
