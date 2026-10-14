import { patchBookmarksWithBuiltinSeedIcons } from '@/stores/bookmarkSeed'
import { emitStorageSync, isUToolsDbAvailable } from '@/lib/utoolsDb'
import { loadBookmarkSnapshot, saveBookmarkSnapshot, type BookmarkSnapshot } from '@/lib/stateRepository'
import type { BookmarkStore, BookmarkPersistenceRuntime, BookmarkStoreAccess } from './store-types'
import { clone } from './common'

const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
const BOOKMARK_PERSIST_DEBOUNCE_MS = 120

export function createBookmarkPersistence(runtime: BookmarkPersistenceRuntime, store: BookmarkStoreAccess) {
  const pickBookmarkSnapshot = (state: BookmarkStore): BookmarkSnapshot => ({
    groups: clone(state.groups),
    bookmarks: clone(state.bookmarks),
    activeGroupId: state.activeGroupId,
    activeSubGroupId: state.activeSubGroupId
  })

  const queueBookmarkPersistJob = (state: BookmarkStore, force = false): boolean => {
    if (!isUToolsDbAvailable()) return false
    if (
      !force &&
      state.groups === runtime.lastQueuedGroups &&
      state.bookmarks === runtime.lastQueuedBookmarks &&
      state.activeGroupId === runtime.lastQueuedActiveGroupId &&
      state.activeSubGroupId === runtime.lastQueuedActiveSubGroupId
    ) {
      return false
    }
    runtime.lastQueuedGroups = state.groups
    runtime.lastQueuedBookmarks = state.bookmarks
    runtime.lastQueuedActiveGroupId = state.activeGroupId
    runtime.lastQueuedActiveSubGroupId = state.activeSubGroupId
    const snapshot = pickBookmarkSnapshot(state)
    const serialized = JSON.stringify(snapshot)
    if (serialized === runtime.lastPersistedBookmarkState && !runtime.pendingBookmarkPersistJob) return false
    runtime.pendingBookmarkPersistJob = { snapshot, serialized }
    return true
  }

  const drainBookmarkPersistQueue = (): Promise<void> => {
    if (runtime.bookmarkPersistPromise) return runtime.bookmarkPersistPromise

    runtime.bookmarkPersistPromise = (async () => {
      while (runtime.pendingBookmarkPersistJob) {
        const job = runtime.pendingBookmarkPersistJob
        runtime.pendingBookmarkPersistJob = null
        if (job.serialized === runtime.lastPersistedBookmarkState) continue

        const written = await saveBookmarkSnapshot(job.snapshot)
        runtime.lastPersistedBookmarkState = job.serialized
        if (written.dataChanged) emitStorageSync('bookmark', written.serialized)
      }
    })()
      .catch((error) => {
        console.error('[bookmark] 保存失败:', error)
        throw error
      })
      .finally(() => {
        runtime.bookmarkPersistPromise = null
        if (runtime.pendingBookmarkPersistJob && runtime.pendingBookmarkPersistJob.serialized !== runtime.lastPersistedBookmarkState) {
          drainBookmarkPersistQueueInBackground()
        }
      })

    return runtime.bookmarkPersistPromise
  }

  const drainBookmarkPersistQueueInBackground = () => {
    void drainBookmarkPersistQueue().catch(error => console.error('[bookmark] 后台保存失败:', error))
  }

  const enqueueBookmarkPersist = (state: BookmarkStore): void => {
    if (!queueBookmarkPersistJob(state)) return
    if (runtime.bookmarkPersistTimer) clearTimeout(runtime.bookmarkPersistTimer)
    runtime.bookmarkPersistTimer = setTimeout(() => {
      runtime.bookmarkPersistTimer = null
      drainBookmarkPersistQueueInBackground()
    }, BOOKMARK_PERSIST_DEBOUNCE_MS)
  }

  const flushBookmarkStorePersistence = async (): Promise<void> => {
    if (runtime.bookmarkPersistTimer) {
      clearTimeout(runtime.bookmarkPersistTimer)
      runtime.bookmarkPersistTimer = null
    }
    queueBookmarkPersistJob(store.getState(), true)
    await drainBookmarkPersistQueue()
  }

  const bindBookmarkPersistenceFlushEvents = (): void => {
    if (runtime.bookmarkPersistenceFlushEventsStarted || typeof window === 'undefined') return
    runtime.bookmarkPersistenceFlushEventsStarted = true

    const flush = () => {
      void flushBookmarkStorePersistence().catch(error => console.error('[bookmark] 事件保存失败:', error))
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, flush)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flushWhenHidden)
  }

  const initializeBookmarkStorePersistence = async (): Promise<void> => {
    if (runtime.bookmarkPersistenceStarted) return
    runtime.bookmarkPersistenceStarted = true

    const persisted = await loadBookmarkSnapshot()
    if (persisted) {
      const patched = patchBookmarksWithBuiltinSeedIcons(persisted.bookmarks).bookmarks
      store.setState({
        groups: persisted.groups,
        bookmarks: patched,
        activeGroupId: persisted.activeGroupId,
        activeSubGroupId: persisted.activeSubGroupId
      })
    }

    store.getState().migrateFromLegacy()
    store.getState().patchBookmarksWithBuiltinSeedIcons()
    store.getState().ensureValidSelection()

    if (!isUToolsDbAvailable()) return

    store.subscribe((state) => {
      enqueueBookmarkPersist(state)
    })
    bindBookmarkPersistenceFlushEvents()
    runtime.lastPersistedBookmarkState = ''
    enqueueBookmarkPersist(store.getState())
  }

  return { initializeBookmarkStorePersistence, flushBookmarkStorePersistence }
}
