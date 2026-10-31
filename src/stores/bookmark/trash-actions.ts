import type { BookmarkLocation } from '@/types/bookmark'
import { TRASH_GROUP_ID, createSeedGroups, uid } from '@/stores/bookmarkSeed'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createTrashActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'autoCleanTrash' | 'removeBookmark' | 'removeBookmarkPermanently' | 'restoreBookmark' | 'restoreBookmarkFromTrash' | 'emptyTrash'> {
  return {
    autoCleanTrash: () => {
      const state = get()
      if (state.isReadOnly) return
      const trashGroup = state.groups.find((g) => g.id === TRASH_GROUP_ID)
      if (!trashGroup?.children.some(sub => sub.bookmarkIds.length > 0)) return

      const now = Date.now()
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
      const trashSize = trashGroup.children.reduce((count, sub) => count + sub.bookmarkIds.length, 0)
      // A large library with only a few trash entries does not need a second
      // index of every normal bookmark.
      const candidates = trashSize * 8 < state.bookmarks.length ? new Set<string>() : undefined
      if (candidates) trashGroup.children.forEach(sub => sub.bookmarkIds.forEach(id => candidates.add(id)))
      const firstIndex = new Map<string, number>()
      const duplicates = new Map<string, { indexes: number[]; cursor: number }>()
      state.bookmarks.forEach((bookmark, index) => {
        if (candidates && !candidates.has(bookmark.id)) return
        if (!firstIndex.has(bookmark.id)) firstIndex.set(bookmark.id, index)
        else {
          let next = duplicates.get(bookmark.id)
          if (!next) duplicates.set(bookmark.id, next = { indexes: [], cursor: 0 })
          next.indexes.push(index)
        }
      })
      const activeIds = new Set<string>()
      state.groups.forEach(group => {
        if (group.id !== TRASH_GROUP_ID) group.children.forEach(sub => {
          sub.bookmarkIds.forEach(id => { if (firstIndex.has(id)) activeIds.add(id) })
        })
      })
      const removedIndexes = new Set<number>()
      let firstRemoved = Infinity
      let lastRemoved = -1
      let changed = false
      const children = trashGroup.children.map(sub => {
        const newIds: string[] = []
        sub.bookmarkIds.forEach((bid) => {
          const index = firstIndex.get(bid)
          if (index === undefined) return
          const bookmark = state.bookmarks[index]
          if (activeIds.has(bid) || now - bookmark.updatedAt <= THIRTY_DAYS) {
            newIds.push(bid)
          } else {
            removedIndexes.add(index)
            if (index < firstRemoved) firstRemoved = index
            if (index > lastRemoved) lastRemoved = index
            // Match the old first-record lookup even in malformed snapshots
            // containing duplicate records, without repeatedly shifting arrays.
            const next = duplicates.get(bid)
            if (next && next.cursor < next.indexes.length) firstIndex.set(bid, next.indexes[next.cursor++])
            else firstIndex.delete(bid)
          }
        })
        if (sub.bookmarkIds.length === newIds.length) return sub
        changed = true
        return { ...sub, bookmarkIds: newIds, updatedAt: now }
      })
      if (!changed) return
      const groups = state.groups.map(group => group === trashGroup
        ? { ...group, children, updatedAt: now }
        : group)
      let bookmarks = state.bookmarks
      if (removedIndexes.size) {
        if (removedIndexes.size === state.bookmarks.length) bookmarks = []
        else if (lastRemoved - firstRemoved + 1 === removedIndexes.size) {
          // Migration usually appends trash records together. Copying once and
          // removing that range avoids a callback for every unaffected record.
          bookmarks = state.bookmarks.slice()
          bookmarks.splice(firstRemoved, removedIndexes.size)
        } else bookmarks = state.bookmarks.filter((_, index) => !removedIndexes.has(index))
      }
      commit(groups, bookmarks)
    },

    removeBookmark: (id) => {
      const state = get()
      if (state.isReadOnly || !state.bookmarks.some((bookmark) => bookmark.id === id)) return false
      const now = Date.now()
      const locations = state.getBookmarkLocations(id)
      if (locations.some((loc) => loc.groupId === TRASH_GROUP_ID)) return false
      const previousShareIds = state.getShareIdsFromLocations(locations)
      const groups = clone(state.groups)
      const bookmarks = clone(state.bookmarks)
      const bookmark = bookmarks.find((b) => b.id === id)!
      let trashGroup = groups.find((group) => group.id === TRASH_GROUP_ID)
      if (!trashGroup) {
        trashGroup = createSeedGroups().find((group) => group.id === TRASH_GROUP_ID)!
        if (groups.some((group) => group.children.some((sub) => sub.id === trashGroup!.children[0].id))) trashGroup.children[0].id = uid()
        groups.push(trashGroup)
      }
      trashGroup.isDeleted = false
      let trashSub = trashGroup.children.find((sub) => !sub.isDeleted)
      if (!trashSub) {
        trashSub = createSeedGroups().find((group) => group.id === TRASH_GROUP_ID)!.children[0]
        if (groups.some((group) => group.children.some((sub) => sub.id === trashSub!.id))) trashSub.id = uid()
        trashGroup.children.push(trashSub)
      }
      const affected: BookmarkLocation[] = []
      groups.forEach((group) => {
        group.children.forEach((sub) => {
          if (!sub.bookmarkIds.includes(id)) return
          sub.bookmarkIds = sub.bookmarkIds.filter((bookmarkId) => bookmarkId !== id)
          sub.updatedAt = now
          group.updatedAt = now
          affected.push({ groupId: group.id, subGroupId: sub.id })
        })
      })
      trashSub.bookmarkIds.push(id)
      trashSub.updatedAt = now
      trashGroup.updatedAt = now
      bookmark.prevLocations = clone(locations)
      bookmark.locations = [{ groupId: trashGroup.id, subGroupId: trashSub.id }]
      bookmark.updatedAt = now
      commit(groups, bookmarks)
      affected.push({ groupId: trashGroup.id, subGroupId: trashSub.id })
      affected.forEach((loc) => state.scheduleSubGroupSync(loc.groupId, loc.subGroupId, { updatedAt: now }))
      new Set(affected.map((loc) => loc.groupId)).forEach((groupId) => state.scheduleGroupSync(groupId, { updatedAt: now, orderIndex: groups.findIndex((group) => group.id === groupId) }))
      state.scheduleBookmarkSync(id, { updatedAt: now, previousShareIds })
      return true
    },

    removeBookmarkPermanently: (id) => {
      if (get().isReadOnly) return
      const now = Date.now()
      const locations = get().getBookmarkLocations(id)
      if (locations.some((loc) => loc.groupId === TRASH_GROUP_ID) && !locations.some((loc) => loc.groupId !== TRASH_GROUP_ID)) {
        const groups = clone(get().groups)
        let bookmarks = clone(get().bookmarks)
        const bookmark = bookmarks.find((b) => b.id === id)
        const previousLocations = bookmark && Array.isArray(bookmark.locations) && bookmark.locations.length > 0 ? clone(bookmark.locations) : locations
        const previousShareIds = get().getShareIdsFromLocations(previousLocations)

        groups.forEach((g) => {
          let groupChanged = false
          g.children.forEach((sub) => {
            const originalLen = sub.bookmarkIds.length
            sub.bookmarkIds = sub.bookmarkIds.filter((bid) => bid !== id)
            if (sub.bookmarkIds.length !== originalLen) {
              sub.updatedAt = now
              groupChanged = true
            }
          })
          if (groupChanged) g.updatedAt = now
        })
        bookmarks = bookmarks.filter((b) => b.id !== id)
        commit(groups, bookmarks)
        get().scheduleBookmarkSync(id, { isDeleted: true, updatedAt: now, previousShareIds, content: null, removedFromStore: true })
      }
    },

    restoreBookmark: (id) => get().restoreBookmarkFromTrash(id),

    restoreBookmarkFromTrash: (id) => {
      const state = get()
      if (state.isReadOnly || !state.bookmarks.some((b) => b.id === id)) return false
      const inTrash = state.groups.some((group) => group.id === TRASH_GROUP_ID && group.children.some((sub) => sub.bookmarkIds.includes(id)))
      const inActiveGroup = state.groups.some((group) => group.id !== TRASH_GROUP_ID && group.children.some((sub) => sub.bookmarkIds.includes(id)))
      if (!inTrash || inActiveGroup) return false
      const groups = clone(state.groups)
      const bookmarks = clone(state.bookmarks)
      const bookmark = bookmarks.find((b) => b.id === id)
      if (!bookmark) return false
      const now = Date.now()
      const trashGroup = groups.find((g) => g.id === TRASH_GROUP_ID)
      const trashSubs = trashGroup?.children ?? []
      const previousLocations = resolveBookmarkLocations(bookmark, get().getBookmarkLocations)
      const previousShareIds = get().getShareIdsFromLocations(previousLocations)

      let targetLocations: BookmarkLocation[] = []
      if (bookmark.prevLocations && bookmark.prevLocations.length > 0) {
        const seen = new Set<string>()
        targetLocations = bookmark.prevLocations.filter((loc) => {
          const group = groups.find((g) => g.id === loc.groupId && !g.isDeleted)
          const key = JSON.stringify([loc.groupId, loc.subGroupId])
          if (seen.has(key) || !group || group.id === TRASH_GROUP_ID || !group.children.some((c) => c.id === loc.subGroupId && !c.isDeleted)) return false
          seen.add(key)
          return true
        })
      }
      if (targetLocations.length === 0) {
        const defaultGroup = groups.find((g) => g.id !== TRASH_GROUP_ID && !g.isDeleted && g.children.some((sub) => !sub.isDeleted))
        if (defaultGroup) {
          targetLocations = [{ groupId: defaultGroup.id, subGroupId: defaultGroup.children.find((sub) => !sub.isDeleted)!.id }]
        } else {
          const createdGroups = createSeedGroups()
          const seedGroup = createdGroups.find((g) => g.id !== TRASH_GROUP_ID)!
          if (groups.some((g) => g.id === seedGroup.id)) seedGroup.id = uid()
          if (groups.some((g) => g.children.some((sub) => sub.id === seedGroup.children[0].id))) seedGroup.children[0].id = uid()
          groups.unshift(seedGroup)
          targetLocations = [{ groupId: seedGroup.id, subGroupId: seedGroup.children[0].id }]
        }
      }

      trashSubs.forEach((sub) => {
        sub.bookmarkIds = sub.bookmarkIds.filter((bid) => bid !== id)
        sub.updatedAt = now
      })
      if (trashGroup) trashGroup.updatedAt = now

      bookmark.isDeleted = false
      bookmark.updatedAt = now
      bookmark.locations = clone(targetLocations)
      delete bookmark.prevLocations

      targetLocations.forEach((loc) => {
        const group = groups.find((g) => g.id === loc.groupId)!
        const sub = group.children.find((c) => c.id === loc.subGroupId)!
        if (!sub.bookmarkIds.includes(id)) sub.bookmarkIds.push(id)
        sub.updatedAt = now
        group.updatedAt = now
      })
      commit(groups, bookmarks)
      get().selectGroup(targetLocations[0].groupId, targetLocations[0].subGroupId)
      get().scheduleBookmarkSync(id, { updatedAt: now, previousShareIds })
      targetLocations.forEach((loc) => {
        get().scheduleSubGroupSync(loc.groupId, loc.subGroupId, { updatedAt: now })
        get().scheduleGroupSync(loc.groupId, {
          updatedAt: now,
          orderIndex: get().groups.findIndex((g) => g.id === loc.groupId)
        })
      })
      return true
    },

    emptyTrash: () => {
      const state = get()
      if (state.isReadOnly) return
      const trashGroup = state.groups.find((g) => g.id === TRASH_GROUP_ID)
      if (!trashGroup?.children.some(sub => sub.bookmarkIds.length > 0)) return
      const now = Date.now()
      const activeIds = new Set<string>()
      state.groups.forEach(group => {
        if (group.id !== TRASH_GROUP_ID) group.children.forEach(sub => {
          sub.bookmarkIds.forEach(id => activeIds.add(id))
        })
      })
      // null also tracks orphaned index entries: they still need their tombstone.
      const removals = new Map<string, string[] | null>()
      trashGroup.children.forEach(sub => sub.bookmarkIds.forEach(id => {
        if (!activeIds.has(id)) removals.set(id, null)
      }))
      let indexedLocations: Map<string, BookmarkLocation[]> | undefined
      const locationsInTrash = (id: string): BookmarkLocation[] => {
        if (trashGroup.children.length === 1) {
          return [{ groupId: TRASH_GROUP_ID, subGroupId: trashGroup.children[0].id }]
        }
        if (!indexedLocations) {
          indexedLocations = new Map()
          trashGroup.children.forEach(sub => sub.bookmarkIds.forEach(bookmarkId => {
            if (!removals.has(bookmarkId)) return
            let locations = indexedLocations!.get(bookmarkId)
            if (!locations) indexedLocations!.set(bookmarkId, locations = [])
            if (!locations.some(location => location.subGroupId === sub.id)) {
              locations.push({ groupId: TRASH_GROUP_ID, subGroupId: sub.id })
            }
          }))
        }
        return indexedLocations.get(id) ?? []
      }
      let lastLocations: BookmarkLocation[] | undefined
      let lastShareIds: string[] = []
      const shareIdsFor = (locations: BookmarkLocation[]) => {
        if (lastLocations?.length === locations.length && locations.every((location, index) =>
          location.groupId === lastLocations![index].groupId && location.subGroupId === lastLocations![index].subGroupId)) return lastShareIds
        lastLocations = locations
        lastShareIds = state.getShareIdsFromLocations(locations)
        return lastShareIds
      }
      const bookmarks = state.bookmarks.filter(bookmark => {
        if (!removals.has(bookmark.id)) return true
        if (removals.get(bookmark.id) === null) {
          const locations = bookmark.locations?.length ? bookmark.locations : locationsInTrash(bookmark.id)
          removals.set(bookmark.id, shareIdsFor(locations))
        }
        return false
      })
      // Copy only surviving mixed-location records; untouched bookmark objects keep
      // their identity, so a bulk delete cannot invalidate every view-model cache.
      for (let index = 0; index < bookmarks.length; index++) {
        const bookmark = bookmarks[index]
        if (activeIds.has(bookmark.id) && bookmark.locations?.some(location => location.groupId === TRASH_GROUP_ID)) {
          bookmarks[index] = {
            ...bookmark,
            locations: bookmark.locations.filter(location => location.groupId !== TRASH_GROUP_ID),
            isDeleted: false,
            updatedAt: now
          }
        }
      }
      // Resolve legacy/orphan locations before publishing the new empty index.
      removals.forEach((shareIds, id) => {
        if (shareIds === null) removals.set(id, shareIdsFor(locationsInTrash(id)))
      })
      const groups = state.groups.map(group => group === trashGroup ? {
        ...group,
        updatedAt: now,
        children: group.children.map(sub => ({ ...sub, bookmarkIds: [], updatedAt: now }))
      } : group)
      commit(groups, bookmarks)
      removals.forEach((previousShareIds, id) => {
        get().scheduleBookmarkSync(id, {
          isDeleted: true,
          updatedAt: now,
          previousShareIds: previousShareIds || [],
          content: null,
          removedFromStore: true
        })
      })
    }
  }
}
