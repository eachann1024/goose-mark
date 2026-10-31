import type { Bookmark, BookmarkLocation, Group } from '@/types/bookmark'
import { TRASH_GROUP_ID, uid } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

function validLocations(groups: Group[], locations: BookmarkLocation[]): boolean {
  if (!locations.length) return false
  if (locations.some((loc) => loc?.groupId === TRASH_GROUP_ID)) return false
  const seen = new Set<string>()
  return locations.every((loc) => {
    const key = JSON.stringify([loc?.groupId, loc?.subGroupId])
    const group = groups.find((g) => g.id === loc?.groupId && !g.isDeleted)
    if (seen.has(key) || !group?.children.some((sub) => sub.id === loc?.subGroupId && !sub.isDeleted)) return false
    seen.add(key)
    return true
  })
}

export function createBookmarkActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'addBookmark' | 'updateBookmark' | 'updateBookmarkLocations'> {
  return {
    // ---- 书签 ----
    addBookmark: (payload, locations) => {
      if (get().isReadOnly || !validLocations(get().groups, locations)) return null
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const now = Date.now()
      const bookmark: Bookmark = { ...payload, id: uid(), locations: clone(locations), createdAt: now, updatedAt: now }
      bookmarks.push(bookmark)

      locations.forEach((loc) => {
        const group = groups.find((g) => g.id === loc.groupId)
        const sub = group?.children.find((c) => c.id === loc.subGroupId)
        if (sub && group && !sub.bookmarkIds.includes(bookmark.id)) {
          sub.bookmarkIds.push(bookmark.id)
          sub.updatedAt = now
          group.updatedAt = now
        }
      })

      commit(groups, bookmarks)

      get().scheduleBookmarkSync(bookmark.id, { updatedAt: now })
      const affectedSubKeys = new Set<string>()
      locations.forEach((loc) => affectedSubKeys.add(JSON.stringify([loc.groupId, loc.subGroupId])))
      affectedSubKeys.forEach((key) => {
        const [groupId, subId] = JSON.parse(key) as [string, string]
        if (groupId && subId) get().scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      })
      const affectedGroupIds = new Set<string>()
      locations.forEach((loc) => affectedGroupIds.add(loc.groupId))
      affectedGroupIds.forEach((groupId) => {
        get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })
      })
      return bookmark
    },

    updateBookmark: (id, updater) => {
      if (get().isReadOnly) return
      const bookmarks = clone(get().bookmarks)
      const idx = bookmarks.findIndex((b) => b.id === id)
      if (idx === -1) return
      const bookmark = bookmarks[idx]
      const now = Date.now()
      const originalUrl = bookmark.url
      const originalIcon = bookmark.icon
      Object.assign(bookmark, updater, { updatedAt: now })
      commit(get().groups, bookmarks)

      if (updater.url && updater.url !== originalUrl && (!originalIcon || originalIcon.type === 'text')) {
        void get().refreshSingleIcon(bookmark)
      }
      get().scheduleBookmarkSync(bookmark.id, { updatedAt: now })
    },

    updateBookmarkLocations: (bookmarkId, newLocations) => {
      const state = get()
      const existing = state.bookmarks.find((b) => b.id === bookmarkId)
      if (state.isReadOnly || !existing || existing.isDeleted || !validLocations(state.groups, newLocations)) return false
      if (state.groups.some((g) => g.id === TRASH_GROUP_ID && g.children.some((sub) => sub.bookmarkIds.includes(bookmarkId)))) return false
      const groups = clone(state.groups)
      const bookmarks = clone(state.bookmarks)
      const now = Date.now()
      const bookmark = bookmarks.find((b) => b.id === bookmarkId)
      const previousLocations = bookmark ? resolveBookmarkLocations(bookmark, get().getBookmarkLocations) : get().getBookmarkLocations(bookmarkId)
      const previousShareIds = get().getShareIdsFromLocations(previousLocations)
      const newLocSet = new Set(newLocations.map((loc) => JSON.stringify([loc.groupId, loc.subGroupId])))

      groups.forEach((g) => {
        let groupChanged = false
        g.children.forEach((sub) => {
          const key = JSON.stringify([g.id, sub.id])
          if (!newLocSet.has(key)) {
            const originalLen = sub.bookmarkIds.length
            sub.bookmarkIds = sub.bookmarkIds.filter((id) => id !== bookmarkId)
            if (sub.bookmarkIds.length !== originalLen) {
              sub.updatedAt = now
              groupChanged = true
            }
          }
        })
        if (groupChanged) g.updatedAt = now
      })

      newLocations.forEach((loc) => {
        const group = groups.find((g) => g.id === loc.groupId)
        const sub = group?.children.find((c) => c.id === loc.subGroupId)
        if (!sub || !group) return
        if (!sub.bookmarkIds.includes(bookmarkId)) {
          sub.bookmarkIds.push(bookmarkId)
          sub.updatedAt = now
          group.updatedAt = now
        }
      })

      if (bookmark) {
        bookmark.locations = clone(newLocations)
        bookmark.updatedAt = now
      }

      commit(groups, bookmarks)

      const affectedSubKeys = new Set<string>()
      previousLocations.forEach((loc) => affectedSubKeys.add(JSON.stringify([loc.groupId, loc.subGroupId])))
      newLocations.forEach((loc) => affectedSubKeys.add(JSON.stringify([loc.groupId, loc.subGroupId])))
      affectedSubKeys.forEach((key) => {
        const [groupId, subId] = JSON.parse(key) as [string, string]
        if (groupId && subId) get().scheduleSubGroupSync(groupId, subId, { updatedAt: now })
      })
      const affectedGroupIds = new Set<string>()
      previousLocations.forEach((loc) => affectedGroupIds.add(loc.groupId))
      newLocations.forEach((loc) => affectedGroupIds.add(loc.groupId))
      affectedGroupIds.forEach((groupId) => {
        get().scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((g) => g.id === groupId) })
      })
      get().scheduleBookmarkSync(bookmarkId, { updatedAt: now, previousShareIds })
      return true
    }
  }
}
