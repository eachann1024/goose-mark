import { useEffect, useRef } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { BookmarkIcon } from '@/components/BookmarkIcon'

/**
 * TemplateSearch（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 模板搜索全屏视图：隐藏输入框承接键入，实时预览关键词，Enter 提交。
 * v-model:query → 受控 query + onQueryChange；emit('submit') → onSubmit。
 * 挂载后自动聚焦隐藏 input（等价 onMounted + nextTick focus）。
 */
export interface TemplateSearchProps {
  bookmark: Bookmark
  query: string
  onQueryChange: (value: string) => void
  onSubmit: () => void
}

export function TemplateSearch({ bookmark, query, onQueryChange, onSubmit }: TemplateSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="h-screen flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in zoom-in-95 duration-200">
      <input
        ref={inputRef}
        value={query}
        className="sr-only"
        data-template-query-input
        autoFocus
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit()
          }
        }}
      />

      <BookmarkIcon
        icon={bookmark.icon}
        fallbackText={bookmark.title}
        size="xl"
        className="shadow-2xl bg-card"
      />

      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">{bookmark.title}</h2>
      </div>

      <div className="w-full max-w-lg">
        <div className="relative min-h-[3rem] flex items-center justify-center">
          {query ? (
            <div className="text-2xl font-medium text-primary break-all">
              {query}
              <span className="animate-pulse inline-block w-[2px] h-6 bg-primary ml-1 align-middle" />
            </div>
          ) : (
            <div className="text-2xl text-muted-foreground/50 italic">输入关键词...</div>
          )}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          按{' '}
          <kbd className="px-2 py-1 bg-muted rounded border border-border text-xs font-sans mx-1">
            Enter
          </kbd>{' '}
          打开链接
        </p>
      </div>
    </div>
  )
}

export default TemplateSearch
