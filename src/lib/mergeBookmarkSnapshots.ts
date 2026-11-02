import { BookmarkSyncConflictError, type BookmarkSnapshot } from './stateRepository'

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// 三方比较只合并相对已读基线的实际编辑；缺席本身不代表删除。
// 时间戳只用于同一实体的元信息，不能用整库最大值选一个快照覆盖另一个。
function merge(base: unknown, local: unknown, remote: unknown, key = ''): unknown {
  // visits/lastUsed 是本机统计（加载时已叠加本机值），不能相加或判冲突：本机有数值就用本机，否则用远端。
  if (key === 'visits' || key === 'lastUsed') return typeof local === 'number' ? local : remote
  if (same(local, base)) return remote
  if (same(remote, base)) return local
  if (['updatedAt', 'serverUpdatedAt'].includes(key) &&
    typeof local === 'number' && typeof remote === 'number') return Math.max(local, remote)

  if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base) &&
    ['groups', 'bookmarks', 'children', 'bookmarkIds'].includes(key)) {
    const id = (value: unknown): string => typeof value === 'string' ? value : String((value as { id: string }).id)
    const b = new Map(base.map(value => [id(value), value]))
    const l = new Map(local.map(value => [id(value), value]))
    const r = new Map(remote.map(value => [id(value), value]))
    const values = new Map<string, unknown>()
    for (const itemId of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const value = merge(b.get(itemId), l.get(itemId), r.get(itemId))
      if (value !== undefined) values.set(itemId, value)
    }
    const common = (items: unknown[]) => items.map(id).filter(itemId => b.has(itemId) && l.has(itemId) && r.has(itemId))
    const baseOrder = common(base), localOrder = common(local), remoteOrder = common(remote)
    if (!same(baseOrder, localOrder) && !same(baseOrder, remoteOrder) && !same(localOrder, remoteOrder)) {
      throw new BookmarkSyncConflictError()
    }
    const preferred = same(baseOrder, localOrder) ? remote : local
    // 保留插入锚点，不能把另一端新增的项简单追加到末尾。
    const order = [...new Set([...preferred.map(id), ...remote.map(id), ...local.map(id)])].filter(itemId => values.has(itemId))
    const edges = new Map(order.map(itemId => [itemId, new Set<string>()]))
    const indegree = new Map(order.map(itemId => [itemId, 0]))
    const connect = (before: string, after: string) => {
      if (before === after || edges.get(before)!.has(after)) return
      edges.get(before)!.add(after)
      indegree.set(after, indegree.get(after)! + 1)
    }
    const commonIds = new Set(baseOrder)
    const chosen = common(preferred)
    chosen.slice(1).forEach((itemId, i) => connect(chosen[i], itemId))
    for (const items of [local, remote]) {
      const surviving = items.map(id).filter(itemId => values.has(itemId))
      surviving.slice(1).forEach((itemId, i) => {
        if (!commonIds.has(surviving[i]) || !commonIds.has(itemId)) connect(surviving[i], itemId)
      })
    }
    const sorted: unknown[] = []
    const available = new Set(order)
    while (available.size) {
      const next = order.find(itemId => available.has(itemId) && indegree.get(itemId) === 0)
      if (!next) throw new BookmarkSyncConflictError()
      available.delete(next)
      sorted.push(values.get(next))
      for (const following of edges.get(next)!) indegree.set(following, indegree.get(following)! - 1)
    }
    return sorted
  }
  if (object(base) && object(local) && object(remote)) {
    const result: Record<string, unknown> = Object.create(null)
    for (const field of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = merge(base[field], local[field], remote[field], field)
      if (value !== undefined) result[field] = value
    }
    return result
  }
  if (same(local, remote)) return local
  // 同一字段被两端改为不同内容，或一端编辑另一端删除，不猜测用户意图。
  throw new BookmarkSyncConflictError()
}

export function mergeBookmarkSnapshots(base: BookmarkSnapshot, local: BookmarkSnapshot, remote: BookmarkSnapshot): BookmarkSnapshot {
  return {
    groups: merge(base.groups, local.groups, remote.groups, 'groups') as BookmarkSnapshot['groups'],
    bookmarks: merge(base.bookmarks, local.bookmarks, remote.bookmarks, 'bookmarks') as BookmarkSnapshot['bookmarks'],
    activeGroupId: local.activeGroupId,
    activeSubGroupId: local.activeSubGroupId
  }
}
