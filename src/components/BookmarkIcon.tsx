import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { IconSource } from '@/types/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'
import { cn } from '@/lib/utils'

/**
 * BookmarkIcon（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue computed + watch + Image 组件 → React useMemo + useState。
 * 直接使用原生 <img>（带 onError 回退到文字），不依赖 UI Image 组件，
 * 保持与旧版相同的尺寸 / 背景 / 深色补白 / 文字回退行为。
 */
export type BookmarkIconSize = 'sm' | 'md' | 'lg' | 'xl' | 'custom'

export interface BookmarkIconProps {
  icon?: IconSource | null
  fallbackText?: string
  size?: BookmarkIconSize
  customSizeClass?: string
  loading?: boolean
  border?: boolean
  className?: string
}

const SIZE_CLASSES: Record<BookmarkIconSize, string> = {
  sm: 'w-6 h-6 rounded-md',
  md: 'w-10 h-10 rounded-lg',
  lg: 'w-12 h-12 rounded-lg',
  xl: 'w-24 h-24 rounded-2xl',
  custom: ''
}

export function BookmarkIcon({
  icon,
  fallbackText,
  size = 'md',
  customSizeClass,
  loading,
  border,
  className
}: BookmarkIconProps) {
  const iconUrl = useMemo(() => iconToDisplayUrl(icon ?? undefined), [icon])
  const [hasImageError, setHasImageError] = useState(false)

  // iconUrl 变化时重置错误态（等价旧版 watch(iconUrl)）
  useEffect(() => {
    setHasImageError(false)
  }, [iconUrl])

  const currentSizeClass = customSizeClass || SIZE_CLASSES[size]

  const containerStyle: CSSProperties = icon?.bgColor
    ? { backgroundColor: icon.bgColor }
    : { backgroundColor: 'transparent' }

  // 针对透明背景的图片图标，在深色模式下添加白色背景以便看清黑色 Logo
  const isDarkBackground = !icon?.bgColor && !!icon?.type && icon.type !== 'text'

  const letters = useMemo(() => {
    if (icon?.type === 'text') return icon.value.slice(0, 4)
    const base = (fallbackText || '').trim()
    return (base || '•').slice(0, 4).toUpperCase()
  }, [icon, fallbackText])

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden transition-colors',
        currentSizeClass,
        border !== false && 'border border-border',
        isDarkBackground && 'dark:bg-white',
        className
      )}
      style={containerStyle}
    >
      {loading ? (
        <div className="w-1/2 h-1/2 border-2 border-primary/60 border-t-transparent rounded-full animate-spin" />
      ) : iconUrl && !hasImageError ? (
        <img
          src={iconUrl}
          alt=""
          className="w-4/5 h-4/5 object-contain"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span
          className={cn(
            'font-bold text-center px-1',
            size === 'xl' ? 'text-4xl' : 'text-[10px]',
            icon?.type === 'text' && icon.bgColor ? 'text-white' : 'text-foreground'
          )}
        >
          {letters}
        </span>
      )}
    </div>
  )
}

export default BookmarkIcon
