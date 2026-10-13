import type { Group, Bookmark, BookmarkLocation } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import { DEFAULT_GROUP_ID, DEFAULT_SUB_ID, DEFAULT_GROUP_NAME, DEFAULT_SUB_NAME, TRASH_SUB_ID, uid } from './validation'


export const ensureBaseGroups = (groups: Group[], now = Date.now()) => {
  let defaultGroup = groups.find(g => g.id === DEFAULT_GROUP_ID)
  if (!defaultGroup) {
    defaultGroup = groups.find(g => g.id !== TRASH_GROUP_ID)
  }
  if (!defaultGroup) {
    defaultGroup = {
      id: DEFAULT_GROUP_ID,
      name: DEFAULT_GROUP_NAME,
      createdAt: now,
      updatedAt: now,
      children: []
    }
    groups.unshift(defaultGroup)
  }
  if (!Array.isArray(defaultGroup.children)) {
    defaultGroup.children = []
  }
  if (!defaultGroup.children.length) {
    defaultGroup.children.push({
      id: DEFAULT_SUB_ID,
      name: DEFAULT_SUB_NAME,
      bookmarkIds: [],
      createdAt: now,
      updatedAt: now
    })
  }

  let trash = groups.find(g => g.id === TRASH_GROUP_ID)
  if (!trash) {
    trash = {
      id: TRASH_GROUP_ID,
      name: '回收站',
      createdAt: now,
      updatedAt: now,
      children: []
    }
    groups.push(trash)
  }
  if (!Array.isArray(trash.children)) {
    trash.children = []
  }
  if (!trash.children.length) {
    trash.children.push({
      id: TRASH_SUB_ID,
      name: '已删除',
      bookmarkIds: [],
      createdAt: now,
      updatedAt: now
    })
  }
}


export const syncBookmarkLocations = (groups: Group[], bookmarks: Bookmark[]) => {
  const now = Date.now()
  ensureBaseGroups(groups, now)

  const bookmarkById = new Map(bookmarks.map(item => [item.id, item]))
  const locationsMap = new Map<string, BookmarkLocation[]>()

  groups.forEach(group => {
    group.children = (group.children || []).filter(Boolean)
    group.children.forEach(sub => {
      const deduped = Array.from(new Set((sub.bookmarkIds || []).filter(id => bookmarkById.has(id))))
      sub.bookmarkIds = deduped
      deduped.forEach(bookmarkId => {
        const existing = locationsMap.get(bookmarkId) || []
        existing.push({ groupId: group.id, subGroupId: sub.id })
        locationsMap.set(bookmarkId, existing)
      })
    })
    if (!group.children.length) {
      group.children.push({
        id: uid('sg'),
        name: DEFAULT_SUB_NAME,
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      })
    }
  })

  const firstTargetGroup = groups.find(g => g.id !== TRASH_GROUP_ID) || groups[0]
  const firstTargetSub = firstTargetGroup.children[0]

  bookmarks.forEach(bookmark => {
    const locations = locationsMap.get(bookmark.id)
    if (locations && locations.length > 0) {
      bookmark.locations = locations
      return
    }

    if (!firstTargetSub.bookmarkIds.includes(bookmark.id)) {
      firstTargetSub.bookmarkIds.push(bookmark.id)
    }
    bookmark.locations = [{ groupId: firstTargetGroup.id, subGroupId: firstTargetSub.id }]
  })
}
