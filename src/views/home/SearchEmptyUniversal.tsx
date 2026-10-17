import { Ico } from './icon'
import { type HomeItem } from './viewModel'
import { Fav } from './BookmarkCard'

/** 「AI 创建书签」命令行：命令条与结果列表底部共用 */
export function AICreateCommand({
  item,
  selected,
  onSelect,
  onOpen
}: {
  item: HomeItem
  selected: boolean
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  return (
    <div
      className={`usearch-cmd usearch-ai${selected ? ' sel' : ''}`}
      data-item-id={item.id}
      onClick={() => {
        onSelect(item.id)
        onOpen?.(item)
      }}
    >
      <div className="fav"><Ico name="sparkles" /></div>
      <span className="usearch-ttl">{item.ttl}</span>
      {selected && <span className="usearch-enter">↵ AI 创建</span>}
    </div>
  )
}

/** 搜索无匹配 + 全局搜索回退：居中空态 + 底部可滚动命令条（方案 B，列表/网格同布局） */
export function SearchEmptyUniversal({
  items,
  aiItem,
  selectedId,
  searchQuery,
  onSelect,
  onOpen
}: {
  items: HomeItem[]
  aiItem?: HomeItem | null
  selectedId: string | null
  searchQuery: string
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
}) {
  const q = searchQuery.trim()
  return (
    <div className="usearch">
      <div className="usearch-main">
        <Ico name="search-x" />
        <div className="usearch-msg">没有找到匹配的书签</div>
        {items.length > 0 && <div className="usearch-sub">试试下方的全局搜索</div>}
      </div>
      <div className="usearch-strip">
        <div className="usearch-strip-h">
          <span className="usearch-strip-l">{items.length > 0 ? `全局搜索 · ${items.length}` : '命令'}</span>
          <span className="usearch-strip-r">
            <kbd className="usearch-kbd">↑</kbd>
            <kbd className="usearch-kbd">↓</kbd>
            <span>选择</span>
            <kbd className="usearch-kbd">↵</kbd>
            <span>打开</span>
          </span>
        </div>
        <div className="usearch-list">
          {aiItem && <AICreateCommand item={aiItem} selected={aiItem.id === selectedId} onSelect={onSelect} onOpen={onOpen} />}
          {items.map((item) => {
            const sel = item.id === selectedId
            return (
              <div
                key={item.id}
                className={`usearch-cmd${sel ? ' sel' : ''}`}
                data-item-id={item.id}
                onClick={() => {
                  onSelect(item.id)
                  onOpen?.(item)
                }}
              >
                <Fav item={item} />
                <span className="usearch-ttl">{item.ttl}</span>
                <span className="usearch-q">
                  「{q ? <em>{q}</em> : '…'}」
                </span>
                {sel && <span className="usearch-enter">↵ 打开</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
