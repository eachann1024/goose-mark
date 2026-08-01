import { expect, test } from '@playwright/test'
import {
  parseLocalMirrorRecoverySnapshot,
  selectLocalMirrorRecoverySnapshot,
} from '../../src/lib/localMirrorRecovery'
import {
  loadLocalMirrorRecoverySnapshot,
  saveBookmarkSnapshot,
} from '../../src/lib/stateRepository'

const basePayload = {
  schemaVersion: 'goose-marks.local-data.v1',
  generatedAt: '2026-03-13T08:30:54.591Z',
  revision: 1773390654590,
  data: {
    groups: [{
      id: 'g-real',
      name: 'Mark',
      children: [{ id: 's-real', name: '常用', bookmarkIds: ['b-real'], createdAt: 100, updatedAt: 200 }],
      createdAt: 100,
      updatedAt: 200,
    }],
    bookmarks: [{
      id: 'b-real',
      title: 'MCHOSE HUB',
      url: 'https://example.test',
      tags: [],
      createdAt: 100,
      updatedAt: 200,
    }],
  },
}

const validRaw = JSON.stringify({
  ...basePayload,
  meta: {
    recordCount: 1,
    checksum: '2600ce58a0caa974fa015e894bf8d57473aa69384a5e54546adff91f8132486c',
    writerClientId: 'gm-old',
    writtenAt: 1773390654591,
  },
})

test('校验通过的本地镜像可恢复为当前书签快照', async () => {
  const recovered = await parseLocalMirrorRecoverySnapshot(validRaw)

  expect(recovered?.sourceRevision).toBe(1773390654590)
  expect(recovered?.snapshot.groups[0].name).toBe('Mark')
  expect(recovered?.snapshot.bookmarks[0].title).toBe('MCHOSE HUB')
})

test('checksum、记录数或引用关系异常时拒绝恢复', async () => {
  const tampered = validRaw.replace('MCHOSE HUB', '被篡改')
  const wrongCount = validRaw.replace('"recordCount":1', '"recordCount":2')
  const danglingBase = {
    ...basePayload,
    data: {
      ...basePayload.data,
      groups: [{
        ...basePayload.data.groups[0],
        children: [{ ...basePayload.data.groups[0].children[0], bookmarkIds: ['missing'] }],
      }],
    },
  }
  const dangling = JSON.stringify({
    ...danglingBase,
    meta: {
      recordCount: 1,
      checksum: 'd443751c6db973c073f88d5fc6f75dd608360eb51ba24491892f30c9954972e0',
    },
  })

  expect(await parseLocalMirrorRecoverySnapshot(tampered)).toBeNull()
  expect(await parseLocalMirrorRecoverySnapshot(wrongCount)).toBeNull()
  expect(await parseLocalMirrorRecoverySnapshot(dangling)).toBeNull()
})

test('当前数据是内置 seed 时直接采用真实镜像，不混入初始化书签', async () => {
  const recovered = (await parseLocalMirrorRecoverySnapshot(validRaw))!.snapshot
  const current = {
    ...recovered,
    revision: 9,
    snapshotId: 'current-seed',
    groups: [{
      id: 'g-nav',
      name: '常用',
      children: [{ id: 'sg-nav-common', name: '网站', bookmarkIds: ['b-seed'], createdAt: 300, updatedAt: 300 }],
      createdAt: 300,
      updatedAt: 300,
    }],
    bookmarks: [{ id: 'b-seed', title: '百度', url: 'https://www.baidu.com', tags: [], createdAt: 300, updatedAt: 300 }],
  }

  const selected = selectLocalMirrorRecoverySnapshot(recovered, current, true)

  expect(selected.groups.map((item) => item.id)).toEqual(['g-real'])
  expect(selected.bookmarks.map((item) => item.id)).toEqual(['b-real'])
  expect(selected.revision).toBe(9)
  expect(selected.snapshotId).toBe('current-seed')
})

test('本地镜像恢复成功后写入独立标记，但当前库再次回落 seed 时允许自救', async () => {
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
      gooseBookmarkRecovery: { readLocalMirrorSnapshot: () => ({ ok: true, raw: validRaw }) },
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
    const recovered = await loadLocalMirrorRecoverySnapshot()
    expect(recovered?.snapshot.bookmarks[0].title).toBe('MCHOSE HUB')

    await saveBookmarkSnapshot(recovered!.snapshot, 0, { markLocalMirrorRecoveryCompleted: true })

    expect(await loadLocalMirrorRecoverySnapshot()).toBeNull()
    expect((await loadLocalMirrorRecoverySnapshot({ retryCompletedRecovery: true }))?.snapshot.bookmarks[0].title)
      .toBe('MCHOSE HUB')
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
