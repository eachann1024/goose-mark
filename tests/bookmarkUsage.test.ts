import { beforeEach, describe, expect, test } from 'bun:test'

type Doc = { _id: string; _rev?: string; data?: unknown; _deleted?: boolean }
const docs = new Map<string, { _id: string; _rev: string; data: unknown }>()
let revCounter = 0
const written: string[] = []

const put = (doc: Doc) => {
  const current = docs.get(doc._id)
  if (current && current._rev !== doc._rev) return { ok: false, id: doc._id, error: true, name: 'conflict' }
  if (!current && doc._rev) return { ok: false, id: doc._id, error: true, name: 'conflict' }
  written.push(doc._id)
  if (doc._deleted) { docs.delete(doc._id); return { ok: true, id: doc._id, rev: `r${++revCounter}` } }
  const rev = `${++revCounter}-x`
  docs.set(doc._id, { _id: doc._id, _rev: rev, data: JSON.parse(JSON.stringify(doc.data)) })
  return { ok: true, id: doc._id, rev }
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

const localStore = new Map<string, string>()
;(globalThis as any).window = {
  utools: {
    getNativeId: () => 'device-A',
    getUser: () => null,
    db: {
      put,
      get: (id: string) => (docs.has(id) ? clone(docs.get(id)) : null),
      remove: (id: string) => put({ _id: id, _rev: docs.get(id)?._rev, _deleted: true }),
      allDocs: (prefix = '') => [...docs.values()].filter(d => d._id.startsWith(prefix)).map(clone),
      bulkDocs: (list: Doc[]) => list.map(put)
    }
  },
  localStorage: {
    getItem: (k: string) => localStore.get(k) ?? null,
    setItem: (k: string, v: string) => void localStore.set(k, v),
    removeItem: (k: string) => void localStore.delete(k)
  },
  addEventListener: () => {}
}
;(globalThis as any).document = { addEventListener: () => {}, visibilityState: 'visible' }

const { mergeBookmarkSnapshots } = await import('@/lib/mergeBookmarkSnapshots')
const { loadBookmarkSnapshot, saveBookmarkSnapshot } = await import('@/lib/stateRepository')
const usage = await import('@/lib/bookmarkUsage')
import type { Bookmark, Group } from '@/types/bookmark'
import type { BookmarkSnapshot } from '@/lib/stateRepository'

const bookmark = (extra: Partial<Bookmark> = {}): Bookmark => ({
  id: 'b1', title: 'A', url: 'https://a.test', tags: [], createdAt: 1, updatedAt: 1, ...extra
})
const groups = (): Group[] => [{
  id: 'g1', name: 'G', createdAt: 1, updatedAt: 1,
  children: [{ id: 's1', name: 'S', bookmarkIds: ['b1'], createdAt: 1, updatedAt: 1 }]
}]
const snap = (b: Bookmark): BookmarkSnapshot => ({ groups: groups(), bookmarks: [b], activeGroupId: 'g1', activeSubGroupId: 's1' })

beforeEach(() => {
  docs.clear()
  localStore.clear()
  written.length = 0
  usage.resetBookmarkUsageForTests()
})

describe('mergeBookmarkSnapshots usage fields', () => {
  test('visits/lastUsed are not summed and never throw', () => {
    const base = snap(bookmark({ visits: 1, lastUsed: 10 }))
    const local = snap(bookmark({ visits: 5, lastUsed: 50 }))
    const remote = snap(bookmark({ visits: 3, lastUsed: 30 }))
    const merged = mergeBookmarkSnapshots(base, local, remote)
    expect(merged.bookmarks[0].visits).toBe(5)
    expect(merged.bookmarks[0].lastUsed).toBe(50)
  })

  test('falls back to remote when local has no number', () => {
    const base = snap(bookmark())
    const local = snap(bookmark())
    const remote = snap(bookmark({ visits: 4, lastUsed: 9 }))
    const merged = mergeBookmarkSnapshots(base, local, remote)
    expect(merged.bookmarks[0].visits).toBe(4)
    expect(merged.bookmarks[0].lastUsed).toBe(9)
  })

  test('a remote title edit merges with a local usage bump', () => {
    const base = snap(bookmark({ visits: 1 }))
    const local = snap(bookmark({ visits: 2 }))
    const remote = snap(bookmark({ visits: 1, title: 'Edited on Mac' }))
    const merged = mergeBookmarkSnapshots(base, local, remote)
    expect(merged.bookmarks[0].title).toBe('Edited on Mac')
    expect(merged.bookmarks[0].visits).toBe(2)
  })
})

describe('saveBookmarkSnapshot ignores usage', () => {
  test('usage-only change writes no documents', async () => {
    put({ _id: 'gm:group:g1', data: { ...groups()[0], orderIndex: 0 } })
    put({ _id: 'gm:bookmark:b1', data: bookmark({ visits: 1, lastUsed: 10 }) })
    put({ _id: 'gm:meta:bookmark', data: { activeGroupId: 'g1', activeSubGroupId: 's1', updatedAt: 1, schemaVersion: 1 } })
    await loadBookmarkSnapshot()
    written.length = 0

    const result = await saveBookmarkSnapshot(snap(bookmark({ visits: 99, lastUsed: 999 })))
    expect(written).toEqual([])
    expect(result.dataChanged).toBe(false)
    expect((docs.get('gm:bookmark:b1')!.data as Bookmark).visits).toBe(1)
  })

  test('legacy doc without usage fields stays without them', async () => {
    put({ _id: 'gm:group:g1', data: { ...groups()[0], orderIndex: 0 } })
    put({ _id: 'gm:bookmark:b1', data: bookmark() })
    put({ _id: 'gm:meta:bookmark', data: { activeGroupId: 'g1', activeSubGroupId: 's1', updatedAt: 1, schemaVersion: 1 } })
    await loadBookmarkSnapshot()
    written.length = 0
    await saveBookmarkSnapshot(snap(bookmark({ visits: 3, lastUsed: 5 })))
    expect(written).toEqual([])
  })

  test('a real edit writes the doc but keeps the old usage values verbatim', async () => {
    put({ _id: 'gm:group:g1', data: { ...groups()[0], orderIndex: 0 } })
    put({ _id: 'gm:bookmark:b1', data: bookmark({ visits: 1, lastUsed: 10 }) })
    put({ _id: 'gm:meta:bookmark', data: { activeGroupId: 'g1', activeSubGroupId: 's1', updatedAt: 1, schemaVersion: 1 } })
    await loadBookmarkSnapshot()
    written.length = 0
    await saveBookmarkSnapshot(snap(bookmark({ title: 'New', visits: 50, lastUsed: 500 })))
    expect(written).toEqual(['gm:bookmark:b1'])
    const data = docs.get('gm:bookmark:b1')!.data as Bookmark
    expect(data.title).toBe('New')
    expect(data.visits).toBe(1)
    expect(data.lastUsed).toBe(10)
  })
})

describe('usage overlay on load', () => {
  const seed = (extra: Partial<Bookmark>) => {
    put({ _id: 'gm:group:g1', data: { ...groups()[0], orderIndex: 0 } })
    put({ _id: 'gm:bookmark:b1', data: bookmark(extra) })
    put({ _id: 'gm:meta:bookmark', data: { activeGroupId: 'g1', activeSubGroupId: 's1', updatedAt: 1, schemaVersion: 1 } })
  }

  test('local usage wins over the synced doc values', async () => {
    seed({ visits: 1, lastUsed: 10 })
    usage.recordBookmarkUsage('b1', { visits: 7, lastUsed: 70 })
    const loaded = await loadBookmarkSnapshot()
    expect(loaded!.bookmarks[0].visits).toBe(7)
    expect(loaded!.bookmarks[0].lastUsed).toBe(70)
  })

  test('legacy values remain when no local usage exists', async () => {
    seed({ visits: 4, lastUsed: 40 })
    const loaded = await loadBookmarkSnapshot()
    expect(loaded!.bookmarks[0].visits).toBe(4)
    expect(loaded!.bookmarks[0].lastUsed).toBe(40)
  })

  test('recording usage flushes to a per-device doc, never a bookmark doc', async () => {
    seed({})
    written.length = 0
    usage.recordBookmarkUsage('b1', { visits: 1, lastUsed: 5 })
    usage.flushBookmarkUsage()
    expect(written).toEqual(['gm:usage:device-A'])
    usage.resetBookmarkUsageForTests()
    expect(usage.getBookmarkUsageMap().b1).toEqual({ visits: 1, lastUsed: 5 })
  })

  test('falls back to localStorage without getNativeId', () => {
    const utools = (globalThis as any).window.utools
    const original = utools.getNativeId
    utools.getNativeId = undefined
    try {
      usage.recordBookmarkUsage('b1', { visits: 2, lastUsed: 6 })
      usage.flushBookmarkUsage()
      expect(written).toEqual([])
      usage.resetBookmarkUsageForTests()
      expect(usage.getBookmarkUsageMap().b1).toEqual({ visits: 2, lastUsed: 6 })
    } finally { utools.getNativeId = original }
  })
})
