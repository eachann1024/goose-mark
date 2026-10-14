import type { ImportData } from './types'
import { TRASH_GROUP_ID } from '@/stores/bookmarkSeed'

export function importPreviewCounts(incoming: ImportData, current: ImportData) {
  const trashIds = new Set(incoming.groups.filter(group => group.id === TRASH_GROUP_ID)
    .flatMap(group => group.children.flatMap(sub => sub.bookmarkIds)))
  const bookmarkById = new Map(current.bookmarks.map(bookmark => [bookmark.id, bookmark]))
  const groupById = new Map(current.groups.map(group => [group.id, group]))
  const conflicts = incoming.bookmarks.filter(bookmark => {
    const existing = bookmarkById.get(bookmark.id)
    return existing && JSON.stringify(existing) !== JSON.stringify(bookmark)
  }).length + incoming.groups.filter(group => {
    const existing = groupById.get(group.id)
    return existing && JSON.stringify(existing) !== JSON.stringify(group)
  }).length
  return { bookmarks: incoming.bookmarks.length, groups: incoming.groups.length, trash: trashIds.size, conflicts }
}

export function importTargetStamp(data: ImportData) {
  return JSON.stringify({ groups: data.groups, bookmarks: data.bookmarks })
}
