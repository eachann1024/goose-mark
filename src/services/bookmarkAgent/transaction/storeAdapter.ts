import { toBookmarkAiJsonValue, type BookmarkAiJsonValue } from '@/lib/bookmarkAiMessages'
import { TRASH_GROUP_ID, useBookmarkStore } from '@/stores/bookmark'
import type { Bookmark, BookmarkLocation, Group, SubGroup } from '@/types/bookmark'
import type {
  BookmarkTransactionAdapter,
  BookmarkTransactionEntityRef,
  BookmarkTransactionEntityState,
  BookmarkTransactionOperation
} from './types'

export type BookmarkMutationAction =
  | { type: 'createBookmark'; url: string; title: string; desc: string; tags: string[]; groupId?: string; subGroupId?: string }
  | { type: 'updateBookmark'; bookmarkId: string; title?: string; desc?: string; tags?: string[] }
  | { type: 'setBookmarkLocations'; bookmarkId: string; locations: BookmarkLocation[] }
  | { type: 'createGroup'; name: string }
  | { type: 'renameGroup'; groupId: string; name: string }
  | { type: 'deleteGroup'; groupId: string }
  | { type: 'createSubGroup'; groupId: string; name: string }
  | { type: 'renameSubGroup'; groupId: string; subGroupId: string; name: string }
  | { type: 'deleteSubGroup'; groupId: string; subGroupId: string }

type OperationPayload = {
  action: BookmarkMutationAction
  createdBookmarkId?: string
  createdGroupId?: string
  createdSubGroupId?: string
  resolvedLocations?: BookmarkLocation[]
  ensureGroup?: { groupId: string; subGroupId: string; createGroup: boolean; createSubGroup: boolean }
}

type UndoSnapshot = {
  ref: BookmarkTransactionEntityRef
  state: BookmarkTransactionEntityState | null
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function stableId(proposalId: string, index: number, suffix: string) {
  const compact = proposalId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(-80)
  return `agent-${compact}-${index}-${suffix}`
}

function refKey(ref: BookmarkTransactionEntityRef) {
  return `${ref.type}:${ref.parentId ?? ''}:${ref.id}`
}

function uniqueRefs(refs: BookmarkTransactionEntityRef[]) {
  return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()]
}

function locationRefs(locations: BookmarkLocation[]) {
  return locations.flatMap((location): BookmarkTransactionEntityRef[] => [
    { type: 'group', id: location.groupId },
    { type: 'subGroup', id: location.subGroupId, parentId: location.groupId }
  ])
}

function trashRefs(): BookmarkTransactionEntityRef[] {
  return [
    { type: 'group', id: TRASH_GROUP_ID },
    { type: 'subGroup', id: 'sg-trash', parentId: TRASH_GROUP_ID }
  ]
}

function payloadRecord(operation: BookmarkTransactionOperation): OperationPayload {
  return operation.payload as unknown as OperationPayload
}

function jsonPayload(value: unknown): BookmarkAiJsonValue {
  const json = toBookmarkAiJsonValue(value)
  if (json === undefined) throw new Error('事务 payload 无法序列化')
  return json
}

function readEntity(ref: BookmarkTransactionEntityRef): BookmarkTransactionEntityState | null {
  const store = useBookmarkStore.getState()
  if (ref.type === 'bookmark') {
    const index = store.bookmarks.findIndex((item) => item.id === ref.id)
    const bookmark = store.bookmarks[index]
    if (!bookmark) return null
    const value = { bookmark: clone(bookmark), index, locations: clone(store.getBookmarkLocations(bookmark.id)) }
    return { version: bookmark.updatedAt, value: jsonPayload(value) }
  }
  if (ref.type === 'group') {
    const index = store.groups.findIndex((item) => item.id === ref.id)
    const group = store.groups[index]
    return group ? { version: group.updatedAt, value: jsonPayload({ group: clone(group), index }) } : null
  }
  const group = store.groups.find((item) => item.id === ref.parentId)
  const index = group?.children.findIndex((item) => item.id === ref.id) ?? -1
  const subGroup = index >= 0 ? group?.children[index] : undefined
  return subGroup ? { version: subGroup.updatedAt, value: jsonPayload({ subGroup: clone(subGroup), index }) } : null
}

function captureSnapshots(refs: BookmarkTransactionEntityRef[]): UndoSnapshot[] {
  return uniqueRefs(refs).map((ref) => ({ ref, state: readEntity(ref) }))
}

function syncRefs(refs: BookmarkTransactionEntityRef[]) {
  const store = useBookmarkStore.getState()
  const now = Date.now()
  uniqueRefs(refs).forEach((ref) => {
    if (ref.type === 'bookmark') {
      const bookmark = store.bookmarks.find((item) => item.id === ref.id)
      store.scheduleBookmarkSync(ref.id, {
        isDeleted: !bookmark,
        updatedAt: bookmark?.updatedAt ?? now,
        content: bookmark ?? null
      })
      return
    }
    if (ref.type === 'group') {
      const group = store.groups.find((item) => item.id === ref.id)
      store.scheduleGroupSync(ref.id, {
        isDeleted: !group,
        updatedAt: group?.updatedAt ?? now,
        orderIndex: group ? store.groups.findIndex((item) => item.id === group.id) : undefined
      })
      return
    }
    const group = store.groups.find((item) => item.id === ref.parentId)
    const subGroup = group?.children.find((item) => item.id === ref.id)
    store.scheduleSubGroupSync(ref.parentId ?? '', ref.id, {
      isDeleted: !subGroup,
      updatedAt: subGroup?.updatedAt ?? now
    })
  })
}

function applyDirectCreation(payload: OperationPayload) {
  const store = useBookmarkStore.getState()
  const groups = clone(store.groups)
  const bookmarks = clone(store.bookmarks)
  const now = Date.now()
  const action = payload.action

  if (action.type === 'createGroup') {
    const groupId = payload.createdGroupId!
    const subGroupId = payload.createdSubGroupId!
    if (!groups.some((group) => group.id === groupId)) {
      const group: Group = {
        id: groupId,
        name: action.name.trim().slice(0, 40),
        createdAt: now,
        updatedAt: now,
        children: [{ id: subGroupId, name: '分组一', bookmarkIds: [], createdAt: now, updatedAt: now }]
      }
      const trashIndex = groups.findIndex((item) => item.id === TRASH_GROUP_ID)
      if (trashIndex >= 0) groups.splice(trashIndex, 0, group)
      else groups.push(group)
      store.setData({ groups, activeGroupId: groupId, activeSubGroupId: subGroupId })
    }
    return
  }

  if (action.type === 'createSubGroup') {
    const group = groups.find((item) => item.id === action.groupId)
    if (!group) throw new Error('目标一级分组不存在')
    const subGroupId = payload.createdSubGroupId!
    if (!group.children.some((item) => item.id === subGroupId)) {
      group.children.push({
        id: subGroupId,
        name: action.name.trim().slice(0, 40),
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      })
      group.updatedAt = now
      store.setData({ groups, activeSubGroupId: subGroupId })
    }
    return
  }

  if (action.type !== 'createBookmark') return
  const ensure = payload.ensureGroup
  if (ensure) {
    let group = groups.find((item) => item.id === ensure.groupId)
    if (!group && ensure.createGroup) {
      group = { id: ensure.groupId, name: '快速收集', children: [], createdAt: now, updatedAt: now }
      const trashIndex = groups.findIndex((item) => item.id === TRASH_GROUP_ID)
      if (trashIndex >= 0) groups.splice(trashIndex, 0, group)
      else groups.push(group)
    }
    if (!group) throw new Error('快速收集分组不存在')
    if (!group.children.some((item) => item.id === ensure.subGroupId) && ensure.createSubGroup) {
      group.children.push({
        id: ensure.subGroupId,
        name: '收集',
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      })
      group.updatedAt = now
    }
  }
  const bookmarkId = payload.createdBookmarkId!
  if (bookmarks.some((bookmark) => bookmark.id === bookmarkId)) return
  const locations = payload.resolvedLocations ?? []
  const title = action.title.trim().slice(0, 80)
  const bookmark: Bookmark = {
    id: bookmarkId,
    url: action.url,
    title,
    desc: action.desc.trim().slice(0, 240),
    tags: action.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    pinned: false,
    allowUniversal: false,
    icon: { type: 'text', value: title.slice(0, 2).toUpperCase() },
    locations: clone(locations),
    createdAt: now,
    updatedAt: now
  }
  bookmarks.push(bookmark)
  locations.forEach((location) => {
    const group = groups.find((item) => item.id === location.groupId)
    const subGroup = group?.children.find((item) => item.id === location.subGroupId)
    if (!group || !subGroup) throw new Error('目标分组不存在或已删除')
    if (!subGroup.bookmarkIds.includes(bookmarkId)) subGroup.bookmarkIds.push(bookmarkId)
    subGroup.updatedAt = now
    group.updatedAt = now
  })
  store.setData({ groups, bookmarks })
}

function applyOperationMutation(operation: BookmarkTransactionOperation) {
  const payload = payloadRecord(operation)
  const action = payload.action
  const store = useBookmarkStore.getState()
  if (action.type === 'createBookmark' || action.type === 'createGroup' || action.type === 'createSubGroup') {
    applyDirectCreation(payload)
    syncRefs(operation.entityRefs)
    return
  }
  switch (action.type) {
    case 'updateBookmark':
      store.updateBookmark(action.bookmarkId, {
        ...(action.title !== undefined ? { title: action.title.trim().slice(0, 80) } : {}),
        ...(action.desc !== undefined ? { desc: action.desc.trim().slice(0, 240) } : {}),
        ...(action.tags !== undefined ? { tags: action.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12) } : {})
      })
      break
    case 'setBookmarkLocations':
      store.updateBookmarkLocations(action.bookmarkId, action.locations)
      break
    case 'renameGroup':
      store.updateGroup(action.groupId, action.name.trim().slice(0, 40))
      break
    case 'deleteGroup':
      if (!store.removeGroup(action.groupId)) throw new Error('删除一级分组失败')
      break
    case 'renameSubGroup':
      store.updateSubGroup(action.groupId, action.subGroupId, action.name.trim().slice(0, 40))
      break
    case 'deleteSubGroup':
      if (!store.removeSubGroup(action.groupId, action.subGroupId)) throw new Error('删除子分组失败')
      break
  }
}

function restoreSnapshots(snapshots: UndoSnapshot[]) {
  const store = useBookmarkStore.getState()
  let groups = clone(store.groups)
  let bookmarks = clone(store.bookmarks)
  const groupSnapshots = snapshots.filter((item) => item.ref.type === 'group')
  const subGroupSnapshots = snapshots.filter((item) => item.ref.type === 'subGroup')
  const bookmarkSnapshots = snapshots.filter((item) => item.ref.type === 'bookmark')

  for (const snapshot of groupSnapshots) {
    const index = groups.findIndex((item) => item.id === snapshot.ref.id)
    if (!snapshot.state) {
      if (index >= 0) groups.splice(index, 1)
    } else {
      const value = clone(snapshot.state.value) as unknown as { group: Group; index: number }
      const group = value.group
      if (index >= 0) groups[index] = group
      else groups.splice(Math.max(0, Math.min(groups.length, value.index)), 0, group)
    }
  }
  for (const snapshot of subGroupSnapshots) {
    const group = groups.find((item) => item.id === snapshot.ref.parentId)
    if (!group) {
      if (snapshot.state) throw new Error(`无法恢复子分组 ${snapshot.ref.id}：父分组不存在`)
      continue
    }
    const index = group.children.findIndex((item) => item.id === snapshot.ref.id)
    if (!snapshot.state) {
      if (index >= 0) group.children.splice(index, 1)
    } else {
      const value = clone(snapshot.state.value) as unknown as { subGroup: SubGroup; index: number }
      const subGroup = value.subGroup
      if (index >= 0) group.children[index] = subGroup
      else group.children.splice(Math.max(0, Math.min(group.children.length, value.index)), 0, subGroup)
    }
  }
  for (const snapshot of bookmarkSnapshots) {
    const index = bookmarks.findIndex((item) => item.id === snapshot.ref.id)
    if (!snapshot.state) {
      if (index >= 0) bookmarks.splice(index, 1)
    } else {
      const value = clone(snapshot.state.value) as unknown as {
        bookmark: Bookmark
        index: number
        locations: BookmarkLocation[]
      }
      const bookmark = { ...value.bookmark, locations: value.locations }
      if (index >= 0) bookmarks[index] = bookmark
      else bookmarks.splice(Math.max(0, Math.min(bookmarks.length, value.index)), 0, bookmark)
    }
  }
  store.setData({ groups, bookmarks })
  store.ensureValidSelection()
  syncRefs(snapshots.map((item) => item.ref))
}

const appliedUndoPayloads = new Map<string, BookmarkAiJsonValue>()
const undoneOperationIds = new Set<string>()

export const bookmarkTransactionAdapter: BookmarkTransactionAdapter = {
  readEntity,
  applyOperation: (operation) => {
    const cached = appliedUndoPayloads.get(operation.operationId)
    if (cached !== undefined) return cached
    const undoPayload = jsonPayload({ snapshots: captureSnapshots(operation.entityRefs) })
    applyOperationMutation(operation)
    appliedUndoPayloads.set(operation.operationId, undoPayload)
    undoneOperationIds.delete(operation.operationId)
    return undoPayload
  },
  undoOperation: (operation, undoPayload) => {
    if (undoneOperationIds.has(operation.operationId)) return
    const record = undoPayload as unknown as { snapshots?: UndoSnapshot[] }
    if (!Array.isArray(record.snapshots)) throw new Error(`operation ${operation.operationId} 缺少撤回快照`)
    restoreSnapshots(record.snapshots)
    undoneOperationIds.add(operation.operationId)
    appliedUndoPayloads.delete(operation.operationId)
  }
}

export function createBookmarkTransactionOperations(
  proposalId: string,
  actions: BookmarkMutationAction[]
): BookmarkTransactionOperation[] {
  const store = useBookmarkStore.getState()
  return actions.map((action, index) => {
    const operationId = `${proposalId}:operation:${String(index + 1).padStart(2, '0')}:${action.type}`
    const refs: BookmarkTransactionEntityRef[] = []
    const payload: OperationPayload = { action: clone(action) }

    switch (action.type) {
      case 'createBookmark': {
        payload.createdBookmarkId = stableId(proposalId, index, 'bookmark')
        refs.push({ type: 'bookmark', id: payload.createdBookmarkId })
        if (action.groupId && action.subGroupId) {
          payload.resolvedLocations = [{ groupId: action.groupId, subGroupId: action.subGroupId }]
        } else {
          const existing = store.groups.find((group) => group.name === '快速收集' && group.id !== TRASH_GROUP_ID)
          const groupId = existing?.id ?? stableId(proposalId, index, 'quick-group')
          const subGroupId = existing?.children[0]?.id ?? stableId(proposalId, index, 'quick-sub')
          payload.resolvedLocations = [{ groupId, subGroupId }]
          payload.ensureGroup = {
            groupId,
            subGroupId,
            createGroup: !existing,
            createSubGroup: !existing?.children[0]
          }
        }
        refs.push(...locationRefs(payload.resolvedLocations))
        break
      }
      case 'updateBookmark':
        refs.push({ type: 'bookmark', id: action.bookmarkId })
        break
      case 'setBookmarkLocations': {
        refs.push({ type: 'bookmark', id: action.bookmarkId })
        refs.push(...locationRefs([
          ...store.getBookmarkLocations(action.bookmarkId),
          ...action.locations
        ]))
        break
      }
      case 'createGroup':
        payload.createdGroupId = stableId(proposalId, index, 'group')
        payload.createdSubGroupId = stableId(proposalId, index, 'sub')
        refs.push(
          { type: 'group', id: payload.createdGroupId },
          { type: 'subGroup', id: payload.createdSubGroupId, parentId: payload.createdGroupId }
        )
        break
      case 'renameGroup':
        refs.push({ type: 'group', id: action.groupId })
        break
      case 'deleteGroup': {
        const group = store.groups.find((item) => item.id === action.groupId)
        refs.push({ type: 'group', id: action.groupId }, ...trashRefs())
        for (const subGroup of group?.children ?? []) {
          refs.push({ type: 'subGroup', id: subGroup.id, parentId: action.groupId })
          subGroup.bookmarkIds.forEach((id) => refs.push({ type: 'bookmark', id }))
        }
        break
      }
      case 'createSubGroup':
        payload.createdSubGroupId = stableId(proposalId, index, 'sub')
        refs.push(
          { type: 'group', id: action.groupId },
          { type: 'subGroup', id: payload.createdSubGroupId, parentId: action.groupId }
        )
        break
      case 'renameSubGroup':
        refs.push(
          { type: 'group', id: action.groupId },
          { type: 'subGroup', id: action.subGroupId, parentId: action.groupId }
        )
        break
      case 'deleteSubGroup': {
        const group = store.groups.find((item) => item.id === action.groupId)
        const subGroup = group?.children.find((item) => item.id === action.subGroupId)
        refs.push(
          { type: 'group', id: action.groupId },
          { type: 'subGroup', id: action.subGroupId, parentId: action.groupId },
          ...trashRefs()
        )
        subGroup?.bookmarkIds.forEach((id) => refs.push({ type: 'bookmark', id }))
        break
      }
    }

    return {
      operationId,
      kind: action.type,
      entityRefs: uniqueRefs(refs),
      payload: jsonPayload(payload)
    }
  })
}
