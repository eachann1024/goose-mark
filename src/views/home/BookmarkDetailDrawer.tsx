import { useEffect } from 'react'
import { Fav } from './BookmarkCard'
import { Ico } from './icon'
import type { HomeItem } from './viewModel'

export function BookmarkDetailDrawer({
  item,
  groupName,
  subName,
  onClose,
  onEdit,
  onOpen,
  onCopy,
}: {
  item: HomeItem | null
  groupName: string
  subName: string
  onClose: () => void
  onEdit: () => void
  onOpen: () => void
  onCopy: () => void
}) {
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  return (
    <>
      <div className={`scrim${item ? ' show' : ''}`} onClick={onClose} />
      <aside className={`drawer${item ? ' show' : ''}`} aria-hidden={!item}>
        {item && (
          <>
            <div className="dw-top">
              <button type="button" className="header-icon-btn" aria-label="关闭" onClick={onClose}>
                <Ico name="x" />
              </button>
            </div>
            <div className="dw-body">
              <div className="dw-head">
                <Fav item={item} />
                <h2>{item.ttl}</h2>
              </div>
              <div className="dw-url">
                <span>{item.url}</span>
                <button type="button" aria-label="复制链接" onClick={onCopy}>
                  <Ico name="copy" />
                </button>
              </div>
              {item.dsc ? <p className="dw-desc">{item.dsc}</p> : null}
              <div>
                <div className="dw-lbl">位置</div>
                <div className="dw-path">
                  <span className="dw-chip"><Ico name="folder" />{groupName}</span>
                  <span className="dw-sep"><Ico name="chevron-right" /></span>
                  <span className="dw-chip">{subName}</span>
                </div>
              </div>
            </div>
            <div className="dw-acts">
              <button type="button" className="btn" onClick={onEdit}><Ico name="pencil" />编辑</button>
              <button type="button" className="btn pri" onClick={onOpen}><Ico name="external-link" />打开</button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
