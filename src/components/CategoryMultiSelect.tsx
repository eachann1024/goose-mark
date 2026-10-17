import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { cn } from '@/lib/utils'
import { deferInlineRenameCommit, handleInlineRenameEnter } from '@/lib/inlineEditKeys'

/**
 * 书签放到哪里。默认单选：点另一个子分组就换过去。
 * 已有多个位置，或打开「多选」后，才累加。
 * 样式由 .goose-home .form-category-select 下的 home.css 接管。
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
  const activeGroupId = useBookmarkStore((s) => s.activeGroupId)
  const addSubGroup = useBookmarkStore((s) => s.addSubGroup)
  const [adding, setAdding] = useState(false)
  const [addVal, setAddVal] = useState('')
  const [multi, setMulti] = useState(() => value.length > 1)
  const addInputRef = useRef<HTMLInputElement>(null)

  const displayGroups = useMemo(
    () => groups.filter((g) => g.id !== TRASH_GROUP_ID),
    [groups]
  )
  const [groupId, setGroupId] = useState(
    () => value[0]?.groupId || activeGroupId || displayGroups[0]?.id || ''
  )

  useEffect(() => {
    if (value.length > 1) setMulti(true)
  }, [value.length])

  useEffect(() => {
    if (adding) addInputRef.current?.focus()
  }, [adding])

  const currentGroup =
    displayGroups.find((g) => g.id === groupId) ?? displayGroups[0] ?? null

  const isSelected = (gid: string, subGroupId: string) =>
    value.some((loc) => loc.groupId === gid && loc.subGroupId === subGroupId)

  const choose = (gid: string, subGroupId: string) => {
    if (readonly) return
    const loc = { groupId: gid, subGroupId }
    if (!multi) {
      onChange(isSelected(gid, subGroupId) && value.length === 1 ? [] : [loc])
      return
    }
    onChange(
      isSelected(gid, subGroupId)
        ? value.filter((item) => !(item.groupId === gid && item.subGroupId === subGroupId))
        : [...value, loc]
    )
  }

  const setMultiMode = (next: boolean) => {
    setMulti(next)
    if (!next && value.length > 1) onChange(value.slice(0, 1))
  }

  const cancelAdd = () => {
    setAdding(false)
    setAddVal('')
  }

  const commitAdd = () => {
    const name = addVal.trim()
    const gid = currentGroup?.id
    if (!name || !gid) {
      cancelAdd()
      return
    }
    const sub = addSubGroup(name, gid)
    if (sub) onChange(multi ? [...value, { groupId: gid, subGroupId: sub.id }] : [{ groupId: gid, subGroupId: sub.id }])
    cancelAdd()
  }

  return (
    <div className={cn('cat-ms-root', inline && 'cat-ms-root--inline')} onClick={(e) => e.stopPropagation()}>
      {displayGroups.length === 0 ? (
        <div className="cat-ms-empty">暂无分组</div>
      ) : (
        <>
          <div className="cat-ms-head">
            <div className="cat-ms-tabs" role="tablist">
              {displayGroups.map((group) => {
                const count = value.filter((loc) => loc.groupId === group.id).length
                const on = group.id === currentGroup?.id
                return (
                  <button
                    key={group.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={cn('cat-ms-tab', on && 'cat-ms-tab--on')}
                    onClick={() => {
                      setGroupId(group.id)
                      cancelAdd()
                    }}
                  >
                    <span className="cat-ms-tab-label">{group.name}</span>
                    {count > 0 && <b className="cat-ms-tab-count">{count}</b>}
                  </button>
                )
              })}
            </div>
            {!readonly && (
              <button
                type="button"
                role="switch"
                aria-checked={multi}
                className={cn('cat-ms-multi', multi && 'cat-ms-multi--on')}
                onClick={() => setMultiMode(!multi)}
              >
                <span>多选</span>
                <span className="cat-ms-sw" aria-hidden />
              </button>
            )}
          </div>

          <div className="cat-ms-chips">
            {currentGroup?.children.map((sub) => {
              const selected = isSelected(currentGroup.id, sub.id)
              return (
                <button
                  key={sub.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn('cat-ms-chip', selected && 'cat-ms-chip--on')}
                  disabled={readonly}
                  onClick={() => choose(currentGroup.id, sub.id)}
                >
                  {selected && <Check className="lucide cat-ms-chip-ck" strokeWidth={2.6} />}
                  <span className="cat-ms-chip-label">{sub.name}</span>
                </button>
              )
            })}
            {!readonly && adding && (
              <input
                ref={addInputRef}
                className="cat-ms-chip-input"
                placeholder="文件夹名"
                value={addVal}
                onChange={(e) => setAddVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    cancelAdd()
                    return
                  }
                  handleInlineRenameEnter(e, commitAdd)
                }}
                onBlur={() => deferInlineRenameCommit(commitAdd)}
              />
            )}
            {!readonly && !adding && (
              <button type="button" className="cat-ms-chip cat-ms-chip--add" onClick={() => setAdding(true)}>
                <Plus className="lucide" strokeWidth={2} />
                <span className="cat-ms-chip-label">新建</span>
              </button>
            )}
          </div>
        </>
      )}

      {!inline && onClose && (
        <div className="cat-ms-footer">
          <button type="button" className="cat-ms-done" onClick={onClose}>
            完成
          </button>
        </div>
      )}
    </div>
  )
}

export default CategoryMultiSelect
