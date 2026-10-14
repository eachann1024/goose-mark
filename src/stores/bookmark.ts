import { create } from 'zustand'
import type { Bookmark, Group } from '@/types/bookmark'
import { TRASH_GROUP_ID, uid, parseUrlParams } from '@/stores/bookmarkSeed'
import type { BookmarkState, BookmarkStore, BookmarkPersistJob, BookmarkPersistenceRuntime, BookmarkStoreAccess } from './bookmark/store-types'
export type { ActiveView, BookmarkState, BookmarkActions, BookmarkStore } from './bookmark/store-types'
export { selectCurrentGroup, selectCurrentSubGroup, selectCurrentBookmarks, selectFilteredBookmarks, selectAllBookmarks, selectPinnedBookmarks, selectRecentBookmarks, selectBookmarkLocations } from './bookmark/selectors'
export { TRASH_GROUP_ID, parseUrlParams }
export { uid }
import { createInitialState } from './bookmark/common'
import { createBookmarkPersistence } from './bookmark/persistence'
import { createSelectionActions } from './bookmark/selection-actions'
import { createSnapshotActions } from './bookmark/snapshot-actions'
import { createShareActions } from './bookmark/share-actions'
import { createGroupActions } from './bookmark/group-actions'
import { createSubgroupActions } from './bookmark/subgroup-actions'
import { createSubgroupMoveActions } from './bookmark/subgroup-move-actions'
import { createBookmarkActions } from './bookmark/bookmark-actions'
import { createBookmarkLocationActions } from './bookmark/bookmark-location-actions'
import { createTrashActions } from './bookmark/trash-actions'
import { createQuickCollectActions } from './bookmark/quick-collect-actions'
import { createIconActions } from './bookmark/icon-actions'

export const useBookmarkStore = create<BookmarkStore>()((rawSet, get) => {
  type SetArguments = typeof rawSet extends {
    (...args: infer MergeArguments): void
    (...args: infer ReplaceArguments): void
  } ? MergeArguments | ReplaceArguments : never
  // ponytail: 同步冲突时只阻断书签/分组变更；需要离线编辑时再引入显式冲突副本。
  const set: typeof rawSet = (...args: SetArguments) => {
    const state = get()
    const next = typeof args[0] === 'function' ? args[0](state) : args[0]
    if (state.isReadOnly && next && ('groups' in next || 'bookmarks' in next)) return
    if (args[1] === true) rawSet(next as BookmarkStore, true)
    else rawSet(next, args[1])
  }
  // 在工作副本上原地改写后整体提交，等价旧版 Pinia 的可变 state。
  const commit = (groups: Group[], bookmarks: Bookmark[], extra?: Partial<BookmarkState>) =>
    set({ groups: [...groups], bookmarks: [...bookmarks], ...extra })

  const createSelectionActionsInstance = createSelectionActions(set, get)
  const createSnapshotActionsInstance = createSnapshotActions(set, get)
  const createShareActionsInstance = createShareActions(get)
  const createGroupActionsInstance = createGroupActions(get, commit)
  const createSubgroupActionsInstance = createSubgroupActions(get, commit)
  const createSubgroupMoveActionsInstance = createSubgroupMoveActions(get, commit)
  const createBookmarkActionsInstance = createBookmarkActions(get, commit)
  const createBookmarkLocationActionsInstance = createBookmarkLocationActions(get, commit)
  const createTrashActionsInstance = createTrashActions(get, commit)
  const createQuickCollectActionsInstance = createQuickCollectActions(get, commit)
  const createIconActionsInstance = createIconActions(set, get)
  return {
    ...createInitialState(),
    setSearch: createSelectionActionsInstance.setSearch,
    setActiveView: createSelectionActionsInstance.setActiveView,
    setActiveGroup: createSelectionActionsInstance.setActiveGroup,
    setActiveSubGroup: createSelectionActionsInstance.setActiveSubGroup,
    setReadOnly: createSelectionActionsInstance.setReadOnly,
    selectGroup: createSelectionActionsInstance.selectGroup,
    selectSubGroup: createSelectionActionsInstance.selectSubGroup,
    recordBookmarkUse: createSelectionActionsInstance.recordBookmarkUse,
    ensureValidSelection: createSelectionActionsInstance.ensureValidSelection,
    autoCleanTrash: createTrashActionsInstance.autoCleanTrash,
    patchBookmarksWithBuiltinSeedIcons: createSnapshotActionsInstance.patchBookmarksWithBuiltinSeedIcons,
    migrateFromLegacy: createSnapshotActionsInstance.migrateFromLegacy,
    getBookmarkLocations: createSelectionActionsInstance.getBookmarkLocations,
    isBookmarkInTrash: createSelectionActionsInstance.isBookmarkInTrash,
    getShareIdsFromLocations: createShareActionsInstance.getShareIdsFromLocations,
    getShareIdsFromSubGroup: createShareActionsInstance.getShareIdsFromSubGroup,
    getShareIdsFromGroup: createShareActionsInstance.getShareIdsFromGroup,
    scheduleBookmarkSync: createShareActionsInstance.scheduleBookmarkSync,
    scheduleGroupSync: createShareActionsInstance.scheduleGroupSync,
    scheduleSubGroupSync: createShareActionsInstance.scheduleSubGroupSync,
    addGroup: createGroupActionsInstance.addGroup,
    updateGroup: createGroupActionsInstance.updateGroup,
    addSubGroup: createSubgroupActionsInstance.addSubGroup,
    updateSubGroup: createSubgroupActionsInstance.updateSubGroup,
    reorderGroups: createGroupActionsInstance.reorderGroups,
    reorderSubGroups: createSubgroupActionsInstance.reorderSubGroups,
    findGroupByName: createGroupActionsInstance.findGroupByName,
    removeGroup: createGroupActionsInstance.removeGroup,
    removeSubGroup: createSubgroupActionsInstance.removeSubGroup,
    moveSubToGroup: createSubgroupMoveActionsInstance.moveSubToGroup,
    promoteSubToGroup: createSubgroupMoveActionsInstance.promoteSubToGroup,
    addBookmark: createBookmarkActionsInstance.addBookmark,
    updateBookmark: createBookmarkActionsInstance.updateBookmark,
    updateBookmarkLocations: createBookmarkActionsInstance.updateBookmarkLocations,
    removeBookmark: createTrashActionsInstance.removeBookmark,
    removeBookmarkFromLocation: createBookmarkLocationActionsInstance.removeBookmarkFromLocation,
    restoreBookmark: createTrashActionsInstance.restoreBookmark,
    restoreBookmarkFromTrash: createTrashActionsInstance.restoreBookmarkFromTrash,
    emptyTrash: createTrashActionsInstance.emptyTrash,
    reorderInSub: createBookmarkLocationActionsInstance.reorderInSub,
    moveBookmarkToSubGroup: createBookmarkLocationActionsInstance.moveBookmarkToSubGroup,
    getOrCreateQuickCollectGroup: createQuickCollectActionsInstance.getOrCreateQuickCollectGroup,
    quickSaveBookmark: createQuickCollectActionsInstance.quickSaveBookmark,
    assignIcon: createIconActionsInstance.assignIcon,
    refreshSingleIcon: createIconActionsInstance.refreshSingleIcon,
    getMissingIconCandidates: createIconActionsInstance.getMissingIconCandidates,
    countMissingIconCandidates: createIconActionsInstance.countMissingIconCandidates,
    refreshMissingIcons: createIconActionsInstance.refreshMissingIcons,
    backfillIconCache: createIconActionsInstance.backfillIconCache,
    syncAllSharedEntities: createShareActionsInstance.syncAllSharedEntities,
    loadFromSnapshot: createSnapshotActionsInstance.loadFromSnapshot,
    setData: createSnapshotActionsInstance.setData,
    clearAllBookmarks: createSnapshotActionsInstance.clearAllBookmarks,
    resetToDefaultBookmarks: createSnapshotActionsInstance.resetToDefaultBookmarks,
    $patch: createSnapshotActionsInstance.$patch,
  }
})

let bookmarkPersistenceStarted = false
let bookmarkPersistPromise: Promise<void> | null = null
let pendingBookmarkPersistJob: BookmarkPersistJob | null = null
let lastPersistedBookmarkState = ''
let bookmarkPersistenceFlushEventsStarted = false
let bookmarkPersistTimer: ReturnType<typeof setTimeout> | null = null
let lastQueuedGroups: Group[] | null = null
let lastQueuedBookmarks: Bookmark[] | null = null
let lastQueuedActiveGroupId = ''
let lastQueuedActiveSubGroupId = ''

const runtime: BookmarkPersistenceRuntime = {
  get bookmarkPersistenceStarted() { return bookmarkPersistenceStarted },
  set bookmarkPersistenceStarted(value) { bookmarkPersistenceStarted = value },
  get bookmarkPersistPromise() { return bookmarkPersistPromise },
  set bookmarkPersistPromise(value) { bookmarkPersistPromise = value },
  get pendingBookmarkPersistJob() { return pendingBookmarkPersistJob },
  set pendingBookmarkPersistJob(value) { pendingBookmarkPersistJob = value },
  get lastPersistedBookmarkState() { return lastPersistedBookmarkState },
  set lastPersistedBookmarkState(value) { lastPersistedBookmarkState = value },
  get bookmarkPersistenceFlushEventsStarted() { return bookmarkPersistenceFlushEventsStarted },
  set bookmarkPersistenceFlushEventsStarted(value) { bookmarkPersistenceFlushEventsStarted = value },
  get bookmarkPersistTimer() { return bookmarkPersistTimer },
  set bookmarkPersistTimer(value) { bookmarkPersistTimer = value },
  get lastQueuedGroups() { return lastQueuedGroups },
  set lastQueuedGroups(value) { lastQueuedGroups = value },
  get lastQueuedBookmarks() { return lastQueuedBookmarks },
  set lastQueuedBookmarks(value) { lastQueuedBookmarks = value },
  get lastQueuedActiveGroupId() { return lastQueuedActiveGroupId },
  set lastQueuedActiveGroupId(value) { lastQueuedActiveGroupId = value },
  get lastQueuedActiveSubGroupId() { return lastQueuedActiveSubGroupId },
  set lastQueuedActiveSubGroupId(value) { lastQueuedActiveSubGroupId = value },
}

const store: BookmarkStoreAccess = {
  getState: () => useBookmarkStore.getState(),
  setState: (state) => useBookmarkStore.setState(state),
  subscribe: (listener) => useBookmarkStore.subscribe(listener),
}
const persistence = createBookmarkPersistence(runtime, store)

export const flushBookmarkStorePersistence = persistence.flushBookmarkStorePersistence
export const initializeBookmarkStorePersistence = persistence.initializeBookmarkStorePersistence
