import { bulkMatchMissing, ensureIconForBookmark, backfillRemoteIconCache } from '@/services/iconCache'
import { useSettingsStore } from '@/stores/settings'
import type { BookmarkActions, BookmarkSet, BookmarkGet } from './store-types'
import { clone } from './common'

export function createIconActions(set: BookmarkSet, get: BookmarkGet): Pick<BookmarkActions, 'assignIcon' | 'refreshSingleIcon' | 'getMissingIconCandidates' | 'countMissingIconCandidates' | 'refreshMissingIcons' | 'backfillIconCache'> {
  return {
    // ---- 图标 ----
    assignIcon: (id, icon) => {
      const bookmarks = [...get().bookmarks]
      const idx = bookmarks.findIndex((b) => b.id === id)
      if (idx === -1) return
      const prev = bookmarks[idx]
      bookmarks.splice(idx, 1, {
        ...prev,
        icon,
        iconMatchedAt: Date.now(),
        iconMatchFailedAt: undefined,
        iconMatchFailedReason: undefined,
        updatedAt: Date.now()
      })
      set({ bookmarks })
    },

    refreshSingleIcon: async (bookmark) => {
      const icon = await ensureIconForBookmark(bookmark)
      if (!icon) return
      get().assignIcon(bookmark.id, icon)
    },

    getMissingIconCandidates: (force = false) => {
      const settingsStore = useSettingsStore.getState()
      return get().bookmarks.filter((bookmark) => {
        if (get().isBookmarkInTrash(bookmark)) return false
        if (settingsStore.skipFailedIconMatch && bookmark.iconMatchFailedAt && !force) return false
        return !bookmark.icon || bookmark.icon.type === 'text'
      })
    },

    countMissingIconCandidates: (force = false) => get().getMissingIconCandidates(force).length,

    refreshMissingIcons: async (force = false) => {
      const missing = get().getMissingIconCandidates(force)
      const result = await bulkMatchMissing(missing)

      const successList: string[] = []
      const failList: { id: string; title: string }[] = []
      const now = Date.now()

      const bookmarks = clone(get().bookmarks)
      missing.forEach((bookmark) => {
        const live = bookmarks.find((b) => b.id === bookmark.id)
        if (result.has(bookmark.id)) {
          successList.push(bookmark.title || bookmark.url)
          if (live) {
            live.icon = result.get(bookmark.id)
            live.iconMatchedAt = now
            live.iconMatchFailedAt = undefined
            live.iconMatchFailedReason = undefined
            live.updatedAt = now
          }
        } else {
          failList.push({ id: bookmark.id, title: bookmark.title || bookmark.url })
          if (live) {
            live.iconMatchFailedAt = now
            live.iconMatchFailedReason = 'no_icon'
          }
        }
      })
      set({ bookmarks })

      return {
        total: missing.length,
        matched: result.size,
        remaining: get().countMissingIconCandidates(force),
        successList,
        failList
      }
    },

    // 把远程图标回填为本地 base64：纯本地缓存优化，成功一次后渲染不再联网。
    // 刻意不改 updatedAt、不调度同步，避免把 base64 推到云端污染同步数据。
    backfillIconCache: async () => {
      const result = await backfillRemoteIconCache(get().bookmarks)
      if (result.size === 0) return
      const bookmarks = [...get().bookmarks]
      let changed = false
      result.forEach((cache, id) => {
        const idx = bookmarks.findIndex((b) => b.id === id)
        if (idx === -1) return
        const prev = bookmarks[idx]
        if (prev.icon?.type !== 'remote') return
        bookmarks.splice(idx, 1, {
          ...prev,
          icon: { ...prev.icon, cache, fetchedAt: Date.now() }
        })
        changed = true
      })
      if (changed) set({ bookmarks })
    }
  }
}
