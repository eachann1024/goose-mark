/**
 * BookmarkSkeleton（React 版）
 * --------------------------------------------------------------------------
 * 书签列表/网格加载占位骨架。等价旧版 Vue BookmarkSkeleton.vue。
 * 纯展示组件，无埋点。
 */
export interface BookmarkSkeletonProps {
  /** 占位条目数量（1~12，默认 6） */
  count?: number
  /** 是否显示分组标题骨架 */
  showHeaders?: boolean
}

export function BookmarkSkeleton({ count = 6, showHeaders = false }: BookmarkSkeletonProps) {
  const itemCount = Math.max(1, Math.min(count || 6, 12))

  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {/* Section header skeleton */}
      {showHeaders && (
        <div className="flex items-center gap-2 px-1 pt-2">
          <div className="h-5 w-24 rounded bg-muted/60" />
          <div className="flex-1 h-px bg-muted/40" />
        </div>
      )}

      {/* Bookmark item skeletons */}
      {Array.from({ length: itemCount }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          {/* Icon skeleton */}
          <div className="shrink-0 w-8 h-8 rounded-lg bg-muted/60" />
          {/* Text skeletons */}
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <div className="h-3.5 w-3/5 rounded bg-muted/60" />
            <div className="h-2.5 w-2/5 rounded bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default BookmarkSkeleton
