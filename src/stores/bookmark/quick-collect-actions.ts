import type { Bookmark, Group } from '@/types/bookmark'
import { TRASH_GROUP_ID, uid } from '@/stores/bookmarkSeed'
import { ensureIconForBookmark } from '@/services/iconCache'
import type { BookmarkActions, BookmarkGet, BookmarkCommit } from './store-types'
import { clone, resolveBookmarkLocations } from './common'

export function createQuickCollectActions(get: BookmarkGet, commit: BookmarkCommit): Pick<BookmarkActions, 'getOrCreateQuickCollectGroup' | 'quickSaveBookmark'> {
  return {
    getOrCreateQuickCollectGroup: () => {
      const QUICK_COLLECT_NAME = '快速收集'
      const existing = get().findGroupByName(QUICK_COLLECT_NAME)
      if (existing && existing.children.length > 0) {
        return { group: existing, subGroup: existing.children[0] }
      }
      const groups = clone(get().groups)
      const now = Date.now()
      let group = groups.find((g) => g.name === QUICK_COLLECT_NAME && g.id !== TRASH_GROUP_ID)
      if (!group) {
        const newGroup: Group = {
          id: uid(),
          name: QUICK_COLLECT_NAME,
          createdAt: now,
          updatedAt: now,
          children: [{ id: uid(), name: '收集', bookmarkIds: [], createdAt: now, updatedAt: now }]
        }
        const trashIdx = groups.findIndex((g) => g.id === TRASH_GROUP_ID)
        if (trashIdx !== -1) groups.splice(trashIdx, 0, newGroup)
        else groups.push(newGroup)
        group = newGroup
      }
      if (!group.children || group.children.length === 0) {
        group.children = [{ id: uid(), name: '收集', bookmarkIds: [], createdAt: now, updatedAt: now }]
        group.updatedAt = now
      }
      commit(groups, get().bookmarks)
      return { group, subGroup: group.children[0] }
    },

    quickSaveBookmark: (url, title, desc) => {
      const { group, subGroup } = get().getOrCreateQuickCollectGroup()
      const now = Date.now()
      const groups = clone(get().groups)
      const bookmarks = clone(get().bookmarks)
      const liveGroup = groups.find((g) => g.id === group.id)
      const liveSub = liveGroup?.children.find((c) => c.id === subGroup.id)
      if (!liveGroup || !liveSub) {
        console.warn('[quickSaveBookmark] 快速收集分组未找到，尝试重新创建')
        const { group: retryGroup, subGroup: retrySub } = get().getOrCreateQuickCollectGroup()
        const retryLiveGroup = get().groups.find((g) => g.id === retryGroup.id)
        const retryLiveSub = retryLiveGroup?.children.find((c) => c.id === retrySub.id)
        if (!retryLiveGroup || !retryLiveSub) {
          console.warn('[quickSaveBookmark] 快速收集分组创建失败，放弃保存')
          const fallback: Bookmark = {
            id: uid(),
            title: title || url,
            url,
            desc: desc || '',
            tags: [],
            locations: [],
            createdAt: now,
            updatedAt: now
          }
          return fallback
        }
        return get().quickSaveBookmark(url, title, desc)
      }

      const existingBookmark = bookmarks.find((b) => b.url === url && !b.isDeleted)
      if (existingBookmark) {
        const alreadyInQuickCollect = liveSub.bookmarkIds.includes(existingBookmark.id)
        if (!alreadyInQuickCollect) {
          // 用 resolveBookmarkLocations 取真实位置（兼容旧数据 locations=[]）
          const previousLocations = resolveBookmarkLocations(existingBookmark, get().getBookmarkLocations)
          liveSub.bookmarkIds.unshift(existingBookmark.id)
          liveSub.updatedAt = now
          liveGroup.updatedAt = now
          // 基于真实位置合并新位置，确保原有索引归属不丢失
          existingBookmark.locations = [...previousLocations, { groupId: liveGroup.id, subGroupId: liveSub.id }]
          existingBookmark.updatedAt = now
          commit(groups, bookmarks)
        }
        return existingBookmark
      }

      const bookmark: Bookmark = {
        id: uid(),
        // 标题留空（而非塞 URL）：列表/卡片本就 `title || url` 兜底显示，
        // 留空才能让后台元信息水合（enqueueMetadataHydration 的 shouldHydrateTitle 守卫）放行补全真实标题
        title: title || '',
        url,
        desc: desc || '',
        tags: [],
        locations: [{ groupId: liveGroup.id, subGroupId: liveSub.id }],
        createdAt: now,
        updatedAt: now
      }
      bookmarks.push(bookmark)
      liveSub.bookmarkIds.unshift(bookmark.id)
      liveSub.updatedAt = now
      liveGroup.updatedAt = now
      commit(groups, bookmarks)

      void ensureIconForBookmark(bookmark).then((icon) => {
        if (icon) get().assignIcon(bookmark.id, icon)
      })

      return bookmark
    }
  }
}
