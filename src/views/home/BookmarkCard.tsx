import type * as React from 'react'
import { useEffect, useState } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { OverflowHoverTooltip } from '@/components/ui/overflow-tooltip'
import { Ico } from './icon'
import { Image } from '@/components/ui/image'
import { HighlightText } from './highlight'
import { type HomeItem } from './viewModel'

/* ============================== 子组件 ============================== */

function hostLabel(url: string): string {
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`)
    return parsed.hostname
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

export function Fav({ item, cls = 'fav' }: { item: HomeItem; cls?: string }) {
  // 真实图标加载失败（如 favicon 服务 404）时优雅回退到文字首字母
  const [imgError, setImgError] = useState(false)
  // iconUrl 变化时才重置错误态；切分组 keep-alive 时同一 Fav 实例保留已加载状态
  useEffect(() => {
    setImgError(false)
  }, [item.iconUrl])
  const showImg = !!item.iconUrl && !imgError
  // 无图标 / 图标加载失败 → 文字占位：底色 + 文字色全部由 item.favColor/favFg 实色 hex 内联，
  // 不走 CSS 变量派生（Chromium 108 下 color-mix/oklch/hsl 变量语法会失效成透明）。
  // 用户自设 icon.bgColor 时 favColor 即该色；否则为按一级域名哈希分配的算法色，
  // 并在下方 useEffect 里懒持久化到 icon.bgColor，之后不受调色板调整影响。
  const placeholderStyle: React.CSSProperties = { background: item.favColor, color: item.favFg }

  useEffect(() => {
    if (showImg || item.color) return
    const { bookmarks, updateBookmark } = useBookmarkStore.getState()
    const b = bookmarks.find((x) => x.id === item.id)
    if (!b || b.icon?.bgColor) return
    updateBookmark(item.id, { icon: b.icon ? { ...b.icon, bgColor: item.favColor } : { type: 'text', value: item.fav, bgColor: item.favColor } })
  }, [showImg, item.id, item.color, item.favColor, item.fav])

  return (
    <div className={showImg ? cls : `${cls} is-placeholder`} style={showImg ? undefined : placeholderStyle}>
      {showImg ? (
        <Image bare src={item.iconUrl} alt="" onError={() => setImgError(true)} onContextMenu={(e) => e.preventDefault()} />
      ) : (
        item.fav
      )}
    </div>
  )
}



export function BookmarkCard({
  item,
  selected,
  trailing,
  style,
  onClick,
  onDoubleClick,
  groupId,
  subId,
  anchorRef,
  disabled,
  dndProps,
  query,
  showHost,
  onMore,
}: {
  item: HomeItem
  selected?: boolean
  trailing?: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  onDoubleClick?: () => void
  groupId?: string
  subId?: string
  anchorRef?: React.Ref<HTMLDivElement>
  disabled?: boolean
  dndProps?: Record<string, unknown>
  query?: string
  showHost?: boolean
  onMore?: (e: React.MouseEvent) => void
}) {
  const showDescription = useSettingsStore((s) => s.listShowDescription)
  const fullDescription = useSettingsStore((s) => s.listFullDescription)
  return (
    <OverflowHoverTooltip
      className={`card${selected ? ' sel' : ''}`}
      style={style}
      title={item.ttl}
      description={showDescription && item.dsc ? item.dsc : undefined}
      data-item-id={item.id}
      data-group-id={groupId}
      data-sub-id={subId}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      anchorRef={anchorRef}
      disabled={disabled}
      {...(dndProps || {})}
    >
      <Fav item={item} />
      <div className="meta">
        <div className="ttl"><HighlightText text={item.ttl} query={query} /></div>
        {showDescription && item.dsc && <div className={`dsc${fullDescription ? ' full' : ''}`}><HighlightText text={item.dsc} query={query} /></div>}
        {showDescription && !item.dsc && item.regDomain && <div className="url">{item.regDomain}</div>}
        {showHost && <div className="dom">{hostLabel(item.url)}</div>}
        {item.tags.length > 0 && (
          <div className="tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      {item.pin && <Ico name="pin" className="pin" />}
      {onMore && (
        <button
          type="button"
          data-more
          className="more"
          aria-label="更多"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMore(e) }}
        >
          <Ico name="more-horizontal" />
        </button>
      )}
      {trailing}
    </OverflowHoverTooltip>
  )
}



/** 宫格图标尺寸映射 */
export const GRID_ICON_SIZE_PX: Record<string, string> = {
  small: '38px',
  medium: '42px',
  large: '48px'
}
