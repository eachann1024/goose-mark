import { createPortal } from 'react-dom'
import { BellRing, X } from 'lucide-react'
import type { FeatureNoticeItem } from '@/hooks/useFeatureNoticeCenter'

/**
 * FeatureNoticeCenter（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue Teleport + Transition(feature-notice) → React createPortal + 条件渲染
 * + .feature-notice 入场动画（已迁移到 index.css）。i-ph-* 图标改 lucide-react。
 * notice 为 null 时不渲染（受 useFeatureNoticeCenter 总开关控制，恒为 null）。
 */
export interface FeatureNoticeCenterProps {
  notice: FeatureNoticeItem | null
  onView: () => void
  onIgnore: () => void
}

export function FeatureNoticeCenter({ notice, onView, onIgnore }: FeatureNoticeCenterProps) {
  if (!notice) return null

  return createPortal(
    <div className="feature-notice fixed right-4 top-4 z-[21000] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-4 shadow-xl">
      <button
        type="button"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        aria-label="关闭提示"
        onClick={onIgnore}
      >
        <X className="size-[14px]" />
      </button>

      <div className="pr-7">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BellRing className="size-4 text-primary" />
          <span>{notice.title}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{notice.description}</p>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className="h-8 px-3 text-sm inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
          onClick={onIgnore}
        >
          {notice.secondaryLabel}
        </button>
        <button
          type="button"
          className="h-8 px-3 text-sm inline-flex items-center justify-center rounded-md border border-input bg-muted text-foreground shadow-sm hover:bg-muted/80 transition-colors"
          onClick={onView}
        >
          {notice.primaryLabel}
        </button>
      </div>
    </div>,
    document.body
  )
}

export default FeatureNoticeCenter
