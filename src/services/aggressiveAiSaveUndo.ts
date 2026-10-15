import { useBookmarkStore } from '@/stores/bookmark'
import type { AggressiveAiSaveResult } from './aggressiveAiSave'

/**
 * 撤销成功卡对应的那一次保存。
 * 新建书签进入回收站；已有书签恢复本次保存前的元信息与分组快照。
 */
export function undoAggressiveAiSave(result: AggressiveAiSaveResult): 'removed' | 'restored' | 'missing' {
  const store = useBookmarkStore.getState()
  const current = store.bookmarks.find((bookmark) => bookmark.id === result.bookmark.id)
  if (!current) return 'missing'

  if (result.undo.kind === 'created') {
    store.removeBookmark(current.id)
    return 'removed'
  }

  const previous = result.undo.bookmark
  store.updateBookmark(current.id, {
    title: previous.title,
    url: previous.url,
    desc: previous.desc,
    tags: [...(previous.tags || [])],
    icon: previous.icon ? { ...previous.icon } : undefined,
    pinned: previous.pinned,
    allowUniversal: previous.allowUniversal,
    lastUsed: previous.lastUsed,
    visits: previous.visits,
    isDeleted: previous.isDeleted
  })
  store.updateBookmarkLocations(
    current.id,
    result.undo.locations.map((location) => ({ ...location }))
  )
  return 'restored'
}
