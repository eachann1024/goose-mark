import { patchBookmarksWithBuiltinSeedIcons } from '@/stores/bookmarkSeed'
import { emitStorageSync, isUToolsDbAvailable } from '@/lib/utoolsDb'
import { clearBookmarkBootCache, readBookmarkBootCache, scheduleBookmarkBootCacheWrite } from '@/lib/bootSnapshotCache'
import { BookmarkAccountChangedError, BookmarkSyncConflictError, isBookmarkMigrationPending, loadBookmarkSnapshot, saveBookmarkSnapshot, warmAttachmentDataUrlCache, type BookmarkSnapshot } from '@/lib/stateRepository'
import { assertBookmarkIntegrity, BookmarkDataPendingError, migrateLegacyBookmarkLocations } from '@/lib/bookmarkIntegrity'
import { mergeBookmarkSnapshots } from '@/lib/mergeBookmarkSnapshots'
import { clearSavedBookmarkRecovery, preserveBookmarkRecovery, scheduleBookmarkCheckpoint } from '@/lib/bookmarkRecovery'
import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'
import type { BookmarkStore, BookmarkPersistenceRuntime, BookmarkStoreAccess } from './store-types'
import { clone } from './common'

const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
const BOOKMARK_PERSIST_DEBOUNCE_MS = 120
const BOOKMARK_SELECTION_DEBOUNCE_MS = 1000
const BOOKMARK_SELECTION_KEY = 'goose-marks.bookmark-selection'
const FRESH_LOAD_ENTER_SKIP_MS = 1500

const stripLocalUsage = (bookmarks: BookmarkSnapshot['bookmarks']) =>
  bookmarks.map(({ visits: _visits, lastUsed: _lastUsed, ...rest }) => rest)

const serializeSyncedContent = (snapshot: Pick<BookmarkSnapshot, 'groups' | 'bookmarks'>): string =>
  JSON.stringify([snapshot.groups, stripLocalUsage(snapshot.bookmarks)])

export function createBookmarkPersistence(runtime: BookmarkPersistenceRuntime, store: BookmarkStoreAccess) {
  let applyingRemote = false
  let refreshRequested = false
  let refreshing: Promise<void> | null = null
  let acceptedSnapshot: BookmarkSnapshot | null = null
  let conflictPaused = false
  let refreshBlocked = false
  let startupMigrationPending = false
  let refreshRetry: ReturnType<typeof setTimeout> | null = null
  let selectionTimer: ReturnType<typeof setTimeout> | null = null
  let contentDirty = false
  let lastSelection = ''
  let lastSyncedContent = ''
  let lastSnapshotLoadedAt = 0
  let bootCacheHydrated = false
  let bootInitialActiveGroupId = ''
  let bootInitialActiveSubGroupId = ''
  let hydrated = false
  let resolveHydrated: () => void = () => {}
  const hydratedPromise = new Promise<void>((resolve) => {
    resolveHydrated = resolve
  })
  const markHydrated = () => {
    if (hydrated) return
    hydrated = true
    resolveHydrated()
  }
  const persistSelection = () => {
    if (selectionTimer) clearTimeout(selectionTimer)
    selectionTimer = null
    if (!isUToolsDbAvailable()) return
    const { activeGroupId, activeSubGroupId } = store.getState()
    const value = JSON.stringify({ activeGroupId, activeSubGroupId })
    if (value === lastSelection) return
    if (utoolsStorage.setItem(BOOKMARK_SELECTION_KEY, value) === false) return
    if (getPersistentItem(BOOKMARK_SELECTION_KEY) === value) lastSelection = value
  }
  const loadStableSnapshot = async (allowIncomplete = false) => {
    for (let attempt = 0; ; attempt++) {
      try { return await loadBookmarkSnapshot(allowIncomplete) }
      catch (error) {
        if (attempt >= 2 || error instanceof BookmarkAccountChangedError) throw error
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
      }
    }
  }
  const sameContent = (a: BookmarkSnapshot, b: BookmarkSnapshot) =>
    serializeSyncedContent(a) === serializeSyncedContent(b)

  const pausePersistence = (error: unknown) => {
    conflictPaused = true
    if (error instanceof BookmarkAccountChangedError) clearBookmarkBootCache()
    if (refreshRetry) clearTimeout(refreshRetry)
    refreshRetry = null
    runtime.pendingBookmarkPersistJob = null
    if (runtime.bookmarkPersistTimer) clearTimeout(runtime.bookmarkPersistTimer)
    runtime.bookmarkPersistTimer = null
    if (selectionTimer) clearTimeout(selectionTimer)
    selectionTimer = null
    // 保留当前可导出的内存内容，绝不把失败标记为已保存，也不重试覆盖最新版本。
    store.setState({ isReadOnly: true })
    let recoveryMessage = '已保留本机恢复副本；请先导出当前编辑，再重新打开应用。'
    try { preserveBookmarkRecovery(pickBookmarkSnapshot(store.getState())) }
    catch { recoveryMessage = '本机恢复副本写入失败，请勿关闭应用，立即导出完整备份。' }
    console.error('[bookmark] 已暂停写入:', error)
    window.utools?.showNotification?.(`${error instanceof BookmarkAccountChangedError ? error.message : '书签同步或保存出现冲突，已暂停写入。'}${recoveryMessage}`)
  }
  const pickBookmarkSnapshot = (state: BookmarkStore): BookmarkSnapshot => ({
    groups: clone(state.groups),
    bookmarks: clone(state.bookmarks),
    activeGroupId: state.activeGroupId,
    activeSubGroupId: state.activeSubGroupId
  })

  const queueBookmarkPersistJob = (state: BookmarkStore, force = false): boolean => {
    if (!runtime.bookmarkPersistenceStarted || applyingRemote || state.isReadOnly || !isUToolsDbAvailable()) return false
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
    if (serialized === runtime.lastPersistedBookmarkState && !runtime.pendingBookmarkPersistJob && !runtime.bookmarkPersistPromise) return false
    if (runtime.pendingBookmarkPersistJob?.serialized === serialized) return false
    try { preserveBookmarkRecovery(snapshot) }
    catch (error) { pausePersistence(error); return false }
    if (refreshing || refreshBlocked) return false
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

        const { activeGroupId, activeSubGroupId } = store.getState()
        let snapshot = { ...job.snapshot, activeGroupId, activeSubGroupId }
        let written
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            written = await saveBookmarkSnapshot(snapshot)
            break
          } catch (error) {
            if (!(error instanceof BookmarkSyncConflictError) || attempt === 2 || !acceptedSnapshot) throw error
            const remote = await loadStableSnapshot()
            if (!remote) throw error
            try { snapshot = mergeBookmarkSnapshots(acceptedSnapshot, snapshot, remote) }
            catch (conflict) {
              preserveBookmarkRecovery(acceptedSnapshot, 'conflict')
              preserveBookmarkRecovery(snapshot, 'conflict')
              preserveBookmarkRecovery(remote, 'conflict')
              throw conflict
            }
            scheduleBookmarkCheckpoint(remote)
            acceptedSnapshot = clone(remote)
          }
        }
        if (!written) throw new BookmarkSyncConflictError()
        scheduleBookmarkCheckpoint(snapshot)
        scheduleBookmarkBootCacheWrite(snapshot)
        acceptedSnapshot = clone(snapshot)
        lastSyncedContent = serializeSyncedContent(snapshot)
        lastSnapshotLoadedAt = Date.now()
        runtime.lastPersistedBookmarkState = JSON.stringify(snapshot)
        // 保存期间仍可发生本机编辑，合并这些增量，不能直接用落盘快照覆盖当前界面。
        let current
        try { current = mergeBookmarkSnapshots(job.snapshot, pickBookmarkSnapshot(store.getState()), snapshot) }
        catch (error) {
          preserveBookmarkRecovery(snapshot, 'conflict')
          preserveBookmarkRecovery(pickBookmarkSnapshot(store.getState()), 'conflict')
          throw error
        }
        applyingRemote = true
        try {
          store.setState(current)
          store.getState().ensureValidSelection()
        } finally { applyingRemote = false }
        runtime.pendingBookmarkPersistJob = null
        const latest = store.getState()
        contentDirty = !sameContent(latest, snapshot)
        if (contentDirty) queueBookmarkPersistJob(latest, true)
        else {
          runtime.lastQueuedGroups = latest.groups
          runtime.lastQueuedBookmarks = latest.bookmarks
          lastSyncedContent = serializeSyncedContent(latest)
        }
        if (written.dataChanged) emitStorageSync('bookmark', written.serialized)
      }
      if (!store.getState().isReadOnly && !contentDirty && !runtime.pendingBookmarkPersistJob) clearSavedBookmarkRecovery()
    })()
      .catch((error) => {
        pausePersistence(error)
        console.error('[bookmark] 保存失败:', error)
        throw error
      })
      .finally(() => {
        runtime.bookmarkPersistPromise = null
        if (runtime.pendingBookmarkPersistJob && runtime.pendingBookmarkPersistJob.serialized !== runtime.lastPersistedBookmarkState) {
          drainBookmarkPersistQueueInBackground()
        } else if (refreshRequested) {
          void refreshBookmarkSnapshot()
        }
      })

    return runtime.bookmarkPersistPromise
  }

  const drainBookmarkPersistQueueInBackground = () => {
    void drainBookmarkPersistQueue().catch(error => console.error('[bookmark] 后台保存失败:', error))
  }

  const enqueueBookmarkPersist = (state: BookmarkStore): void => {
    if (!runtime.bookmarkPersistenceStarted || applyingRemote || !isUToolsDbAvailable()) return
    const refChanged = state.groups !== runtime.lastQueuedGroups || state.bookmarks !== runtime.lastQueuedBookmarks
    if (state.activeGroupId !== runtime.lastQueuedActiveGroupId || state.activeSubGroupId !== runtime.lastQueuedActiveSubGroupId) {
      runtime.lastQueuedActiveGroupId = state.activeGroupId
      runtime.lastQueuedActiveSubGroupId = state.activeSubGroupId
      if (selectionTimer) clearTimeout(selectionTimer)
      selectionTimer = setTimeout(persistSelection, BOOKMARK_SELECTION_DEBOUNCE_MS)
    }
    if (state.isReadOnly) return
    if (!refChanged) {
      return
    }
    // visits / lastUsed 由 bookmarkUsage 按设备独立落库；仅本地使用计数变化时不触发整库快照写与 3.7MB 恢复文件落盘。
    const nextSyncedContent = serializeSyncedContent(state)
    if (!contentDirty && nextSyncedContent === lastSyncedContent) {
      runtime.lastQueuedGroups = state.groups
      runtime.lastQueuedBookmarks = state.bookmarks
      return
    }
    contentDirty = true
    if (!queueBookmarkPersistJob(state)) return
    if (runtime.bookmarkPersistTimer) clearTimeout(runtime.bookmarkPersistTimer)
    runtime.bookmarkPersistTimer = setTimeout(() => {
      runtime.bookmarkPersistTimer = null
      drainBookmarkPersistQueueInBackground()
    }, BOOKMARK_PERSIST_DEBOUNCE_MS)
  }

  const flushBookmarkStorePersistence = async (): Promise<void> => {
    persistSelection()
    if (refreshing) await refreshing
    if (store.getState().isReadOnly || refreshBlocked) throw new Error('书签写入暂时停止，本机编辑已保留，请查看同步通知。')
    if (runtime.bookmarkPersistTimer) {
      clearTimeout(runtime.bookmarkPersistTimer)
      runtime.bookmarkPersistTimer = null
    }
    if (contentDirty && !runtime.pendingBookmarkPersistJob && !runtime.bookmarkPersistPromise) queueBookmarkPersistJob(store.getState(), true)
    if (store.getState().isReadOnly) throw new Error('本机恢复副本未能写入，已停止保存。')
    if (runtime.pendingBookmarkPersistJob || runtime.bookmarkPersistPromise) await drainBookmarkPersistQueue()
  }

  const refreshBookmarkSnapshot = (): Promise<void> => {
    refreshRequested = true
    if (refreshing) return refreshing
    if (runtime.bookmarkPersistPromise) return runtime.bookmarkPersistPromise
    if (conflictPaused) return Promise.resolve()
    if (refreshRetry) clearTimeout(refreshRetry)
    refreshRetry = null
    if (runtime.bookmarkPersistTimer) clearTimeout(runtime.bookmarkPersistTimer)
    runtime.bookmarkPersistTimer = null
    runtime.pendingBookmarkPersistJob = null
    refreshing = (async () => {
      while (refreshRequested && !conflictPaused) {
        refreshRequested = false
        const retryStartupMigration = startupMigrationPending
        let persisted = await loadStableSnapshot(retryStartupMigration)
        if (!persisted) {
          if (retryStartupMigration) throw new BookmarkDataPendingError()
          return
        }
        if (retryStartupMigration) {
          if (isBookmarkMigrationPending()) {
            preserveBookmarkRecovery(persisted, 'checkpoint')
            persisted = migrateLegacyBookmarkLocations(persisted)
            preserveBookmarkRecovery(persisted)
            await saveBookmarkSnapshot(persisted)
            clearSavedBookmarkRecovery()
          } else {
            // 等待期间其他窗口可能已升级；新版快照仍须通过严格校验。
            assertBookmarkIntegrity(persisted)
          }
        }
        const current = pickBookmarkSnapshot(store.getState())
        let merged
        try {
          // 启动未齐时的内存内容从未允许编辑，不能合并回已完整/已迁移的快照。
          merged = !retryStartupMigration && acceptedSnapshot ? mergeBookmarkSnapshots(acceptedSnapshot, current, persisted) : persisted
          assertBookmarkIntegrity(merged)
        } catch (error) {
          if (acceptedSnapshot) preserveBookmarkRecovery(acceptedSnapshot, 'conflict')
          preserveBookmarkRecovery(current, 'conflict')
          preserveBookmarkRecovery(persisted, 'conflict')
          throw error
        }
        scheduleBookmarkCheckpoint(persisted)
        scheduleBookmarkBootCacheWrite(merged)
        contentDirty = !sameContent(merged, persisted)
        if (contentDirty) preserveBookmarkRecovery(merged)
        refreshBlocked = false
        startupMigrationPending = false
        acceptedSnapshot = clone(persisted)
        lastSyncedContent = serializeSyncedContent(persisted)
        lastSnapshotLoadedAt = Date.now()
        runtime.lastPersistedBookmarkState = JSON.stringify({ ...persisted, activeGroupId: current.activeGroupId, activeSubGroupId: current.activeSubGroupId })
        applyingRemote = true
        try {
          store.setState({ ...merged, isReadOnly: false })
          store.getState().ensureValidSelection(current.activeGroupId, current.activeSubGroupId)
        } finally {
          applyingRemote = false
        }
      }
    })().catch(error => {
      if (error instanceof BookmarkSyncConflictError || error instanceof BookmarkAccountChangedError) { pausePersistence(error); return }
      // 分批到达、临时读取/备份失败不能变成永久冲突；保留当前界面并自动重读。
      if (!refreshBlocked) window.utools?.showNotification?.('正在等待完整书签数据，暂时停止编辑，恢复后会自动继续。')
      refreshBlocked = true
      store.setState({ isReadOnly: true })
      refreshRetry = setTimeout(() => { void refreshBookmarkSnapshot() }, 2000)
      console.warn('[bookmark] 等待同步重试:', error)
    }).finally(() => {
      refreshing = null
      runtime.pendingBookmarkPersistJob = null
      if (!store.getState().isReadOnly) {
        if (contentDirty && queueBookmarkPersistJob(store.getState(), true)) drainBookmarkPersistQueueInBackground()
        else if (!contentDirty) {
          runtime.lastQueuedGroups = store.getState().groups
          runtime.lastQueuedBookmarks = store.getState().bookmarks
          lastSyncedContent = serializeSyncedContent(store.getState())
        }
      }
    })
    return refreshing
  }

  const bindBookmarkPersistenceFlushEvents = (): void => {
    if (runtime.bookmarkPersistenceFlushEventsStarted || typeof window === 'undefined') return
    runtime.bookmarkPersistenceFlushEventsStarted = true

    const flush = (event?: Event) => {
      if (contentDirty || runtime.bookmarkPersistPromise || runtime.pendingBookmarkPersistJob) {
        // 退出时不能依赖异步 host 写入完成；同步/保存途中也先同步保留本机副本。
        try { preserveBookmarkRecovery(pickBookmarkSnapshot(store.getState())) }
        catch (error) {
          console.error('[bookmark] 退出前备份失败:', error)
          window.utools?.showNotification?.('未保存编辑的本机备份失败，请勿关闭应用，请立即导出完整备份。')
          if (event?.type === 'beforeunload') {
            event.preventDefault()
            ;(event as BeforeUnloadEvent).returnValue = ''
          }
        }
      }
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

  const hydrateBookmarkStoreFromBootCache = (): boolean => {
    if (bootCacheHydrated || runtime.bookmarkPersistenceStarted) return false
    bootCacheHydrated = true
    const cached = readBookmarkBootCache()
    if (!cached) return false

    warmAttachmentDataUrlCache(cached.bookmarks)
    const patched = patchBookmarksWithBuiltinSeedIcons(cached.bookmarks).bookmarks
    store.setState({
      groups: cached.groups,
      bookmarks: patched,
      activeGroupId: cached.activeGroupId,
      activeSubGroupId: cached.activeSubGroupId
    })
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage?.getItem?.(BOOKMARK_SELECTION_KEY) : null
      if (raw) {
        const saved = JSON.parse(raw)
        const group = store.getState().groups.find(g => g.id === saved?.activeGroupId)
        if (group?.children.some(sub => sub.id === saved?.activeSubGroupId)) {
          store.setState({ activeGroupId: saved.activeGroupId, activeSubGroupId: saved.activeSubGroupId })
        }
      }
    } catch {}
    store.getState().ensureValidSelection()
    bootInitialActiveGroupId = store.getState().activeGroupId
    bootInitialActiveSubGroupId = store.getState().activeSubGroupId
    return true
  }

  const initializeBookmarkStorePersistence = async (): Promise<void> => {
    if (runtime.bookmarkPersistenceStarted) {
      markHydrated()
      return
    }
    try {
      const userSelectedBeforeReady =
        bootCacheHydrated &&
        (store.getState().activeGroupId !== bootInitialActiveGroupId ||
          store.getState().activeSubGroupId !== bootInitialActiveSubGroupId)
          ? {
              activeGroupId: store.getState().activeGroupId,
              activeSubGroupId: store.getState().activeSubGroupId
            }
          : null

      // 恢复文件可能属于旧账号、旧窗口或包含坏数据，绝不自动替换当前数据库。
      const persisted = await loadStableSnapshot(true)
      if (persisted) {
        // 在任何迁移、默认字段补齐之前保留原始快照，数据库基线仍由 repository 保持。
        if (isBookmarkMigrationPending()) preserveBookmarkRecovery(persisted, 'checkpoint')
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
      if (userSelectedBeforeReady) {
        store.getState().ensureValidSelection(
          userSelectedBeforeReady.activeGroupId,
          userSelectedBeforeReady.activeSubGroupId
        )
      } else {
        try {
          const raw = getPersistentItem(BOOKMARK_SELECTION_KEY)
          if (raw) {
            const saved = JSON.parse(raw)
            const group = store.getState().groups.find(g => g.id === saved?.activeGroupId)
            if (group?.children.some(sub => sub.id === saved?.activeSubGroupId)) {
              store.setState({ activeGroupId: saved.activeGroupId, activeSubGroupId: saved.activeSubGroupId })
              lastSelection = raw
            }
          }
        } catch { /* 损坏的选择记录回退到快照选择。 */ }
        store.getState().ensureValidSelection()
      }

      const postInitSnapshot = pickBookmarkSnapshot(store.getState())
      if (!isUToolsDbAvailable()) {
        scheduleBookmarkBootCacheWrite(postInitSnapshot)
        return
      }
      scheduleBookmarkCheckpoint(postInitSnapshot)
      try {
        if (isBookmarkMigrationPending()) {
          preserveBookmarkRecovery(postInitSnapshot, 'checkpoint')
          store.setState(migrateLegacyBookmarkLocations(postInitSnapshot))
        }
        assertBookmarkIntegrity(pickBookmarkSnapshot(store.getState()))
      }
      catch (error) {
        if (!(error instanceof BookmarkDataPendingError)) throw error
        refreshBlocked = true
        startupMigrationPending = isBookmarkMigrationPending()
        store.setState({ isReadOnly: true })
      }

      if (isBookmarkMigrationPending() && !refreshBlocked) {
        try {
          preserveBookmarkRecovery(pickBookmarkSnapshot(store.getState()))
          await saveBookmarkSnapshot(pickBookmarkSnapshot(store.getState()))
          clearSavedBookmarkRecovery()
        }
        catch (error) { pausePersistence(error) }
      }

      runtime.bookmarkPersistenceStarted = true
      const readySnapshot = pickBookmarkSnapshot(store.getState())
      if (!refreshBlocked && !store.getState().isReadOnly) {
        scheduleBookmarkBootCacheWrite(readySnapshot)
      }
      // 初始化、补默认字段和选择修正不构成用户编辑；打开旧设备不能触发整库写回。
      runtime.lastPersistedBookmarkState = JSON.stringify(readySnapshot)
      acceptedSnapshot = readySnapshot
      lastSyncedContent = serializeSyncedContent(readySnapshot)
      lastSnapshotLoadedAt = Date.now()
      runtime.lastQueuedGroups = store.getState().groups
      runtime.lastQueuedBookmarks = store.getState().bookmarks
      runtime.lastQueuedActiveGroupId = store.getState().activeGroupId
      runtime.lastQueuedActiveSubGroupId = store.getState().activeSubGroupId

      store.subscribe((state) => {
        enqueueBookmarkPersist(state)
      })
      bindBookmarkPersistenceFlushEvents()
      window.utools?.onDbPull?.((docs) => {
        if (docs.some(doc => doc._id?.startsWith('gm:bookmark:') || doc._id?.startsWith('gm:group:') || doc._id?.startsWith('gm:icon/') || doc._id === 'gm:meta:bookmark')) {
          void refreshBookmarkSnapshot()
        }
      })
      window.addEventListener('storage-sync', (event) => {
        if ((event as CustomEvent<{ key: string }>).detail?.key === 'bookmark') void refreshBookmarkSnapshot()
      })
      window.addEventListener('goose-marks:plugin-enter', () => {
        // 冷启动刚读完最新快照时，避免 preload 回放的同一次 plugin-enter 立即重复扫描整库。
        if (!refreshBlocked && !refreshRequested && Date.now() - lastSnapshotLoadedAt < FRESH_LOAD_ENTER_SKIP_MS) return
        void refreshBookmarkSnapshot()
      })
      if (refreshBlocked) {
        refreshRetry = setTimeout(() => { void refreshBookmarkSnapshot() }, 1000)
      }
    } finally {
      markHydrated()
    }
  }

  return {
    initializeBookmarkStorePersistence,
    flushBookmarkStorePersistence,
    hydrateBookmarkStoreFromBootCache,
    isBookmarkStoreHydrated: () => hydrated,
    whenBookmarkStoreHydrated: () => hydratedPromise
  }
}
