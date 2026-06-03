import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Bookmark } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { BookmarkIcon } from '@/components/BookmarkIcon'
import {
  ChevronRight,
  ExternalLink,
  Copy,
  Pencil,
  Trash2,
  Tag,
  Link as LinkIcon,
  Folder,
  PanelRight
} from 'lucide-react'

/**
 * BookmarkPreview（React 版）
 * --------------------------------------------------------------------------
 * 右侧书签详情预览栏：图标/标题/URL、操作按钮、可编辑笔记、标签、位置、定位。
 * 等价旧版 Vue BookmarkPreview.vue。i-ph 图标 → lucide-react；BookmarkIcon 复用。
 * 受控 bookmark + 各类回调；笔记编辑内部状态。无埋点。
 */
export interface BookmarkPreviewProps {
  bookmark: Bookmark | null
  isTrashActive: boolean
  width?: number
  onOpen: (bookmark: Bookmark) => void
  onEdit: (bookmark: Bookmark) => void
  onRemove: (bookmark: Bookmark) => void
  onCopyUrl: (bookmark: Bookmark) => void
  onLocate: (bookmark: Bookmark) => void
  onToggleCollapse?: () => void
  onUpdateDesc?: (bookmark: Bookmark, desc: string) => void
}

export function BookmarkPreview({
  bookmark,
  width = 256,
  onOpen,
  onEdit,
  onRemove,
  onCopyUrl,
  onLocate,
  onToggleCollapse,
  onUpdateDesc
}: BookmarkPreviewProps) {
  const groups = useBookmarkStore((s) => s.groups)
  const [descEditing, setDescEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')

  const getLocationLabel = (bm: Bookmark): string => {
    if (!bm.locations || bm.locations.length === 0) return ''
    const loc = bm.locations[0]
    const group = groups.find((g) => g.id === loc.groupId)
    const sub = group?.children.find((c) => c.id === loc.subGroupId)
    return group && sub ? `${group.name} / ${sub.name}` : ''
  }

  const startEditDesc = () => {
    if (!bookmark) return
    setDescDraft(bookmark.desc || '')
    setDescEditing(true)
  }

  const commitDesc = () => {
    if (!bookmark) return
    setDescEditing(false)
    const trimmed = descDraft.trim()
    if (trimmed !== (bookmark.desc || '')) {
      onUpdateDesc?.(bookmark, trimmed)
    }
  }

  const onDescKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitDesc()
    }
    if (e.key === 'Escape') setDescEditing(false)
  }

  const locationLabel = bookmark ? getLocationLabel(bookmark) : ''

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col border-l border-border/50',
        bookmark ? 'bg-card/30' : 'bg-card/20'
      )}
      style={{ width: `${width}px` }}
    >
      {bookmark ? (
        <>
          {/* 头部：图标 + 标题 + URL */}
          <div
            className="shrink-0 px-4 pt-5 pb-4 flex flex-col items-center border-b border-border/30 relative"
            style={{ gap: '11px' }}
          >
            <button
              type="button"
              className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="收起详情"
              onClick={() => onToggleCollapse?.()}
            >
              <ChevronRight className="size-3.5" />
            </button>

            <button
              type="button"
              className="rounded-[14px] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              title="打开书签"
              onClick={() => onOpen(bookmark)}
            >
              <BookmarkIcon
                icon={bookmark.icon}
                fallbackText={bookmark.title}
                size="custom"
                customSizeClass="w-14 h-14 rounded-[14px]"
              />
            </button>

            <div className="text-center w-full px-1">
              <h3
                className="bookmark-preview__title text-[15px] font-semibold text-foreground leading-tight"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {bookmark.title}
              </h3>
              <a
                className="block text-[11.5px] text-primary font-mono truncate max-w-full mt-1 hover:underline cursor-pointer"
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  onOpen(bookmark)
                }}
              >
                {bookmark.url}
              </a>
            </div>
          </div>

          {/* 操作按钮行 */}
          <div className="shrink-0 px-3 border-b border-border/30" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
            <div className="flex items-center" style={{ gap: '7px' }}>
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg transition-colors hover:bg-primary/90 active:scale-[0.98]"
                style={{ height: '34px' }}
                onClick={() => onOpen(bookmark)}
              >
                <ExternalLink className="size-3.5" />
                打开
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted rounded-lg transition-colors active:scale-[0.98]"
                style={{ width: '34px', height: '34px' }}
                title="复制链接"
                onClick={() => onCopyUrl(bookmark)}
              >
                <Copy className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted rounded-lg transition-colors active:scale-[0.98]"
                style={{ width: '34px', height: '34px' }}
                title="编辑书签"
                onClick={() => onEdit(bookmark)}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center border border-border bg-card text-destructive hover:bg-destructive/10 rounded-lg transition-colors active:scale-[0.98]"
                style={{ width: '34px', height: '34px' }}
                title="删除书签"
                onClick={() => onRemove(bookmark)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {/* 详情内容 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-[18px]">
            {/* 笔记区 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10.5px] font-mono font-medium uppercase tracking-wider text-muted-foreground">
                  笔记
                </label>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline transition-colors"
                  onClick={() => (descEditing ? commitDesc() : startEditDesc())}
                >
                  {descEditing ? '完成' : '编辑'}
                </button>
              </div>
              {descEditing ? (
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  className="w-full text-[13px] text-foreground/80 leading-relaxed rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary/30 resize-none transition-colors"
                  style={{ minHeight: '96px' }}
                  placeholder="添加笔记…"
                  onBlur={commitDesc}
                  onKeyDown={onDescKeydown}
                  autoFocus
                />
              ) : (
                <p
                  className={cn(
                    'text-[13px] text-foreground/70 leading-relaxed cursor-text hover:bg-muted/30 rounded-lg px-2 py-1.5 -mx-2 transition-colors',
                    !bookmark.desc && 'text-muted-foreground/50 italic'
                  )}
                  onClick={startEditDesc}
                >
                  {bookmark.desc || '点击添加笔记…'}
                </p>
              )}
            </div>

            {/* 标签区 */}
            {bookmark.tags && bookmark.tags.length > 0 && (
              <div>
                <label className="text-[10.5px] font-mono font-medium uppercase tracking-wider text-muted-foreground block mb-1.5">
                  标签
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {bookmark.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-[9px] py-[3px] rounded-md bg-muted text-muted-foreground text-[12px]"
                    >
                      <Tag className="size-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 元数据/位置区 */}
            <div className="space-y-0">
              {locationLabel && (
                <div className="flex items-center justify-between py-[7px] border-b border-border/50">
                  <span className="text-[12px] text-muted-foreground">位置</span>
                  <span className="text-[12.5px] text-foreground/80 truncate max-w-[55%] text-right">
                    {locationLabel}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between py-[7px] border-b border-border/50">
                <span className="text-[12px] text-muted-foreground">链接</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline truncate max-w-[55%]"
                  onClick={() => onCopyUrl(bookmark)}
                >
                  <LinkIcon className="size-[11px] shrink-0" />
                  <span className="truncate">复制链接</span>
                </button>
              </div>
            </div>

            {locationLabel && (
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 h-8 rounded-lg border border-border bg-card text-muted-foreground text-[12px] hover:bg-muted hover:text-foreground transition-colors"
                onClick={() => onLocate(bookmark)}
              >
                <Folder className="size-3.5" />
                在分组中定位
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 grid place-items-center text-center px-6">
          <div>
            <PanelRight className="size-8 text-muted-foreground/40 block mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
              选择一个书签
              <br />
              查看详情
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}

export default BookmarkPreview
