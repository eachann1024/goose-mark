import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Ico } from './icon'
import { type HomeGroup, type HomeItem } from './viewModel'
import { BookmarkCard } from './BookmarkCard'
import { SecBlock, SortableCard } from './BookmarkDragParts'
import { SearchEmptyUniversal } from './SearchEmptyUniversal'

export function ListContent({
  groups,
  selectedId,
  onSelect,
  onOpen,
  searching,
  universalItems,
  searchQuery
}: {
  groups: HomeGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  searching?: boolean
  universalItems?: HomeItem[]
  searchQuery?: string
}) {
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
        <Ico name={searching ? 'search-x' : 'inbox'} />
        <span>{searching ? '没有找到匹配的书签' : '还没有书签，点右上角 + 新增第一个'}</span>
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
            view="list"
          >
            {s.items.length === 0 ? (
              <div className="sec-empty">暂无书签</div>
            ) : searching ? (
              s.items.map((b) => (
                <div key={`${g.id}-${s.id}-${b.id}`} onClick={() => { onSelect(b.id); onOpen?.(b) }}>
                  <BookmarkCard item={b} selected={b.id === selectedId} groupId={g.id} subId={s.id} />
                </div>
              ))
            ) : (
              <SortableContext items={s.items.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {s.items.map((b) => (
                  <SortableCard
                    key={`${g.id}-${s.id}-${b.id}`}
                    item={b}
                    groupId={g.id}
                    subId={s.id}
                    selected={b.id === selectedId}
                    onSelect={onSelect}
                    onOpen={onOpen}
                  />
                ))}
              </SortableContext>
            )}
          </SecBlock>
        ))
      )}
    </>
  )
}
