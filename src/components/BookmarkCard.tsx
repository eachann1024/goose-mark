import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pin, Target } from 'lucide-react'
import type { Bookmark } from '@/types/bookmark'
import { BookmarkIcon } from '@/components/BookmarkIcon'
import { useUIManager } from '@/hooks/useUIManager'
import { cn } from '@/lib/utils'

/**
 * BookmarkCard（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 卡片：图标 + 标题/描述 + 截断检测后悬停浮出 tooltip（命令式 DOM
 * 创建，不走组件树）+ 蛇形描边彩蛋 + 定位按钮。逐字段移植：
 * - ref + onMounted/onActivated → useRef + useEffect（含 requestIdleCallback 延迟挂 RO）
 * - 命令式 fallbackToast（document.createElement）原样保留，受 hover 触发/清理
 * - i-ph-* 图标改 lucide-react；选中/蛇形/locate 样式迁移到 index.css
 * - 复制反馈改用 useUIManager.showToast（旧版 notify 仅 console）。无埋点。
 */
export interface BookmarkCardProps {
  bookmark: Bookmark
  selected?: boolean
  showHint?: boolean
  hintKey?: string
  readonly?: boolean
  index?: number
  gridColumns?: number
  showEdit?: boolean
  showDelete?: boolean
  showLocate?: boolean
  highlighted?: boolean
  selectionVariant?: 'default' | 'search'
  onEdit?: (bookmark: Bookmark, anchor?: HTMLElement) => void
  onRemove?: (bookmark: Bookmark) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onOpen?: (bookmark: Bookmark) => void
  onLocate?: (bookmark: Bookmark) => void
}

export function BookmarkCard({
  bookmark,
  selected,
  showHint,
  hintKey,
  index,
  gridColumns,
  showLocate,
  highlighted,
  selectionVariant = 'default',
  onContextMenu,
  onOpen,
  onLocate
}: BookmarkCardProps) {
  const showToast = useUIManager((s) => s.showToast)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const descRef = useRef<HTMLParagraphElement | null>(null)

  const isTitleTruncatedRef = useRef(false)
  const isDescTruncatedRef = useRef(false)
  const fallbackToastElRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const [renderedHighlight, setRenderedHighlight] = useState(highlighted)

  const isEmptyDesc = !bookmark.desc || bookmark.desc.trim().length === 0
  const canLocate = showLocate ?? false

  const clearFallbackToast = useCallback(() => {
    const el = fallbackToastElRef.current
    if (el) {
      el.style.opacity = '0'
      el.style.transform = 'translateY(4px)'
      fallbackToastElRef.current = null
      window.setTimeout(() => el.remove(), 150)
    }
  }, [])

  const showFallbackToast = useCallback(
    (title: string, desc: string, anchor?: HTMLElement) => {
      if (fallbackToastElRef.current) return

      const totalLen = (title?.length || 0) + (desc?.length || 0)
      const cols = gridColumns || 3
      const colIndex = index !== undefined ? index % cols : 0

      let mode: 'top' | 'right' | 'left' = 'top'
      if (totalLen >= 40) {
        mode = colIndex < Math.floor(cols / 2) ? 'right' : 'left'
      }

      const el = document.createElement('div')

      const getCssVar = (name: string, fallback: string) => {
        const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
        if (!val) return fallback
        if (/^\d+\.?\d*\s+\d+\.?\d*%\s+\d+\.?\d*%$/.test(val)) {
          return `hsl(${val})`
        }
        return val
      }

      const bg = getCssVar('--card', 'rgba(24,24,27,0.92)')
      const border = getCssVar('--border', 'rgba(255,255,255,0.08)')
      const fg = getCssVar('--foreground', '#e5e7eb')
      const primary = getCssVar('--primary', '#3b82f6')

      el.style.maxWidth = '420px'
      el.style.padding = '12px 16px'
      const radius = getCssVar('--radius-xl', '12px')
      el.style.borderRadius = radius
      el.style.background = bg
      el.style.color = fg
      el.style.fontSize = '13px'
      el.style.lineHeight = '1.5'
      el.style.boxShadow = '0 12px 36px rgba(0,0,0,0.32)'
      el.style.backdropFilter = 'blur(10px)'
      el.style.border = `1px solid ${border}`
      el.style.zIndex = '9999'
      el.style.pointerEvents = 'none'
      el.style.opacity = '0'
      if (mode === 'top') {
        el.style.transform = 'translateY(8px)'
      } else if (mode === 'right') {
        el.style.transform = 'translateX(-8px)'
      } else {
        el.style.transform = 'translateX(8px)'
      }
      el.style.transition = 'opacity 120ms ease, transform 120ms ease'
      el.style.position = 'fixed'

      if (title) {
        const titleDiv = document.createElement('div')
        titleDiv.style.fontWeight = '600'
        titleDiv.style.color = primary
        titleDiv.style.marginBottom = '4px'
        titleDiv.style.fontSize = '14px'
        titleDiv.textContent = title
        el.appendChild(titleDiv)
      }
      if (desc) {
        const descDiv = document.createElement('div')
        descDiv.style.opacity = '0.9'
        descDiv.style.whiteSpace = 'pre-wrap'
        descDiv.style.wordBreak = 'break-word'
        descDiv.textContent = desc
        el.appendChild(descDiv)
      }

      document.body.appendChild(el)

      const anchorRect = anchor?.getBoundingClientRect()
      const toastRect = el.getBoundingClientRect()
      const gap = 12

      let left: number
      let top: number

      if (anchorRect) {
        if (mode === 'top') {
          left = anchorRect.left + (anchorRect.width - toastRect.width) / 2
          top = anchorRect.top - toastRect.height - gap
        } else if (mode === 'right') {
          left = anchorRect.right + gap
          top = anchorRect.top + (anchorRect.height - toastRect.height) / 2
        } else {
          left = anchorRect.left - toastRect.width - gap
          top = anchorRect.top + (anchorRect.height - toastRect.height) / 2
        }
      } else {
        left = window.innerWidth - toastRect.width - 16
        top = window.innerHeight - toastRect.height - 16
      }

      const maxLeft = window.innerWidth - toastRect.width - 8
      const maxTop = window.innerHeight - toastRect.height - 8
      top = Math.max(8, Math.min(top, maxTop))
      left = Math.max(8, Math.min(left, maxLeft))

      el.style.top = `${top}px`
      el.style.left = `${left}px`
      requestAnimationFrame(() => {
        el.style.opacity = '1'
        el.style.transform = mode === 'top' ? 'translateY(0)' : 'translateX(0)'
      })
      fallbackToastElRef.current = el
    },
    [gridColumns, index]
  )

  const checkTruncate = useCallback(() => {
    if (titleRef.current) {
      isTitleTruncatedRef.current =
        titleRef.current.scrollWidth > titleRef.current.clientWidth + 1
    }

    const el = descRef.current
    if (!el) {
      isDescTruncatedRef.current = false
      return
    }
    const horizOverflow = el.scrollWidth - el.clientWidth > 1
    const vertOverflow = el.scrollHeight - el.clientHeight > 1
    const descLen = bookmark.desc?.length ?? 0
    const approxCharCap = Math.max(30, Math.floor(el.clientWidth / 7))
    const heuristicOverflow = descLen > approxCharCap
    isDescTruncatedRef.current = horizOverflow || vertOverflow || heuristicOverflow
  }, [bookmark.desc])

  // 挂载 + 内容变化时检测截断，并延迟挂 ResizeObserver（等价 onMounted/watch）
  useEffect(() => {
    checkTruncate()
    let idleId: number | undefined
    let timeoutId: number | undefined

    const setupResizeObserver = () => {
      const targets: HTMLElement[] = []
      if (descRef.current) targets.push(descRef.current)
      if (titleRef.current) targets.push(titleRef.current)
      if (targets.length === 0) return
      const observer = new ResizeObserver(() => checkTruncate())
      targets.forEach((t) => observer.observe(t))
      resizeObserverRef.current = observer
    }

    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(setupResizeObserver, { timeout: 200 })
    } else {
      timeoutId = window.setTimeout(setupResizeObserver, 100)
    }

    return () => {
      if (idleId !== undefined && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      clearFallbackToast()
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
    }
  }, [checkTruncate, clearFallbackToast, bookmark.title, bookmark.desc])

  // highlighted 关闭时延迟卸载 svg（模拟 Vue leave 过渡 500ms）
  useEffect(() => {
    if (highlighted) {
      setRenderedHighlight(true)
      return
    }
    const timer = setTimeout(() => setRenderedHighlight(false), 500)
    return () => clearTimeout(timer)
  }, [highlighted])

  const onCardEnter = () => {
    checkTruncate()
    const showTitle = isTitleTruncatedRef.current
    const showDesc = isDescTruncatedRef.current && !!bookmark.desc
    if (!showTitle && !showDesc) return

    const anchor = cardRef.current ?? undefined
    showFallbackToast(
      showTitle ? bookmark.title : '',
      showDesc ? bookmark.desc || '' : '',
      anchor
    )
  }

  const handleLocate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    onLocate?.(bookmark)
  }

  const copyUrl = useCallback(async () => {
    try {
      if (!navigator.clipboard) {
        showToast({ title: '当前环境不支持剪贴板复制', variant: 'warning' })
        return
      }
      await navigator.clipboard.writeText(bookmark.url)
      showToast({ title: '已复制链接', variant: 'success' })
    } catch {
      showToast({ title: '复制失败，请检查权限后重试', variant: 'error' })
    }
  }, [bookmark.url, showToast])
  // copyUrl 保留与旧版等价的复制能力，供集成阶段按需绑定（如双击/快捷键）
  void copyUrl

  const selectedCardClass = useMemo(() => {
    if (!selected) return ''
    return selectionVariant === 'search'
      ? 'bookmark-card--selected-search'
      : 'bookmark-card--selected'
  }, [selected, selectionVariant])

  return (
    <div
      ref={cardRef}
      className={cn(
        'card-base bookmark-card relative group hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-center select-none',
        selected ? selectedCardClass : 'bookmark-card--hoverable'
      )}
      onClick={() => onOpen?.(bookmark)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e)
      }}
      onMouseEnter={onCardEnter}
      onMouseLeave={clearFallbackToast}
    >
      {/* 蛇形描边彩蛋 */}
      {renderedHighlight && (
        <div
          className={cn(
            'absolute inset-0 pointer-events-none z-0 transition-opacity',
            highlighted ? 'opacity-100 duration-300' : 'opacity-0 duration-500'
          )}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <rect
              width="100%"
              height="100%"
              rx="var(--radius-xl)"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              strokeDasharray={250}
              strokeDashoffset={0}
              className="animate-snake-border"
            />
          </svg>
        </div>
      )}

      {/* 序号提示气泡 */}
      {showHint && hintKey && (
        <div className="absolute top-1.5 right-1.5 z-20 h-6 min-w-[24px] px-2 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow animate-in zoom-in-75 duration-200">
          {hintKey}
        </div>
      )}

      <div className="px-4 py-3 flex gap-3 items-center">
        <div className="shrink-0">
          <BookmarkIcon icon={bookmark.icon} fallbackText={bookmark.title} size="md" />
        </div>

        <div
          className={cn(
            'flex-1 min-w-0 flex flex-col justify-center',
            isEmptyDesc ? 'items-start gap-0' : 'gap-0.5'
          )}
        >
          {isEmptyDesc ? (
            <h3
              ref={titleRef}
              className="font-semibold text-base leading-snug truncate text-foreground w-full max-w-full"
            >
              {bookmark.title}
            </h3>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3
                  ref={titleRef}
                  className="font-medium text-sm truncate pr-2 text-foreground break-all cursor-pointer"
                >
                  {bookmark.title}
                </h3>
                {bookmark.pinned && (
                  <Pin className="size-[10px] text-primary shrink-0" />
                )}
              </div>
              <p
                ref={descRef}
                className="text-[10px] text-muted-foreground truncate min-h-[16px] leading-[1.2] cursor-pointer"
              >
                {bookmark.desc || ' '}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 定位按钮（编辑/删除改走右键菜单） */}
      {canLocate && (
        <div
          className="absolute right-1 bottom-1 flex gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity bg-background/80 backdrop-blur rounded-lg p-0.5 border border-border shadow-sm z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="定位到原分组"
            className="bookmark-card__locate-btn h-7 w-7 rounded-lg inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-primary"
            onClick={handleLocate}
          >
            <Target className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}

export default BookmarkCard
