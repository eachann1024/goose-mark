import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { cn } from '@/lib/utils'

/**
 * CategoryMultiSelect（React 版）
 * 样式由 .goose-home .form-category-select 下的 home.css 接管（勿用 bg-primary/bg-popover 等全局 token，避免深色露白）。
 */
export interface CategoryMultiSelectProps {
  value: BookmarkLocation[]
  onChange: (value: BookmarkLocation[]) => void
  readonly?: boolean
  inline?: boolean
  onClose?: () => void
}

export function CategoryMultiSelect({
  value,
  onChange,
  readonly,
  inline,
  onClose
}: CategoryMultiSelectProps) {
  const groups = useBookmarkStore((s) => s.groups)

  const displayGroups = useMemo(
    () => groups.filter((g) => g.id !== TRASH_GROUP_ID),
    [groups]
  )

  const isSelected = (groupId: string, subGroupId: string) =>
    value.some((loc) => loc.groupId === groupId && loc.subGroupId === subGroupId)

  const toggleLocation = (groupId: string, subGroupId: string) => {
    if (readonly) return
    onChange(
      isSelected(groupId, subGroupId)
        ? value.filter((loc) => !(loc.groupId === groupId && loc.subGroupId === subGroupId))
        : [...value, { groupId, subGroupId }]
    )
  }

  const removeLocation = (loc: BookmarkLocation) => {
    if (readonly) return
    onChange(value.filter((l) => !(l.groupId === loc.groupId && l.subGroupId === loc.subGroupId)))
  }

  const getLocationLabel = (loc: BookmarkLocation) => {
    const group = groups.find((g) => g.id === loc.groupId)
    const sub = group?.children.find((c) => c.id === loc.subGroupId)
    return sub?.name ?? ''
  }

  return (
    <div
      className={cn('cat-ms-root', inline && 'cat-ms-root--inline')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={cn('cat-ms-scroll', !inline && 'cat-ms-scroll--modal')}>
        <div className="cat-ms-sections">
          {displayGroups.map((group) => (
            <div key={group.id} className="cat-ms-section">
              <div className="cat-ms-heading">
                <span className="cat-ms-dot" />
                <span className="cat-ms-heading-label">{group.name}</span>
              </div>

              <div className="cat-ms-chips">
                {group.children.map((sub) => {
                  const selected = isSelected(group.id, sub.id)
                  return (
                    <button
                      key={`${group.id}-${sub.id}`}
                      type="button"
                      className={cn('cat-ms-chip', selected && 'cat-ms-chip--on')}
                      disabled={readonly}
                      onClick={() => toggleLocation(group.id, sub.id)}
                    >
                      <span className={cn('cat-ms-chip-check', selected && 'cat-ms-chip-check--on')}>
                        {selected && <Check className="lucide" strokeWidth={3} />}
                      </span>
                      <span className="cat-ms-chip-label">{sub.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {displayGroups.length === 0 && <div className="cat-ms-empty">暂无分组</div>}
        </div>
      </div>

      {value.length > 0 && (
        <div className="cat-ms-picked">
          <div className="cat-ms-picked-chips">
            {value.map((loc) => (
              <div key={`${loc.groupId}-${loc.subGroupId}`} className="cat-ms-picked-chip">
                <span className="cat-ms-picked-label">{getLocationLabel(loc)}</span>
                {!readonly && (
                  <button
                    type="button"
                    className="cat-ms-picked-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeLocation(loc)
                    }}
                  >
                    <X className="lucide" strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!inline && onClose && (
        <div className="cat-ms-modal-foot">
          <button type="button" className="cat-ms-modal-btn cat-ms-modal-btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={value.length === 0}
            className="cat-ms-modal-btn cat-ms-modal-btn--primary"
            onClick={onClose}
          >
            确定
          </button>
        </div>
      )}
    </div>
  )
}

export default CategoryMultiSelect