import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Ico } from './icon'

export interface MoveGroup {
  id: string
  name: string
  children: { id: string; name: string; count: number }[]
}

interface Draft {
  groupId: string
  subGroupId: string
}

/**
 * 方案一：点「存到」后弹出的分组选择器。
 * 左列分组、右列子分组；当前所在打勾，AI 选定的子分组带星标。
 */
export function AISaveMovePicker({
  open,
  groups,
  currentGroupId,
  currentSubId,
  aiGroupId,
  aiSubId,
  anchorRef,
  stageRef,
  onClose,
  onConfirm,
  onCreateSub
}: {
  open: boolean
  groups: MoveGroup[]
  currentGroupId: string
  currentSubId: string
  aiGroupId: string
  aiSubId: string
  anchorRef: RefObject<HTMLButtonElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onConfirm: (groupId: string, subGroupId: string) => void
  onCreateSub: (groupId: string, name: string) => { id: string } | null
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef({ groupId: currentGroupId, subGroupId: currentSubId })
  currentRef.current = { groupId: currentGroupId, subGroupId: currentSubId }
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft>({ groupId: currentGroupId, subGroupId: currentSubId })
  const [composing, setComposing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, origin: '20% 0' })

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDraft(currentRef.current)
    setComposing(false)
    setDraftName('')
    const timer = window.setTimeout(() => searchRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  const q = query.trim().toLowerCase()
  const hits: Draft[] = []
  if (q) {
    for (const group of groups) {
      for (const sub of group.children) {
        if (`${group.name}${sub.name}`.toLowerCase().includes(q)) hits.push({ groupId: group.id, subGroupId: sub.id })
      }
    }
  }
  const draftGroup = groups.find((g) => g.id === draft.groupId) ?? groups[0]
  const draftSub = draftGroup?.children.find((s) => s.id === draft.subGroupId)
  const same = !!draftSub && draft.groupId === currentGroupId && draft.subGroupId === currentSubId
  const canMove = !!draftSub && !same

  useLayoutEffect(() => {
    if (!open) return
    const path = anchorRef.current
    const stage = stageRef.current
    const pop = popRef.current
    if (!path || !stage || !pop) return
    const r = path.getBoundingClientRect()
    const sr = stage.getBoundingClientRect()
    const page = stage.closest('.ais-page')?.getBoundingClientRect()
    const bounds = page ?? { top: 0, bottom: window.innerHeight }
    const h = pop.offsetHeight || 300
    const width = pop.offsetWidth
    const left = Math.max(0, Math.min(r.left - sr.left - 6, Math.max(0, sr.width - width)))
    const fitsDown = r.bottom + 8 + h <= bounds.bottom - 12
    const fitsUp = r.top - 8 - h >= bounds.top + 12
    const up = !fitsDown && (fitsUp || r.top - bounds.top > bounds.bottom - r.bottom)
    const minTop = bounds.top - sr.top + 12
    const maxTop = bounds.bottom - sr.top - 12 - h
    let top = up ? r.top - sr.top - 8 - h : r.bottom - sr.top + 8
    if (maxTop >= minTop) top = Math.min(Math.max(top, minTop), maxTop)
    else top = minTop
    setPos({
      left,
      top,
      origin: up ? '20% 100%' : '20% 0'
    })
  }, [open, query, composing, draft.groupId, draft.subGroupId, groups, anchorRef, stageRef])

  useEffect(() => {
    if (!open) return
    popRef.current?.querySelector('.ais-row.is-sel')?.scrollIntoView({ block: 'nearest' })
    popRef.current?.querySelector('.ais-pk-g .ais-row.is-on')?.scrollIntoView({ block: 'nearest' })
  }, [open, draft, query, groups])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (popRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    const visibleSubs = (): Draft[] => {
      if (q) return hits
      const group = groups.find((g) => g.id === draft.groupId)
      return (group?.children ?? []).map((s) => ({ groupId: group!.id, subGroupId: s.id }))
    }
    const selectGroup = (groupId: string, preferCurrent: boolean) => {
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      const subId = preferCurrent && group.children.some((s) => s.id === currentSubId)
        ? currentSubId
        : group.children[0]?.id ?? ''
      setQuery('')
      setComposing(false)
      setDraft({ groupId, subGroupId: subId })
    }
    const onKey = (e: KeyboardEvent) => {
      const inNew = (e.target instanceof Element) && !!e.target.closest('.ais-new-in')
      if (e.key === 'Escape') {
        if (inNew) return
        e.preventDefault()
        e.stopPropagation()
        onClose()
        anchorRef.current?.focus()
        return
      }
      if (inNew) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const rows = visibleSubs()
        if (!rows.length) return
        let i = rows.findIndex((r) => r.groupId === draft.groupId && r.subGroupId === draft.subGroupId)
        if (i < 0) i = 0
        else i = (i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
        setDraft(rows[i])
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (document.activeElement === searchRef.current && query.trim()) return
        e.preventDefault()
        e.stopPropagation()
        if (!groups.length) return
        const i = Math.max(0, groups.findIndex((g) => g.id === draft.groupId))
        const next = groups[(i + (e.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length]
        selectGroup(next.id, false)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (draftSub) onConfirm(draft.groupId, draft.subGroupId)
      }
    }
    document.addEventListener('click', onPointer)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('click', onPointer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, q, hits, groups, draft, draftSub, currentSubId, query, onClose, onConfirm, anchorRef])

  const pickSub = (next: Draft) => {
    if (draft.groupId === next.groupId && draft.subGroupId === next.subGroupId) onConfirm(next.groupId, next.subGroupId)
    else setDraft(next)
  }

  const createNamed = (name: string) => {
    const groupId = draftGroup?.id
    if (!groupId) return
    const created = onCreateSub(groupId, name)
    if (!created) return
    setQuery('')
    setComposing(false)
    setDraftName('')
    setDraft({ groupId, subGroupId: created.id })
  }

  const renderSub = (group: MoveGroup, sub: MoveGroup['children'][number], showGroup: boolean) => {
    const sel = draft.groupId === group.id && draft.subGroupId === sub.id
    const cur = group.id === currentGroupId && sub.id === currentSubId
    const ai = group.id === aiGroupId && sub.id === aiSubId
    return (
      <button
        key={`${group.id}:${sub.id}`}
        type="button"
        className={`ais-row${sel ? ' is-sel' : ''}`}
        onClick={() => pickSub({ groupId: group.id, subGroupId: sub.id })}
      >
        {ai && <span className="ais-ai" aria-label="AI 推荐"><Ico name="sparkles" /></span>}
        {showGroup && <span className="ais-row-g">{group.name} ·</span>}
        <span className="ais-row-name">{sub.name}</span>
        {cur ? <span className="ais-ck"><Ico name="check" /></span> : <span className="ais-n">{sub.count}</span>}
      </button>
    )
  }

  return (
    <div
      ref={popRef}
      id="ais-picker"
      className={`ais-picker${open ? ' is-show' : ''}`}
      role="dialog"
      aria-label="选择分组"
      aria-hidden={!open}
      inert={!open}
      style={{ top: pos.top, left: pos.left, transformOrigin: pos.origin }}
    >
      <div className="ais-pk-search">
        <Ico name="search" />
        <input
          ref={searchRef}
          value={query}
          placeholder="搜索分组或子分组"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const value = e.target.value
            setQuery(value)
            setComposing(false)
            const needle = value.trim().toLowerCase()
            if (!needle) return
            for (const group of groups) {
              for (const sub of group.children) {
                if (`${group.name}${sub.name}`.toLowerCase().includes(needle)) {
                  setDraft({ groupId: group.id, subGroupId: sub.id })
                  return
                }
              }
            }
          }}
        />
      </div>
      <div className="ais-pk-cols">
        <div className="ais-pk-g">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`ais-row${group.id === draftGroup?.id ? ' is-on' : ''}`}
              onClick={() => {
                const subId = group.id === currentGroupId && group.children.some((s) => s.id === currentSubId)
                  ? currentSubId
                  : group.children[0]?.id ?? ''
                setQuery('')
                setComposing(false)
                setDraft({ groupId: group.id, subGroupId: subId })
              }}
            >
              <span className="ais-row-name">{group.name}</span>
              {group.id === currentGroupId && <span className="ais-n"><Ico name="check" /></span>}
            </button>
          ))}
        </div>
        <div className="ais-pk-s">
          {q ? (
            hits.length ? hits.map((hit) => {
              const group = groups.find((g) => g.id === hit.groupId)
              const sub = group?.children.find((s) => s.id === hit.subGroupId)
              if (!group || !sub) return null
              return renderSub(group, sub, true)
            }) : (
              <button type="button" className="ais-row is-new" onClick={() => createNamed(query.trim())}>
                <Ico name="plus" />新建子分组「{query.trim()}」
              </button>
            )
          ) : (
            <>
              {draftGroup?.children.map((sub) => renderSub(draftGroup, sub, false))}
              {composing ? (
                <div className="ais-new-in">
                  <Ico name="plus" />
                  <input
                    autoFocus
                    placeholder="子分组名称"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        if (draftName.trim()) createNamed(draftName)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        setComposing(false)
                        setDraftName('')
                      }
                    }}
                  />
                </div>
              ) : (
                <button type="button" className="ais-row is-new" onClick={() => { setComposing(true); setDraftName('') }}>
                  <Ico name="plus" />新建子分组
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="ais-pk-foot">
        <span className="ais-pk-to">
          {draftGroup && draftSub ? <>移到 <b>{draftGroup.name} › {draftSub.name}</b></> : null}
        </span>
        <button type="button" className="ais-btn" onClick={onClose}>取消</button>
        <button type="button" className="ais-btn is-primary" disabled={!canMove} onClick={() => draftSub && onConfirm(draft.groupId, draft.subGroupId)}>移到这里</button>
      </div>
    </div>
  )
}
