import { expect, test } from '@playwright/test'
import {
  BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
  bookmarkSnapshotDataFingerprint,
  combineRecoveredBookmarkSnapshot,
  mergeBookmarkSnapshots,
  parseBookmarkSnapshotEnvelope,
  type BookmarkSnapshotEnvelope,
} from '../../src/lib/bookmarkSnapshotProtocol'
import type { Bookmark, Group } from '../../src/types/bookmark'
import {
  BookmarkRevisionConflictError,
  loadBookmarkSnapshot,
  loadRecoverableBookmarkSnapshot,
  saveBookmarkSnapshot,
} from '../../src/lib/stateRepository'

const group = (id: string, bookmarkIds: string[], updatedAt = 100): Group => ({
  id,
  name: id,
  createdAt: 1,
  updatedAt,
  children: [{ id: `s-${id}`, name: '默认', bookmarkIds, createdAt: 1, updatedAt }],
})

const bookmark = (id: string, title = id, updatedAt = 100): Bookmark => ({
  id,
  title,
  url: `https://${id}.test`,
  tags: [],
  createdAt: 1,
  updatedAt,
})

const snapshot = (
  revision: number,
  groups: Group[],
  bookmarks: Bookmark[],
): BookmarkSnapshotEnvelope => ({
  schemaVersion: BOOKMARK_SNAPSHOT_SCHEMA_VERSION,
  revision,
  snapshotId: `snapshot-${revision}`,
  groups,
  bookmarks,
  activeGroupId: groups[0]?.id ?? '',
  activeSubGroupId: groups[0]?.children[0]?.id ?? '',
})

test('并发图标回填不能覆盖本地刚新增的分组和书签', () => {
  const base = snapshot(1, [group('g-a', ['b1'])], [bookmark('b1')])
  const local = snapshot(
    1,
    [group('g-a', ['b1']), group('g-new', ['b-new'], 200)],
    [bookmark('b1'), bookmark('b-new', '刚填写的标题', 200)],
  )
  const remote = snapshot(2, [group('g-a', ['b1'])], [
    {
      ...bookmark('b1'),
      icon: { type: 'remote', src: 'https://b1.test/favicon.ico', cache: 'data:image/png;base64,AA==' },
      iconMatchedAt: 300,
    },
  ])

  const merged = mergeBookmarkSnapshots(base, local, remote)

  expect(merged.groups.map((item) => item.id)).toEqual(['g-a', 'g-new'])
  expect(merged.bookmarks.map((item) => item.id)).toEqual(['b1', 'b-new'])
  expect(merged.bookmarks.find((item) => item.id === 'b-new')?.title).toBe('刚填写的标题')
})

test('合法删除在另一侧未修改时会保留', () => {
  const base = snapshot(3, [group('g-a', ['b1']), group('g-delete', [])], [bookmark('b1')])
  const local = snapshot(3, [group('g-a', ['b1'])], [bookmark('b1')])
  const remote = snapshot(4, [group('g-a', ['b1']), group('g-delete', [])], [bookmark('b1')])

  const merged = mergeBookmarkSnapshots(base, local, remote)

  expect(merged.groups.map((item) => item.id)).toEqual(['g-a'])
})

test('同一书签两侧修改不同字段时不会互相覆盖', () => {
  const base = snapshot(6, [group('g-a', ['b1'])], [{ ...bookmark('b1'), title: '旧标题', desc: '旧描述' }])
  const local = snapshot(6, [group('g-a', ['b1'])], [
    { ...bookmark('b1', '我刚填写的标题', 300), desc: '旧描述' },
  ])
  const remote = snapshot(7, [group('g-a', ['b1'])], [
    { ...bookmark('b1', '旧标题', 250), desc: '另一窗口填写的描述' },
  ])

  const merged = mergeBookmarkSnapshots(base, local, remote)
  const result = merged.bookmarks[0]

  expect(result.title).toBe('我刚填写的标题')
  expect(result.desc).toBe('另一窗口填写的描述')
})

test('同一子分组两侧新增不同书签时会保留两项', () => {
  const base = snapshot(8, [group('g-a', ['b1'])], [bookmark('b1')])
  const local = snapshot(8, [group('g-a', ['b1', 'b-local'], 300)], [bookmark('b1'), bookmark('b-local')])
  const remote = snapshot(9, [group('g-a', ['b1', 'b-remote'], 250)], [bookmark('b1'), bookmark('b-remote')])

  const merged = mergeBookmarkSnapshots(base, local, remote)

  expect(merged.groups[0].children[0].bookmarkIds).toEqual(['b1', 'b-local', 'b-remote'])
  expect(merged.bookmarks.map((item) => item.id)).toEqual(['b1', 'b-remote', 'b-local'])
})

test('删除与另一侧编辑冲突时优先保留用户内容', () => {
  const base = snapshot(10, [group('g-a', ['b1'])], [bookmark('b1', '旧标题')])
  const local = snapshot(10, [group('g-a', [])], [])
  const remote = snapshot(11, [group('g-a', ['b1'], 350)], [bookmark('b1', '另一侧刚改的标题', 350)])

  const merged = mergeBookmarkSnapshots(base, local, remote)

  expect(merged.bookmarks[0]?.title).toBe('另一侧刚改的标题')
  expect(merged.groups[0].children[0].bookmarkIds).toEqual(['b1'])
})

test('当前格式必须包含严格递增 revision，旧格式直接拒绝', () => {
  expect(parseBookmarkSnapshotEnvelope(JSON.stringify(snapshot(5, [group('g-a', [])], [])))?.revision).toBe(5)
  expect(parseBookmarkSnapshotEnvelope(JSON.stringify({ groups: [group('g-a', [])], bookmarks: [] }))).toBeNull()
  expect(parseBookmarkSnapshotEnvelope('{bad-json')).toBeNull()
  expect(parseBookmarkSnapshotEnvelope(JSON.stringify(snapshot(5, [], [])))).toBeNull()
  expect(parseBookmarkSnapshotEnvelope(JSON.stringify({
    ...snapshot(5, [group('g-a', ['missing'])], []),
  }))).toBeNull()
  expect(parseBookmarkSnapshotEnvelope(JSON.stringify({
    ...snapshot(5, [group('g-a', [])], [bookmark('b1')]),
    bookmarks: [{ ...bookmark('b1'), tags: '不是数组' }],
  }))).toBeNull()
})

test('窗口选中态不参与数据 revision，避免跨窗口无限回弹', () => {
  const left = snapshot(12, [group('g-a', [])], [])
  const right = { ...left, activeGroupId: 'g-b', activeSubGroupId: 's-g-b' }

  expect(bookmarkSnapshotDataFingerprint(left)).toBe(bookmarkSnapshotDataFingerprint(right))
})

test('删除可选字段也能三方合并', () => {
  const base = snapshot(13, [group('g-a', ['b1'])], [{ ...bookmark('b1'), desc: '准备删除' }])
  const local = snapshot(13, [group('g-a', ['b1'])], [bookmark('b1', 'b1', 400)])
  const remote = snapshot(14, [group('g-a', ['b1'])], [{ ...bookmark('b1'), desc: '准备删除' }])

  expect(mergeBookmarkSnapshots(base, local, remote).bookmarks[0].desc).toBeUndefined()
})

test('数据库只提交 revision 连续的完整快照，迟到写入不能覆盖', async () => {
  type Doc = { _id: string; _rev?: string; data?: unknown; _deleted?: boolean }
  const docs = new Map<string, Doc>()
  let revision = 0
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const put = (doc: Doc) => {
    const current = docs.get(doc._id)
    if ((current?._rev || undefined) !== (doc._rev || undefined)) return { ok: false, id: doc._id, error: true }
    const stored = { ...doc, _rev: String(++revision) }
    docs.set(doc._id, stored)
    return { ok: true, id: doc._id, rev: stored._rev }
  }
  const allDocs = (prefix = '') => Array.from(docs.values()).filter((doc) => doc._id.startsWith(prefix))

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      utools: {
        db: {
          get: (id: string) => docs.get(id) ?? null,
          put,
          remove: (id: string) => {
            docs.delete(id)
            return { ok: true, id }
          },
          allDocs,
          bulkDocs: (items: Doc[]) => items.map(put),
          promises: {
            get: async (id: string) => docs.get(id) ?? null,
            allDocs: async (prefix = '') => allDocs(prefix),
            bulkDocs: async (items: Doc[]) => items.map(put),
          },
        },
      },
    },
  })

  try {
    const first = await saveBookmarkSnapshot(snapshot(0, [group('g-a', ['b1'])], [bookmark('b1')]), 0)
    expect(first.snapshot.revision).toBe(1)

    const second = await saveBookmarkSnapshot(
      snapshot(1, [group('g-a', ['b1']), group('g-new', [])], [bookmark('b1')]),
      1,
    )
    expect(second.snapshot.revision).toBe(2)

    await expect(
      saveBookmarkSnapshot(snapshot(1, [group('g-a', [])], []), 1),
    ).rejects.toBeInstanceOf(BookmarkRevisionConflictError)

    const loaded = await loadBookmarkSnapshot()
    expect(loaded?.revision).toBe(2)
    expect(loaded?.groups.map((item) => item.id)).toEqual(['g-a', 'g-new'])
    expect(loaded?.bookmarks.map((item) => item.id)).toEqual(['b1'])

    // 旧窗口仍会写共用 schema v1 meta；新快照指针必须与它物理隔离。
    const sharedMeta = docs.get('gm:meta:bookmark')
    put({
      _id: 'gm:meta:bookmark',
      _rev: sharedMeta?._rev,
      data: { schemaVersion: 1, activeGroupId: 'g-seed', activeSubGroupId: 's-seed', updatedAt: 999 },
    })
    const afterLegacyWriter = await loadBookmarkSnapshot()
    expect(afterLegacyWriter?.revision).toBe(2)
    expect(afterLegacyWriter?.bookmarks.map((item) => item.id)).toEqual(['b1'])

    // 即使独立 meta 丢失，也要从已提交的不可变 v2 快照自愈，不能回落 seed。
    docs.delete('gm:meta:bookmark:v2')
    const repaired = await loadBookmarkSnapshot()
    expect(repaired?.groups.map((item) => item.id)).toEqual(['g-a', 'g-new'])
    expect(repaired?.bookmarks.map((item) => item.id)).toEqual(['b1'])
    expect((docs.get('gm:meta:bookmark:v2')?.data as any)?.schemaVersion).toBe(2)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('新版误写初始书签后可从原文档恢复真实数据且只恢复一次', async () => {
  type Doc = { _id: string; _rev?: string; data?: unknown; _deleted?: boolean }
  const docs = new Map<string, Doc>()
  let revision = 0
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const put = (doc: Doc) => {
    const current = docs.get(doc._id)
    if ((current?._rev || undefined) !== (doc._rev || undefined)) return { ok: false, id: doc._id, error: true }
    const stored = { ...doc, _rev: String(++revision) }
    docs.set(doc._id, stored)
    return { ok: true, id: doc._id, rev: stored._rev }
  }
  const allDocs = (prefix = '') => Array.from(docs.values()).filter((doc) => doc._id.startsWith(prefix))

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      utools: {
        db: {
          get: (id: string) => docs.get(id) ?? null,
          put,
          remove: (id: string) => {
            docs.delete(id)
            return { ok: true, id }
          },
          allDocs,
          bulkDocs: (items: Doc[]) => items.map(put),
          promises: {
            get: async (id: string) => docs.get(id) ?? null,
            allDocs: async (prefix = '') => allDocs(prefix),
            bulkDocs: async (items: Doc[]) => items.map(put),
          },
        },
      },
    },
  })

  try {
    put({ _id: 'gm:group:g-real', data: { ...group('g-real', ['b-real']), orderIndex: 0 } })
    put({ _id: 'gm:bookmark:b-real', data: bookmark('b-real', '不能丢的真实书签', 500) })

    const seedCommit = await saveBookmarkSnapshot(
      snapshot(0, [group('g-seed', ['b-seed'])], [bookmark('b-seed', '初始书签')]),
      0,
    )
    expect((await loadBookmarkSnapshot())?.bookmarks[0].title).toBe('初始书签')

    const recoverable = await loadRecoverableBookmarkSnapshot()
    expect(recoverable?.groups.map((item) => item.id)).toEqual(['g-real'])
    expect(recoverable?.bookmarks[0].title).toBe('不能丢的真实书签')

    await saveBookmarkSnapshot(
      { ...recoverable!, revision: seedCommit.snapshot.revision, snapshotId: seedCommit.snapshot.snapshotId },
      seedCommit.snapshot.revision,
      { markRecoveryCompleted: true },
    )

    expect(await loadRecoverableBookmarkSnapshot()).toBeNull()
    expect((await loadBookmarkSnapshot())?.bookmarks[0].title).toBe('不能丢的真实书签')
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('恢复原文档时同时保留事故后在 v2 新增的内容', () => {
  const current = snapshot(
    2,
    [group('g-a', ['b1', 'b-after']), group('g-seed-only', [])],
    [bookmark('b1', '初始标题', 900), bookmark('b-after', '事故后新增', 950)],
  )
  const recovered = snapshot(
    2,
    [group('g-a', ['b1']), group('g-real', ['b-real'])],
    [bookmark('b1', '原来填写的标题', 500), bookmark('b-real', '原来的真实书签', 500)],
  )

  const merged = combineRecoveredBookmarkSnapshot(recovered, current)

  expect(merged.groups.map((item) => item.id)).toEqual(['g-a', 'g-real', 'g-seed-only'])
  expect(merged.groups[0].children[0].bookmarkIds).toEqual(['b1', 'b-after'])
  expect(merged.bookmarks.map((item) => item.id)).toEqual(['b1', 'b-real', 'b-after'])
  expect(merged.bookmarks.find((item) => item.id === 'b1')?.title).toBe('原来填写的标题')
})
