import type * as React from 'react'
import type { Bookmark } from '@/types/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'
import { getTemplateLabel } from '@/lib/utils'
import { Image } from '@/components/ui/image'

export function HomeTemplatePage({
  activeTemplateBookmark,
  templateInputRef,
  templateQuery,
  setTemplateQuery
}: {
  activeTemplateBookmark: Bookmark | null
  templateInputRef: React.RefObject<HTMLInputElement | null>
  templateQuery: string
  setTemplateQuery: React.Dispatch<React.SetStateAction<string>>
}) {
  return (
    activeTemplateBookmark && (
          <div className="tpl-page">
            <div className="tpl-page-stage">
              <div
                className="tpl-page-logo"
                style={
                  iconToDisplayUrl(activeTemplateBookmark.icon ?? undefined)
                    ? undefined
                    : { background: activeTemplateBookmark.icon?.bgColor || 'var(--accent)' }
                }
              >
                {iconToDisplayUrl(activeTemplateBookmark.icon ?? undefined) ? (
                  <Image bare src={iconToDisplayUrl(activeTemplateBookmark.icon ?? undefined)!} alt="" />
                ) : (
                  <span>
                    {(activeTemplateBookmark.title || activeTemplateBookmark.url || '?')
                      .trim()
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                )}
              </div>
              <div className="tpl-page-title">
                {activeTemplateBookmark.title?.trim() || '搜索'}
              </div>
              <div className="tpl-page-field">
                <input
                  ref={templateInputRef}
                  className="tpl-page-input"
                  type="text"
                  autoFocus
                  value={templateQuery}
                  placeholder={`输入${getTemplateLabel(activeTemplateBookmark.url) || '关键词'}后回车打开…`}
                  onChange={(e) => setTemplateQuery(e.target.value)}
                />
              </div>
              <div className="tpl-page-hint">
                <kbd>↵</kbd>
                <span>打开</span>
                <span className="tpl-page-hint-dot" aria-hidden="true" />
                <kbd>Esc</kbd>
                <span>返回</span>
              </div>
            </div>
          </div>
        )
  )
}
