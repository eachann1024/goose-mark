import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSettingsStore } from '@/stores/settings'
import { BookmarkCard, Fav, GRID_ICON_SIZE_PX } from './BookmarkCard'
import { OverflowHoverTooltip } from '@/components/ui/overflow-tooltip'
import { DropGap, SecBlock, SortableCard, SortableGridCell, useDragDropGap } from './BookmarkDragParts'
import { bookmarkDragId } from './bookmarkDragId'
import { getHomeGroupIndex, getHomeSubItemIndex, type HomeGroup, type HomeItem, type HomeSub } from './viewModel'
import './virtual-bookmark-content.css'

type View = 'list' | 'grid'
/** 给键盘导航使用：index 是目标在子分组中的下标，避免查找百万条数据。 */
export interface VirtualBookmarkLocation { groupId: string; subId: string; index: number; align?: 'nearest' | 'center'; offset?: number; atEnd?: boolean }
const LOCATE_EVENT = 'goose:virtual-bookmark-locate'
const SELECT_EVENT = 'goose:virtual-bookmark-select'
export function scrollToVirtualBookmark(root: HTMLElement, location: VirtualBookmarkLocation): void {
  root.dispatchEvent(new CustomEvent<VirtualBookmarkLocation>(LOCATE_EVENT, { detail: location }))
}
export function scrollToVirtualBookmarkId(root: HTMLElement, id: string): void {
  root.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: id }))
}
type BookmarkAnchor = { itemId: string; offset: number; atEnd?: boolean; subId?: string; index?: number }
export function restoreVirtualBookmarkAnchor(root: HTMLElement, anchor: BookmarkAnchor): void {
  root.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: anchor }))
}
export function readVirtualBookmarkAnchor(root: HTMLElement): BookmarkAnchor | null {
  const rect = root.getBoundingClientRect()
  for (const item of root.querySelectorAll<HTMLElement>('[data-item-id]')) {
    const bounds = item.getBoundingClientRect()
    if (bounds.bottom > rect.top && bounds.top < rect.bottom) {
      const itemId = item.dataset.itemId
      if (itemId) {
        const row = item.closest<HTMLElement>('.virtual-bookmark-row')
        let cell: HTMLElement = item
        while (row && cell.parentElement && cell.parentElement !== row) cell = cell.parentElement
        const start = row ? Number(row.dataset.virtualStart) : NaN
        const column = row ? Array.prototype.indexOf.call(row.children, cell) as number : -1
        return { itemId, offset: bounds.top - rect.top, atEnd: root.scrollTop + root.clientHeight >= root.scrollHeight - 2,
          subId: item.dataset.subId, index: Number.isSafeInteger(start) && column >= 0 ? start + column : undefined }
      }
    }
  }
  return null
}

// 留出标题、其他内容和浏览器布局舍入的空间，所有子分组共享预算。
const MAX_PHYSICAL_ROWS_HEIGHT = 12_000_000
type Mapping = { before: number; end: number; total: number; scale: number }
function toPhysical(logical: number, map: Mapping) {
  if (logical <= map.before) return logical * map.scale
  if (logical <= map.end) return map.before * map.scale + logical - map.before
  return map.before * map.scale + map.end - map.before + (logical - map.end) * map.scale
}
function toLogical(physical: number, map: Mapping) {
  const start = map.before * map.scale
  const end = start + map.end - map.before
  if (physical <= start) return physical / map.scale
  if (physical <= end) return map.before + physical - start
  return map.end + (physical - end) / map.scale
}

export interface VirtualBookmarkContentProps {
  groups: HomeGroup[]
  view: View
  columns: number
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen?: (item: HomeItem) => void
  /** 绑定实际滚动容器；省略时自动查找最近的 .content。 */
  scrollElement?: HTMLElement | null
  overscan?: number
  renderItem?: (item: HomeItem, selected: boolean) => React.ReactNode
  showHeaders?: boolean
  draggable?: boolean
}

// 只保留近期测量，避免滚遍百万条后缓存无限增长。
class RowMeasurements {
  estimate: number
  private rows = new Map<number, number>()
  private calibrated = false
  constructor(estimate: number) { this.estimate = estimate }
  clear() { this.rows.clear(); this.calibrated = false }
  set(index: number, height: number) {
    if (!Number.isFinite(height) || height <= 0 || Math.abs((this.rows.get(index) ?? 0) - height) < 0.5) return false
    if (!this.calibrated) { this.estimate = height; this.calibrated = true }
    this.rows.delete(index)
    this.rows.set(index, height)
    if (this.rows.size > 512) this.rows.delete(this.rows.keys().next().value!)
    return true
  }
  offset(index: number) {
    let value = index * this.estimate
    for (const [row, height] of this.rows) if (row < index) value += height - this.estimate
    return value
  }
  minimumHeight() {
    let minimum = this.estimate
    for (const height of this.rows.values()) minimum = Math.min(minimum, height)
    return Math.max(1, minimum)
  }
  rowAt(offset: number, count: number) {
    let lo = 0, hi = count
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      if (this.offset(mid) <= offset) lo = mid
      else hi = mid - 1
    }
    return Math.min(lo, Math.max(0, count - 1))
  }
}

// 分组切换会卸载内容；保留映射所需的窗口和测量，使已保存的物理 scrollTop 可恢复同一逻辑位置。
const sectionMemory = new Map<string, { itemsToken: object; layoutKey: string; model: RowMeasurements; range: { start: number; end: number } }>()
const itemTokens = new WeakMap<HomeItem[], object>()
function itemsToken(items: HomeItem[]) {
  let token = itemTokens.get(items)
  if (!token) { token = {}; itemTokens.set(items, token) }
  return token
}

export function VirtualBookmarkContent({ groups, view, columns, selectedId, onSelect, onOpen, scrollElement, overscan = 2, renderItem, showHeaders = true, draggable = true }: VirtualBookmarkContentProps) {
  const marker = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<HTMLElement | null>(scrollElement ?? null)
  const [viewport, setViewport] = useState(0)
  const atBottom = useRef(false)
  const dropGap = useDragDropGap(groups, view)
  let totalRows = 0
  for (const group of groups) for (const sub of group.subs) totalRows += Math.ceil((sub.items.length + 1) / (view === 'grid' ? Math.max(1, columns) : 1))
  useLayoutEffect(() => {
    setRoot(scrollElement ?? marker.current?.closest<HTMLElement>('.content') ?? null)
  }, [scrollElement])
  useEffect(() => {
    if (!root) return
    let frame = 0
    const update = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; setViewport((n) => n + 1) }) }
    // 滚动事件本身已由浏览器按帧分发；直接提交范围更新，避免后台 rAF 被暂停时窗口停在旧位置。
    const onScroll = () => {
      atBottom.current = root.scrollTop + root.clientHeight >= root.scrollHeight - 2
      setViewport((n) => n + 1)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(root)
    update()
    return () => { root.removeEventListener('scroll', onScroll); observer.disconnect(); cancelAnimationFrame(frame) }
  }, [root])
  useEffect(() => {
    if (!root) return
    const locate = (event: Event) => {
      const detail = (event as CustomEvent<string | BookmarkAnchor>).detail
      const id = typeof detail === 'string' ? detail : detail?.itemId
      if (!id) return
      for (const group of groups) {
        if (typeof detail !== 'string' && detail.subId) {
          const sub = group.subs.find((entry) => entry.id === detail.subId)
          if (sub) {
            const savedIndex = detail.index
            const index = savedIndex !== undefined && sub.items[savedIndex]?.id === id ? savedIndex : getHomeSubItemIndex(group, id, sub.id)
            if (index >= 0) {
              scrollToVirtualBookmark(root, { groupId: group.id, subId: sub.id, index, offset: detail.offset, atEnd: detail.atEnd })
              return
            }
          }
        }
        const location = getHomeGroupIndex(group).locationByItemId.get(id)
        if (location) {
          scrollToVirtualBookmark(root, { groupId: location.groupId, subId: location.subGroupId, index: location.index, align: 'center', offset: typeof detail === 'string' ? undefined : detail.offset, atEnd: typeof detail === 'string' ? undefined : detail.atEnd })
          return
        }
      }
    }
    root.addEventListener(SELECT_EVENT, locate)
    return () => root.removeEventListener(SELECT_EVENT, locate)
  }, [groups, root])
  return <div ref={marker} className={`virtual-bookmark-content${showHeaders ? '' : ' is-headerless'}`}>
    {groups.map((group) => group.subs.map((sub) => <VirtualSection key={`${group.id}-${sub.id}`} groupId={group.id} sub={sub} view={view} columns={Math.max(1, columns)} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} root={root} viewport={viewport} overscan={Math.max(0, overscan)} totalRows={totalRows} gap={draggable && dropGap?.subId === sub.id ? dropGap : null} renderItem={renderItem} draggable={draggable} atBottom={atBottom} />))}
  </div>
}

function VirtualSection({ groupId, sub, view, columns, selectedId, onSelect, onOpen, root, viewport, overscan, totalRows, gap, renderItem, draggable, atBottom }: {
  groupId: string; sub: HomeSub; view: View; columns: number; selectedId: string | null
  onSelect: (id: string) => void; onOpen?: (item: HomeItem) => void; root: HTMLElement | null
  viewport: number; overscan: number; totalRows: number; gap: ReturnType<typeof useDragDropGap>
  renderItem?: (item: HomeItem, selected: boolean) => React.ReactNode; draggable: boolean
  atBottom: React.RefObject<boolean>
}) {
  const body = useRef<HTMLDivElement>(null)
  const [revision, setRevision] = useState(0)
  const density = useSettingsStore((s) => s.density)
  const icon = useSettingsStore((s) => s.gridIconSize)
  const showDescription = useSettingsStore((s) => s.listShowDescription)
  const fullDescription = useSettingsStore((s) => s.listFullDescription)
  const layoutKey = `${view}:${columns}:${density}:${icon}:${showDescription}:${fullDescription}`
  const memoryKey = JSON.stringify([groupId, sub.id, view])
  const token = itemsToken(sub.items)
  const saved = sectionMemory.get(memoryKey)
  const reusable = saved?.itemsToken === token && saved.layoutKey === layoutKey ? saved : undefined
  const measurements = useRef(reusable?.model ?? new RowMeasurements(view === 'grid' ? 150 : 72))
  const [range, setRange] = useState(() => reusable?.range ?? { start: 0, end: 0 })
  const latestMemory = useRef({ itemsToken: token, layoutKey, model: measurements.current, range })
  latestMemory.current = { itemsToken: token, layoutKey, model: measurements.current, range }
  useLayoutEffect(() => () => {
    sectionMemory.delete(memoryKey)
    sectionMemory.set(memoryKey, latestMemory.current)
    if (sectionMemory.size > 300) sectionMemory.delete(sectionMemory.keys().next().value!)
  }, [memoryKey])
  const rowColumns = view === 'grid' ? columns : 1
  const count = sub.items.length + (gap ? 1 : 0)
  const rowCount = Math.ceil(count / rowColumns)
  const model = measurements.current
  const onMeasure = useCallback(() => setRevision((n) => n + 1), [])
  const lastLayout = useRef(layoutKey)
  const lastItems = useRef(sub.items)
  useLayoutEffect(() => {
    if (lastLayout.current === layoutKey && lastItems.current === sub.items) return
    lastLayout.current = layoutKey
    lastItems.current = sub.items
    pendingLocation.current = null
    model.clear()
    model.estimate = view === 'grid' ? 150 : 72
    setRevision((n) => n + 1)
  }, [layoutKey, sub.items, model, view])
  useEffect(() => {
    const el = body.current
    if (!el) return
    let width = el.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().width
      // 隐藏的 keep-alive 面板宽度为 0，不代表布局实际变化。
      if (next <= 0) return
      if (Math.abs(width - next) < 0.5) return
      width = next
      model.clear()
      setRevision((n) => n + 1)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [model, root, !!count])
  const pendingLocation = useRef<{ id: string; index: number; align: 'nearest' | 'center'; offset?: number; atEnd?: boolean } | null>(null)
  const pendingLocationTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pendingLocationTimer.current), [])
  const pendingBottomRange = useRef<{ start: number; end: number } | null>(null)
  const total = model.offset(rowCount)
  const budget = MAX_PHYSICAL_ROWS_HEIGHT * (rowCount / Math.max(1, totalRows))
  const scale = total > 0 ? Math.min(1, budget / total) : 1
  const mapping: Mapping = { before: model.offset(range.start), end: model.offset(range.end), total, scale }
  useLayoutEffect(() => {
    const el = body.current
    if (pendingLocation.current) return
    // 隐藏面板保留窗口及测量：压缩映射依赖当前窗口，清空会改变相同 scrollTop 对应的行。
    if (!root || !el || !root.getClientRects().length) return
    if (!rowCount) { setRange((r) => r.start === 0 && r.end === 0 ? r : { start: 0, end: 0 }); return }
    const rootRect = root.getBoundingClientRect()
    const bodyRect = el.getBoundingClientRect()
    const top = rootRect.top - bodyRect.top
    const bottom = top + root.clientHeight
    const physicalTotal = toPhysical(total, mapping)
    if (bottom < -overscan * model.estimate || top > physicalTotal + overscan * model.estimate) {
      setRange((r) => r.start === 0 && r.end === 0 ? r : { start: 0, end: 0 }); return
    }
    const first = model.rowAt(Math.max(0, toLogical(top, mapping)), rowCount)
    // 窗口始终按真实视口高度限制，不能把压缩比例当作可见行数量。
    const start = Math.max(0, first - overscan)
    const end = Math.min(rowCount, first + Math.ceil(root.clientHeight / model.minimumHeight()) + 2 * overscan + 2)
    if ((start !== range.start || end !== range.end) && atBottom.current) pendingBottomRange.current = { start, end }
    setRange((r) => r.start === start && r.end === end ? r : { start, end })
  }, [root, viewport, rowCount, overscan, model, revision, layoutKey, range.start, range.end, scale])
  useLayoutEffect(() => {
    const target = pendingBottomRange.current
    if (!root || !target || target.start !== range.start || target.end !== range.end) return
    pendingBottomRange.current = null
    root.scrollTop = root.scrollHeight
  }, [root, range.start, range.end])
  useLayoutEffect(() => {
    const pending = pendingLocation.current
    if (!pending || !root) return
    if (sub.items[pending.index]?.id !== pending.id) {
      pendingLocation.current = null
      setRevision((n) => n + 1)
      return
    }
    if (!body.current) return
    const item = body.current.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(pending.id)}"]`)
    if (!item) return
    pendingLocation.current = null
    const rootRect = root.getBoundingClientRect()
    const rect = item.getBoundingClientRect()
    if (pending.atEnd) { atBottom.current = true; root.scrollTop = root.scrollHeight }
    else if (pending.offset !== undefined) root.scrollTop += rect.top - rootRect.top - pending.offset
    else if (pending.align === 'center') root.scrollTop += rect.top - rootRect.top - (root.clientHeight - rect.height) / 2
    else if (rect.top < rootRect.top) root.scrollTop += rect.top - rootRect.top
    else if (rect.bottom > rootRect.bottom) root.scrollTop += rect.bottom - rootRect.bottom
  }, [root, range.start, range.end, revision, sub.items])
  useEffect(() => {
    if (!root) return
    const locate = (event: Event) => {
      const target = (event as CustomEvent<VirtualBookmarkLocation>).detail
      if (!target || target.groupId !== groupId || target.subId !== sub.id || !body.current || !sub.items.length) return
      const index = Math.max(0, Math.min(sub.items.length - 1, target.index))
      const visualIndex = index + (gap && index >= gap.index ? 1 : 0)
      const row = Math.floor(visualIndex / rowColumns)
      pendingLocation.current = { id: sub.items[index].id, index, align: target.align ?? 'nearest', offset: target.offset, atEnd: target.atEnd }
      const pending = pendingLocation.current
      window.clearTimeout(pendingLocationTimer.current)
      pendingLocationTimer.current = window.setTimeout(() => {
        if (pendingLocation.current !== pending) return
        pendingLocation.current = null
        setRevision((n) => n + 1)
      }, 250)
      const bodyTop = body.current.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
      const top = bodyTop + toPhysical(model.offset(row), mapping)
      const bottom = top + model.offset(row + 1) - model.offset(row)
      if (target.align === 'center') root.scrollTop = top - (root.clientHeight - (bottom - top)) / 2
      else if (top < root.scrollTop) root.scrollTop = top
      else if (bottom > root.scrollTop + root.clientHeight) root.scrollTop = bottom - root.clientHeight
      const visibleRows = Math.ceil(root.clientHeight / model.minimumHeight()) + overscan + 2
      const start = Math.max(0, row - visibleRows)
      const end = Math.min(rowCount, row + visibleRows)
      setRange({ start, end })
      setRevision((n) => n + 1)
    }
    root.addEventListener(LOCATE_EVENT, locate)
    return () => root.removeEventListener(LOCATE_EVENT, locate)
  }, [root, groupId, sub.id, sub.items, gap, rowColumns, model, range.start, range.end, scale, revision, rowCount, overscan])
  const ids: string[] = []
  const rows = []
  for (let row = range.start; row < range.end; row++) {
    const cells = []
    for (let column = 0; column < rowColumns; column++) {
      const pos = row * rowColumns + column
      if (pos >= count) break
      if (gap && pos === gap.index) { cells.push(<DropGap key="gap" height={gap.height} view={view} targetId={gap.targetId} />); continue }
      const index = pos - (gap && pos > gap.index ? 1 : 0)
      const item = sub.items[index]
      if (!item) continue
      if (draggable) ids.push(bookmarkDragId(groupId, sub.id, item.id))
      cells.push(renderItem ? <div key={item.id} className="virtual-bookmark-custom-item">{renderItem(item, item.id === selectedId)}</div> : !draggable ? view === 'list'
        ? <BookmarkCard key={item.id} item={item} selected={item.id === selectedId} groupId={groupId} subId={sub.id} onClick={() => { onSelect(item.id); onOpen?.(item) }} />
        : <OverflowHoverTooltip key={item.id} className={`gcard${item.id === selectedId ? ' sel' : ''}`} title={item.ttl} data-item-id={item.id} data-group-id={groupId} data-sub-id={sub.id} onClick={() => { onSelect(item.id); onOpen?.(item) }}><Fav item={item} /><div className="ttl">{item.ttl}</div>{showDescription && (item.dsc || item.regDomain) && <div className={item.dsc ? 'dsc' : 'url'}>{item.dsc || item.regDomain}</div>}</OverflowHoverTooltip>
        : view === 'list'
        ? <SortableCard key={item.id} item={item} groupId={groupId} subId={sub.id} selected={item.id === selectedId} onSelect={onSelect} onOpen={onOpen} />
        : <SortableGridCell key={item.id} item={item} groupId={groupId} subId={sub.id} selected={item.id === selectedId} subText={showDescription ? (item.dsc || item.regDomain) : ''} subClass={showDescription && item.dsc ? 'dsc' : 'url'} onSelect={onSelect} onOpen={onOpen} />)
    }
    rows.push(<MeasuredRow key={row} index={row} model={model} onMeasure={onMeasure} view={view} columns={columns} iconSize={GRID_ICON_SIZE_PX[icon] ?? '46px'}>{cells}</MeasuredRow>)
  }
  const before = mapping.before * scale
  const after = Math.max(0, (total - mapping.end) * scale)
  return <SecBlock groupId={groupId} subId={sub.id} subName={sub.name} count={sub.items.length} view={view}>
    {!count ? <div className="sec-empty">暂无书签</div> : <div ref={body} className="virtual-bookmark-body">
      <div className="virtual-bookmark-spacer" style={{ height: before }} aria-hidden />
      {draggable ? <SortableContext items={ids} strategy={view === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>{rows}</SortableContext> : rows}
      <div className="virtual-bookmark-spacer" style={{ height: after }} aria-hidden />
    </div>}
  </SecBlock>
}

function MeasuredRow({ index, model, onMeasure, view, columns, iconSize, children }: {
  index: number; model: RowMeasurements; onMeasure: () => void; view: View; columns: number; iconSize: string; children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const report = useCallback(() => {
    const el = ref.current
    if (el && model.set(index, el.getBoundingClientRect().height)) onMeasure()
  }, [index, model, onMeasure])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(report)
    observer.observe(el)
    report()
    return () => observer.disconnect()
  }, [report])
  return <div ref={ref} data-virtual-start={index * (view === 'grid' ? columns : 1)} className={`virtual-bookmark-row ${view === 'grid' ? 'grid' : 'is-list'}`} style={view === 'grid' ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, '--grid-icon-size': iconSize } as React.CSSProperties : undefined}>{children}</div>
}
