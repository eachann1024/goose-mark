import type { Group, Bookmark } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import type { ImportData, ImportMode, BookmarkStoreLike, ApplyImportSummary } from './types'
import { syncBookmarkLocations } from './groups'


const cloneImportData = (data: ImportData): ImportData => ({
  groups: JSON.parse(JSON.stringify(data.groups)) as Group[],
  bookmarks: JSON.parse(JSON.stringify(data.bookmarks)) as Bookmark[]
})


const mergeImportData = (target: ImportData, incoming: ImportData) => {
  const existingBookmarkIds = new Set(target.bookmarks.map(item => item.id))
  incoming.bookmarks.forEach(bookmark => {
    if (!existingBookmarkIds.has(bookmark.id)) {
      target.bookmarks.push(bookmark)
      existingBookmarkIds.add(bookmark.id)
    }
  })

  const groupById = new Map(target.groups.map(group => [group.id, group]))
  incoming.groups.forEach(group => {
    const targetGroup = groupById.get(group.id)
    if (!targetGroup) {
      target.groups.push(group)
      groupById.set(group.id, group)
      return
    }

    const subById = new Map(targetGroup.children.map(sub => [sub.id, sub]))
    group.children.forEach(sub => {
      const targetSub = subById.get(sub.id)
      if (!targetSub) {
        targetGroup.children.push(sub)
        subById.set(sub.id, sub)
        return
      }
      const existingIds = new Set(targetSub.bookmarkIds)
      sub.bookmarkIds.forEach(bookmarkId => {
        if (!existingIds.has(bookmarkId)) {
          targetSub.bookmarkIds.push(bookmarkId)
          existingIds.add(bookmarkId)
        }
      })
    })
    targetGroup.updatedAt = Math.max(targetGroup.updatedAt || 0, group.updatedAt || 0)
  })
}


const ensureStoreSelection = (store: BookmarkStoreLike) => {
  if (!store.groups.length) return

  const activeGroup = store.groups.find(group => group.id === store.activeGroupId)
  const activeSub = activeGroup?.children.find(sub => sub.id === store.activeSubGroupId)
  if (activeGroup && activeSub) return

  const fallbackGroup = store.groups.find(group => group.id !== TRASH_GROUP_ID) || store.groups[0]
  const fallbackSub = fallbackGroup.children[0]
  store.selectGroup(fallbackGroup.id, fallbackSub?.id)
}


export const applyImportDataToStore = (
  store: BookmarkStoreLike,
  incomingData: ImportData,
  mode: ImportMode
): ApplyImportSummary => {
  const before = {
    groups: store.groups.length,
    bookmarks: store.bookmarks.length
  }

  // afterData 引用合并后的实际数据，用于准确统计新增数——
  // store.setData 是同步的但 store 对象是调用时的旧快照，setData 后读 store.groups/bookmarks 仍是旧值。
  let afterData: ImportData

  if (mode === 'overwrite') {
    const cloned = cloneImportData(incomingData)
    syncBookmarkLocations(cloned.groups, cloned.bookmarks)
    afterData = cloned
    store.setData({
      groups: cloned.groups,
      bookmarks: cloned.bookmarks
    })
  } else {
    // merge 模式：先拷贝 store 当前数据作为 target，合并后通过 setData 提交，避免原地 mutate 绕过 zustand
    const target: ImportData = {
      groups: JSON.parse(JSON.stringify(store.groups)) as Group[],
      bookmarks: JSON.parse(JSON.stringify(store.bookmarks)) as Bookmark[]
    }
    const cloned = cloneImportData(incomingData)
    mergeImportData(target, cloned)
    syncBookmarkLocations(target.groups, target.bookmarks)
    afterData = target
    store.setData({
      groups: target.groups,
      bookmarks: target.bookmarks
    })
  }

  ensureStoreSelection(store)

  const after = {
    groups: afterData.groups.length,
    bookmarks: afterData.bookmarks.length
  }

  return {
    before,
    after,
    added: {
      groups: Math.max(0, after.groups - before.groups),
      bookmarks: Math.max(0, after.bookmarks - before.bookmarks)
    }
  }
}
