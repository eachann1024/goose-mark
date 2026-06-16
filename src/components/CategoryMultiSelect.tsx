import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { cn } from '@/lib/utils'

/**
 * CategoryMultiSelect（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue v-model:modelValue(BookmarkLocation[]) + emit(close) → React 受控
 * value + onChange。直接以 value 为单一数据源（去掉旧版本地副本 watch 同步），
 * 每次 toggle/remove 都向上 onChange 新数组。i-ph-* 改 lucide-react；chip 样式
 * 已迁移到 index.css。支持 inline（内嵌）与弹窗两种布局。
 */
export interface CategoryMultiSelectProps {
  value: BookmarkLocation[]
  onChange: (value: BookmarkLocation[]) => void
  readonly?: boolean
  inline?: boolean
  /** 弹窗模式下底部确定/取消按钮触发 */
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
    const idx = value.findIndex(
      (loc) => loc.groupId === groupId && loc.subGroupId === subGroupId
    )
    if (idx >= 0) {
      onChange(value.filter((_, i) => i !== idx))
    } else {
      onChange([...value, { groupId, subGroupId }])
    }
  }

  const removeLocation = (loc: BookmarkLocation) => {
    if (readonly) return
    onChange(
      value.filter((l) => !(l.groupId === loc.groupId && l.subGroupId === loc.subGroupId))
    )
  }

  const getLocationLabel = (loc: BookmarkLocation) => {
    const group = groups.find((g) => g.id === loc.groupId)
    const sub = group?.children.find((c) => c.id === loc.subGroupId)
    return sub?.name ?? ''
  }

  return (
    <div
      className={cn(
        'overflow-hidden',
        inline
          ? 'w-full rounded-2xl bg-background/60 p-3'
          : 'w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border-0 bg-popover shadow-2xl p-3'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={cn(!inline && 'overflow-y-auto max-h-[300px]')}>
        <div className="flex flex-col gap-4">
          {displayGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  {group.name}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {group.children.map((sub) => {
                  const selected = isSelected(group.id, sub.id)
                  return (
                    <button
                      key={`${group.id}-${sub.id}`}
                      type="button"
                      className={cn(
                        'subgroup-chip flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                        selected ? 'subgroup-chip--selected' : 'subgroup-chip--idle'
                      )}
                      onClick={() => toggleLocation(group.id, sub.id)}
                    >
                      <span
                        className={cn(
                          'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                          selected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30'
                        )}
                      >
                        {selected && <Check className="size-[10px]" />}
                      </span>
                      <span className="truncate">{sub.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {displayGroups.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              暂无分组
            </div>
          )}
        </div>
      </div>

      {value.length > 0 && (
        <div className="px-1 pt-3 mt-2 border-t border-border/30">
          <div className="flex items-center gap-1.5 flex-wrap">
            {value.map((loc) => (
              <div
                key={`${loc.groupId}-${loc.subGroupId}`}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium shrink-0"
              >
                <span className="truncate">{getLocationLabel(loc)}</span>
                <button
                  type="button"
                  className="h-4 w-4 inline-flex items-center justify-center text-primary/60 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeLocation(loc)
                  }}
                >
                  <X className="size-[10px]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!inline && (
        <div className="border-t border-border/40 px-1 pt-2.5 mt-2">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-8 w-16 inline-flex items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={value.length === 0}
              className="h-8 w-16 inline-flex items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onClose}
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CategoryMultiSelect
