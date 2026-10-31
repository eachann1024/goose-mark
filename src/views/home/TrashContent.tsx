import { useMemo } from 'react'
import type { Group } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'
import { Ico } from './icon'
import { Image } from '@/components/ui/image'
import { useDeleteClickGuard } from './useDeleteClickGuard'

/* ---------- 回收站视图 ---------- */
export function TrashContent({
  groups,
  onToast,
}: {
  groups: Group[]
  onToast: (title?: string) => void
}) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const readOnly = useBookmarkStore((s) => s.isReadOnly)
  const restoreBookmarkFromTrash = useBookmarkStore((s) => s.restoreBookmarkFromTrash)
  const emptyTrash = useBookmarkStore((s) => s.emptyTrash)
  const allowRowClick = useDeleteClickGuard()

  const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
  const trashItems = useMemo(() => {
    if (!trashGroup) return []
    const ids = new Set(trashGroup.children.flatMap((sub) => sub.bookmarkIds))
    return bookmarks.filter((b) => ids.has(b.id))
  }, [trashGroup, bookmarks])

  const handleRestore = (id: string) => {
    const ok = restoreBookmarkFromTrash(id)
    if (ok) onToast('书签已恢复')
  }

  const handleEmptyTrash = () => {
    if (useBookmarkStore.getState().isReadOnly) return
    emptyTrash()
    onToast('回收站已清空')
  }

  const handlePermanentDelete = (id: string) => {
    const store = useBookmarkStore.getState()
    if (store.isReadOnly) return
    const locations = store.getBookmarkLocations(id)
    if (!locations.some((loc) => loc.groupId === TRASH_GROUP_ID)) return
    if (locations.some((loc) => loc.groupId !== TRASH_GROUP_ID)) {
      onToast('书签仍在其他分组，无法永久删除')
      return
    }
    store.removeBookmarkPermanently(id)
    onToast('书签已永久删除')
  }

  return (
    <div className="content trash-content">
      <div className="trash-head">
        <div className="trash-title">
          <Ico name="trash-2" />
          <span>回收站</span>
          {trashItems.length > 0 && <span className="trash-count">{trashItems.length}</span>}
        </div>
        {trashItems.length > 0 && (
          <button
            className="btn btn-ghost danger"
            style={{ fontSize: 12.5, height: 32, padding: '0 12px' }}
            disabled={readOnly}
            onClick={handleEmptyTrash}
          >
            <Ico name="trash-2" />
            清空回收站
          </button>
        )}
      </div>

      {trashItems.length === 0 ? (
        <div className="empty" style={{ marginTop: 60 }}>
          <Ico name="check-circle" />
          <span>回收站为空</span>
        </div>
      ) : (
        trashItems.map((b) => (
          <div key={b.id} className="card trash-card">
            <div className="fav" style={{ background: b.icon?.bgColor || 'var(--surface-hover)' }}>
              {(() => {
                const url = iconToDisplayUrl(b.icon ?? undefined)
                return url
                  ? <Image bare src={url} alt="" />
                  : (b.title || b.url || '?').slice(0, 4).toUpperCase()
              })()}
            </div>
            <div className="meta">
              <div className="ttl">{b.title || b.url}</div>
              <div className="url">{b.url}</div>
            </div>
            <button
              className="trash-restore-btn"
              title="恢复书签"
              disabled={readOnly}
              onClick={(e) => { if (allowRowClick(e)) handleRestore(b.id) }}
            >
              <Ico name="rotate-ccw" />
              恢复
            </button>
            <button
              className="trash-restore-btn"
              style={{ color: 'var(--danger)' }}
              title="永久删除书签"
              disabled={readOnly}
              onClick={(e) => { if (allowRowClick(e)) handlePermanentDelete(b.id) }}
            >
              <Ico name="trash-2" />
              永久删除
            </button>
          </div>
        ))
      )}
    </div>
  )
}
