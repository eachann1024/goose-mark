import type { Bookmark, Group, BookmarkLocation, SubGroup, IconSource } from '@/types/bookmark'
import { type BookmarkSnapshot } from '@/lib/stateRepository'
import type { StoreApi } from 'zustand'

/**
 * 书签 store（Zustand）—— 完整业务版（从旧 Pinia store 等价迁移）
 * --------------------------------------------------------------------------
 * 数据结构：Group(二级分组 children) + Bookmark(locations 多归属) + 回收站(TRASH_GROUP_ID)。
 * 持久化由 utools.db 仓储统一处理，不再依赖 zustand persist。
 */

/**
 * 虚拟视图：列表面板的数据源切换。
 *  - 'all'    全部书签（非回收站全部）
 *  - 'pinned' 置顶（pinned === true）
 *  - 'recent' 最近使用（按 lastUsed 倒序）
 *  - 'group'  跟随当前选中的分组 / 子分组（旧版默认行为）
 * 不参与持久化（partialize 不含 activeView），属于会话级 UI 状态，避免旧数据迁移与 stale 视图。
 */
export type ActiveView = 'all' | 'pinned' | 'recent' | 'group'

export interface BookmarkState {
  groups: Group[]
  bookmarks: Bookmark[]
  search: string
  activeGroupId: string
  activeSubGroupId: string
  activeView: ActiveView
  isReadOnly: boolean
}

export type SetDataPayload = Partial<{
  groups: Group[]
  bookmarks: Bookmark[]
  activeGroupId: string
  activeSubGroupId: string
}>

export interface BookmarkActions {
  // 选择 / 搜索 / 虚拟视图
  setSearch: (value: string) => void
  setActiveView: (view: ActiveView) => void
  setActiveGroup: (groupId: string) => void
  setActiveSubGroup: (subGroupId: string) => void
  setReadOnly: (value: boolean) => void
  selectGroup: (groupId: string, subId?: string) => void
  selectSubGroup: (subId: string) => void
  recordBookmarkUse: (id: string) => void
  ensureValidSelection: (preferredGroupId?: string, preferredSubGroupId?: string) => void
  autoCleanTrash: () => void
  migrateFromLegacy: () => void
  patchBookmarksWithBuiltinSeedIcons: () => void

  // 查询（旧版 getter，作为方法暴露便于 .getState() 调用）
  getBookmarkLocations: (id: string) => BookmarkLocation[]
  isBookmarkInTrash: (bookmark: Bookmark) => boolean

  // 分组
  addGroup: (name: string) => Group
  updateGroup: (id: string, name: string) => void
  removeGroup: (id: string) => boolean
  reorderGroups: (newOrder: Group[]) => void
  findGroupByName: (name: string) => Group | null

  // 子分组
  addSubGroup: (name: string, groupId: string) => SubGroup | null
  updateSubGroup: (groupId: string, subId: string, name: string) => void
  removeSubGroup: (groupId: string, subId: string) => boolean
  reorderSubGroups: (groupId: string, newChildren: SubGroup[]) => void
  moveSubToGroup: (sourceGroupId: string, subId: string, targetGroupId: string) => boolean
  promoteSubToGroup: (sourceGroupId: string, subId: string) => Group | null

  // 书签
  addBookmark: (payload: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>, locations: BookmarkLocation[]) => Bookmark
  updateBookmark: (id: string, updater: Partial<Bookmark>) => void
  updateBookmarkLocations: (bookmarkId: string, newLocations: BookmarkLocation[]) => void
  removeBookmark: (id: string) => void
  removeBookmarkFromLocation: (id: string, groupId: string, subGroupId: string) => void
  restoreBookmark: (id: string) => boolean
  restoreBookmarkFromTrash: (id: string) => boolean
  emptyTrash: () => void
  reorderInSub: (groupId: string, subId: string, fromId: string, toId: string) => void
  moveBookmarkToSubGroup: (
    bookmarkId: string,
    fromGroupId: string,
    fromSubId: string,
    toGroupId: string,
    toSubId: string,
    /** 目标子分组内的插入位置（缺省＝追加到末尾） */
    insertIndex?: number
  ) => boolean
  quickSaveBookmark: (url: string, title?: string, desc?: string) => Bookmark
  getOrCreateQuickCollectGroup: () => { group: Group; subGroup: SubGroup }

  // 图标
  assignIcon: (id: string, icon: IconSource) => void
  refreshSingleIcon: (bookmark: Bookmark) => Promise<void>
  getMissingIconCandidates: (force?: boolean) => Bookmark[]
  countMissingIconCandidates: (force?: boolean) => number
  refreshMissingIcons: (force?: boolean) => Promise<{
    total: number
    matched: number
    remaining: number
    successList: string[]
    failList: { id: string; title: string }[]
  }>
  backfillIconCache: () => Promise<void>

  // 同步调度
  getShareIdsFromLocations: (locations?: BookmarkLocation[]) => string[]
  getShareIdsFromSubGroup: (groupId: string, subId: string) => string[]
  getShareIdsFromGroup: (groupId: string) => string[]
  scheduleBookmarkSync: (
    bookmarkId: string,
    options?: { isDeleted?: boolean; updatedAt?: number; previousShareIds?: string[]; content?: Bookmark | null }
  ) => void
  scheduleGroupSync: (
    groupId: string,
    options?: { isDeleted?: boolean; updatedAt?: number; previousShareIds?: string[]; orderIndex?: number }
  ) => void
  scheduleSubGroupSync: (
    groupId: string,
    subId: string,
    options?: { isDeleted?: boolean; updatedAt?: number; previousShareIds?: string[] }
  ) => void
  syncAllSharedEntities: (updatedAt?: number) => void

  // 快照 / 整体替换
  loadFromSnapshot: (data: { groups: Group[]; bookmarks: Bookmark[] }, readOnly?: boolean) => void
  setData: (state: SetDataPayload) => void
  clearAllBookmarks: () => void
  resetToDefaultBookmarks: () => void
  $patch: (partial: Partial<BookmarkState>) => void
}

export type BookmarkStore = BookmarkState & BookmarkActions

export type ShareAwareGroup = Group & { shareId?: string; sourceShareId?: string; orderIndex?: number }

export type ShareAwareSubGroup = SubGroup & { shareId?: string; sourceShareId?: string; parentGroupId?: string }

export interface BookmarkPersistJob {
  snapshot: BookmarkSnapshot
  serialized: string
}

export type BookmarkSet = StoreApi<BookmarkStore>['setState']
export type BookmarkGet = () => BookmarkStore
export type BookmarkCommit = (groups: Group[], bookmarks: Bookmark[], extra?: Partial<BookmarkState>) => void

export interface BookmarkPersistenceRuntime {
  bookmarkPersistenceStarted: boolean
  bookmarkPersistPromise: Promise<void> | null
  pendingBookmarkPersistJob: BookmarkPersistJob | null
  lastPersistedBookmarkState: string
  bookmarkPersistenceFlushEventsStarted: boolean
  bookmarkPersistTimer: ReturnType<typeof setTimeout> | null
  lastQueuedGroups: Group[] | null
  lastQueuedBookmarks: Bookmark[] | null
  lastQueuedActiveGroupId: string
  lastQueuedActiveSubGroupId: string
}

export interface BookmarkStoreAccess {
  getState: BookmarkGet
  setState: (state: Partial<BookmarkStore>) => void
  subscribe: (listener: (state: BookmarkStore, previous: BookmarkStore) => void) => () => void
}
