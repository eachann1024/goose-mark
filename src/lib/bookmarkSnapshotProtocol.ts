import type { Bookmark, Group } from '@/types/bookmark'

export const BOOKMARK_SNAPSHOT_SCHEMA_VERSION = 2 as const

export interface BookmarkSnapshotEnvelope {
  schemaVersion: typeof BOOKMARK_SNAPSHOT_SCHEMA_VERSION
  revision: number
  snapshotId: string
  groups: Group[]
  bookmarks: Bookmark[]
  activeGroupId: string
  activeSubGroupId: string
}

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

/** 只包含业务数据；窗口选中态不参与 revision，避免多窗口互相回写。 */
export const bookmarkSnapshotDataFingerprint = (
  snapshot: Pick<BookmarkSnapshotEnvelope, 'groups' | 'bookmarks'>,
): string => JSON.stringify({ groups: snapshot.groups, bookmarks: snapshot.bookmarks })

const chooseConflict = <T>(local: T, remote: T, localStamp: number, remoteStamp: number): T => {
  if (localStamp !== remoteStamp) return localStamp > remoteStamp ? local : remote
  return JSON.stringify(local) >= JSON.stringify(remote) ? local : remote
}

const mergeField = <T>(base: T, local: T, remote: T, localStamp: number, remoteStamp: number): T => {
  if (same(local, remote)) return clone(local)
  if (same(local, base)) return clone(remote)
  if (same(remote, base)) return clone(local)
  return clone(chooseConflict(local, remote, localStamp, remoteStamp))
}

const mergeObjectFields = <T extends { id: string; updatedAt?: number }>(
  base: T | undefined,
  local: T,
  remote: T,
  excluded: ReadonlySet<string> = new Set(),
): T => {
  const localStamp = Number(local.updatedAt) || 0
  const remoteStamp = Number(remote.updatedAt) || 0
  const result: Record<string, unknown> = {}
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])
  keys.forEach((key) => {
    if (excluded.has(key)) return
    result[key] = mergeField(
      (base as Record<string, unknown> | undefined)?.[key],
      (local as unknown as Record<string, unknown>)[key],
      (remote as unknown as Record<string, unknown>)[key],
      localStamp,
      remoteStamp,
    )
  })
  result.id = local.id
  result.updatedAt = Math.max(localStamp, remoteStamp)
  return result as T
}

const mergeBookmarkIds = (base: string[], local: string[], remote: string[]): string[] => {
  if (same(local, remote)) return [...local]
  if (same(local, base)) return [...remote]
  if (same(remote, base)) return [...local]

  const baseSet = new Set(base)
  const localSet = new Set(local)
  const remoteSet = new Set(remote)
  const keptBaseIds = base.filter((id) => localSet.has(id) && remoteSet.has(id))
  const additions = [...local, ...remote].filter((id, index, values) => !baseSet.has(id) && values.indexOf(id) === index)
  const wanted = new Set([...keptBaseIds, ...additions])
  return [...local, ...remote, ...base].filter((id, index, values) => wanted.has(id) && values.indexOf(id) === index)
}

const mergeEntityList = <T extends { id: string; updatedAt?: number }>(
  base: T[],
  local: T[],
  remote: T[],
  mergeBoth: (baseItem: T | undefined, localItem: T, remoteItem: T) => T = mergeObjectFields,
): T[] => {
  const baseById = new Map(base.map((item) => [item.id, item]))
  const localById = new Map(local.map((item) => [item.id, item]))
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const orderedIds = [
    ...remote.map((item) => item.id),
    ...local.map((item) => item.id).filter((id) => !remoteById.has(id)),
  ]

  return orderedIds.flatMap((id) => {
    const baseItem = baseById.get(id)
    const localItem = localById.get(id)
    const remoteItem = remoteById.get(id)
    const localChanged = !same(localItem, baseItem)
    const remoteChanged = !same(remoteItem, baseItem)

    if (localChanged && !remoteChanged) return localItem ? [clone(localItem)] : []
    if (remoteChanged && !localChanged) return remoteItem ? [clone(remoteItem)] : []
    if (!localItem || !remoteItem) return localItem || remoteItem ? [clone((localItem || remoteItem) as T)] : []
    if (!localChanged && !remoteChanged) return [clone(remoteItem)]

    return [mergeBoth(baseItem, localItem, remoteItem)]
  })
}

const mergeSubGroups = (base: Group['children'], local: Group['children'], remote: Group['children']) =>
  mergeEntityList(base, local, remote, (baseItem, localItem, remoteItem) => ({
    ...mergeObjectFields(baseItem, localItem, remoteItem, new Set(['bookmarkIds'])),
    bookmarkIds: mergeBookmarkIds(baseItem?.bookmarkIds || [], localItem.bookmarkIds, remoteItem.bookmarkIds),
  }))

const mergeGroups = (base: Group[], local: Group[], remote: Group[]): Group[] =>
  mergeEntityList(base, local, remote, (baseItem, localItem, remoteItem) => ({
    ...mergeObjectFields(baseItem, localItem, remoteItem, new Set(['children'])),
    children: mergeSubGroups(baseItem?.children || [], localItem.children, remoteItem.children),
  }))

const restoreReferencesForPreservedEdits = (
  groups: Group[],
  base: BookmarkSnapshotEnvelope,
  local: BookmarkSnapshotEnvelope,
  remote: BookmarkSnapshotEnvelope,
): Group[] => {
  const baseBookmarks = new Map(base.bookmarks.map((item) => [item.id, item]))
  const localIds = new Set(local.bookmarks.map((item) => item.id))
  const remoteIds = new Set(remote.bookmarks.map((item) => item.id))
  const referencesToRestore = new Map<string, Array<{ groupId: string; subGroupId: string }>>()

  const collect = (source: BookmarkSnapshotEnvelope, missingFromOtherSide: Set<string>) => {
    source.bookmarks.forEach((item) => {
      if (missingFromOtherSide.has(item.id) || same(item, baseBookmarks.get(item.id))) return
      const locations: Array<{ groupId: string; subGroupId: string }> = []
      source.groups.forEach((group) => group.children.forEach((sub) => {
        if (sub.bookmarkIds.includes(item.id)) locations.push({ groupId: group.id, subGroupId: sub.id })
      }))
      referencesToRestore.set(item.id, locations)
    })
  }
  collect(remote, localIds)
  collect(local, remoteIds)

  const next = clone(groups)
  referencesToRestore.forEach((locations, bookmarkId) => {
    locations.forEach(({ groupId, subGroupId }) => {
      const sub = next.find((item) => item.id === groupId)?.children.find((item) => item.id === subGroupId)
      if (sub && !sub.bookmarkIds.includes(bookmarkId)) sub.bookmarkIds.push(bookmarkId)
    })
  })
  return next
}

export const mergeBookmarkSnapshots = (
  base: BookmarkSnapshotEnvelope,
  local: BookmarkSnapshotEnvelope,
  remote: BookmarkSnapshotEnvelope,
): BookmarkSnapshotEnvelope => {
  const bookmarks = mergeEntityList(base.bookmarks, local.bookmarks, remote.bookmarks)
  const groups = restoreReferencesForPreservedEdits(
    mergeGroups(base.groups, local.groups, remote.groups),
    base,
    local,
    remote,
  )
  return {
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision),
    snapshotId: remote.snapshotId,
    groups,
    bookmarks,
    activeGroupId: local.activeGroupId || remote.activeGroupId,
    activeSubGroupId: local.activeSubGroupId || remote.activeSubGroupId,
  }
}

const unionIds = (primary: string[], secondary: string[]): string[] =>
  [...primary, ...secondary].filter((id, index, values) => values.indexOf(id) === index)

/**
 * 事故恢复专用：原文档是同 ID 的权威内容，同时保留 v2 事故发生后新增的实体和归属。
 */
export const combineRecoveredBookmarkSnapshot = (
  recovered: BookmarkSnapshotEnvelope,
  current: BookmarkSnapshotEnvelope,
): BookmarkSnapshotEnvelope => {
  const currentGroups = new Map(current.groups.map((item) => [item.id, item]))

  const groups = recovered.groups.map((recoveredGroup) => {
    const currentGroup = currentGroups.get(recoveredGroup.id)
    if (!currentGroup) return clone(recoveredGroup)
    const currentChildren = new Map(currentGroup.children.map((item) => [item.id, item]))
    const children = recoveredGroup.children.map((recoveredSub) => {
      const currentSub = currentChildren.get(recoveredSub.id)
      return currentSub
        ? { ...clone(recoveredSub), bookmarkIds: unionIds(recoveredSub.bookmarkIds, currentSub.bookmarkIds) }
        : clone(recoveredSub)
    })
    currentGroup.children.forEach((currentSub) => {
      if (!children.some((item) => item.id === currentSub.id)) children.push(clone(currentSub))
    })
    return { ...clone(recoveredGroup), children }
  })
  current.groups.forEach((currentGroup) => {
    if (!groups.some((item) => item.id === currentGroup.id)) groups.push(clone(currentGroup))
  })

  const bookmarks = recovered.bookmarks.map((item) => clone(item))
  current.bookmarks.forEach((currentBookmark) => {
    if (bookmarks.some((item) => item.id === currentBookmark.id)) return
    bookmarks.push(clone(currentBookmark))
  })

  return {
    schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
    revision: current.revision,
    snapshotId: current.snapshotId,
    groups,
    bookmarks,
    activeGroupId: recovered.activeGroupId || current.activeGroupId,
    activeSubGroupId: recovered.activeSubGroupId || current.activeSubGroupId,
  }
}

const isFiniteTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const hasValidCurrentDataShape = (value: Partial<BookmarkSnapshotEnvelope>): value is BookmarkSnapshotEnvelope => {
  if (!Array.isArray(value.groups) || value.groups.length === 0 || !Array.isArray(value.bookmarks)) return false

  const groupIds = new Set<string>()
  const subGroupIds = new Set<string>()
  for (const group of value.groups) {
    if (
      !group ||
      typeof group.id !== 'string' || !group.id || groupIds.has(group.id) ||
      typeof group.name !== 'string' ||
      !isFiniteTimestamp(group.createdAt) || !isFiniteTimestamp(group.updatedAt) ||
      !Array.isArray(group.children)
    ) return false
    groupIds.add(group.id)
    for (const sub of group.children) {
      if (
        !sub ||
        typeof sub.id !== 'string' || !sub.id || subGroupIds.has(sub.id) ||
        typeof sub.name !== 'string' ||
        !isFiniteTimestamp(sub.createdAt) || !isFiniteTimestamp(sub.updatedAt) ||
        !Array.isArray(sub.bookmarkIds) || sub.bookmarkIds.some((id) => typeof id !== 'string')
      ) return false
      subGroupIds.add(sub.id)
    }
  }

  const bookmarkIds = new Set<string>()
  for (const bookmark of value.bookmarks) {
    if (
      !bookmark ||
      typeof bookmark.id !== 'string' || !bookmark.id || bookmarkIds.has(bookmark.id) ||
      typeof bookmark.title !== 'string' || typeof bookmark.url !== 'string' ||
      !Array.isArray(bookmark.tags) || bookmark.tags.some((tag) => typeof tag !== 'string') ||
      !isFiniteTimestamp(bookmark.createdAt) || !isFiniteTimestamp(bookmark.updatedAt)
    ) return false
    bookmarkIds.add(bookmark.id)
  }

  return value.groups.every((group) => group.children.every((sub) =>
    sub.bookmarkIds.every((id) => bookmarkIds.has(id)),
  ))
}

export const parseBookmarkSnapshotEnvelope = (raw: string): BookmarkSnapshotEnvelope | null => {
  try {
    const value = JSON.parse(raw) as Partial<BookmarkSnapshotEnvelope>
    if (
      !value ||
      value.schemaVersion !== BOOKMARK_SNAPSHOT_SCHEMA_VERSION ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 1 ||
      typeof value.snapshotId !== 'string' ||
      value.snapshotId.length === 0 ||
      !hasValidCurrentDataShape(value) ||
      typeof value.activeGroupId !== 'string' ||
      typeof value.activeSubGroupId !== 'string'
    ) {
      return null
    }
    return clone(value as BookmarkSnapshotEnvelope)
  } catch {
    return null
  }
}
