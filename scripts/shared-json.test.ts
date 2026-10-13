import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('文件模式：默认迁移、设置写回、重开读取与失败保护', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goose-marks-sync-'))
  const alerts: string[] = []
  const docs = new Map<string, any>()
  const nativeRequire = createRequire(import.meta.url)
  const nativeFs = nativeRequire('node:fs/promises')
  let pauseRead: (() => Promise<void>) | undefined
  const fileBridge = { ...nativeFs, lstat: async (...args: any[]) => {
    const pause = pauseRead
    pauseRead = undefined
    await pause?.()
    return nativeFs.lstat(...args)
  } }
  const windowMock = Object.assign(new EventTarget(), {
    require: (name: string) => name === 'node:fs/promises' ? fileBridge : nativeRequire(name),
    alert: (message: string) => alerts.push(message),
    localStorage: { getItem: () => null, removeItem: () => {} },
    utools: {
      getPath: () => directory,
      setExpendHeight: () => {},
      db: {
        get: (id: string) => docs.get(id) ?? null,
        put: (doc: any) => { docs.set(doc._id, structuredClone(doc)); return { ok: true } },
        remove: (id: string) => { docs.delete(id); return { ok: true } },
        allDocs: () => [...docs.values()]
      }
    }
  })
  const previousWindow = globalThis.window
  const previousChannel = globalThis.BroadcastChannel
  Object.assign(globalThis, { window: windowMock, BroadcastChannel: undefined })
  const { useBookmarkStore } = await import('../src/stores/bookmark')
  const { useSettingsStore, isSettingsFileReadOnly } = await import('../src/stores/settings')
  const { initializeSharedJsonSync, flushSharedJsonSync, sharedJsonSourcePath } = await import('../src/lib/sharedJson')
  const { parse, portableSnapshot } = await import('../src/lib/shared-json/files')
  const { parseFileSettings } = await import('../src/lib/shared-json/settings')
  const now = Date.now()
  const bookmark = {
    id: 'test-bookmark', title: '本地旧数据', url: 'https://example.com', tags: [],
    createdAt: now, updatedAt: now, visits: 7, lastUsed: now,
    prevLocations: [{ groupId: 'test-group', subGroupId: 'test-subgroup' }],
    icon: { type: 'text' as const, value: '测' }
  }
  const snapshot = {
    groups: [{ id: 'test-group', name: '测试', createdAt: now, updatedAt: now,
      children: [{ id: 'test-subgroup', name: '分组', createdAt: now, updatedAt: now, bookmarkIds: [bookmark.id] }] }],
    bookmarks: [bookmark]
  }
  const file = join(directory, 'goose-marks.json')
  try {
    useBookmarkStore.getState().setData(snapshot)
    useSettingsStore.getState().setDensity('compact')
    assert.equal(await initializeSharedJsonSync(), true)
    await flushSharedJsonSync()
    assert.equal(sharedJsonSourcePath(), file)
    const initial = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(initial.settings.density, 'compact')
    assert.equal(initial.bookmarks[0].visits, 7)
    assert.deepEqual(initial.bookmarks[0].prevLocations, bookmark.prevLocations)
    // 缓存不可读也不能阻断已有文件；但不能用默认示例重建缺失的文件。
    docs.delete('gm:storage:shared-json-source-path')
    await rm(file)
    assert.equal(await initializeSharedJsonSync({ allowDefaultCreation: false }), false)
    await assert.rejects(readFile(file), { code: 'ENOENT' })
    await writeFile(file, JSON.stringify(initial))
    assert.equal(await initializeSharedJsonSync({ allowDefaultCreation: false }), true)
    await flushSharedJsonSync()

    useSettingsStore.getState().setDensity('comfy')
    useSettingsStore.getState().setThemePreference('dark')
    useBookmarkStore.getState().recordBookmarkUse(bookmark.id)
    windowMock.dispatchEvent(new Event('goose-marks:plugin-out'))
    await flushSharedJsonSync()
    const changed = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(changed.settings.density, 'comfy')
    assert.equal(changed.settings.themePreference, 'dark')
    assert.equal(changed.bookmarks[0].visits, 8)

    changed.bookmarks[0].title = '来自文件的新数据'
    changed.settings.density = 'regular'
    changed.settings.themePreference = 'light'
    await writeFile(file, JSON.stringify(changed))
    useBookmarkStore.setState({ activeGroupId: '不存在', activeSubGroupId: '不存在' })
    windowMock.dispatchEvent(new Event('goose-marks:plugin-enter'))
    await flushSharedJsonSync()
    assert.equal(useBookmarkStore.getState().bookmarks[0].title, '来自文件的新数据')
    assert.equal(useSettingsStore.getState().density, 'regular')
    assert.equal(useSettingsStore.getState().themePreference, 'light')
    assert.equal(useBookmarkStore.getState().activeGroupId, 'test-group')

    let releaseRead!: () => void
    let readingStarted!: () => void
    const started = new Promise<void>(resolve => { readingStarted = resolve })
    const release = new Promise<void>(resolve => { releaseRead = resolve })
    pauseRead = () => { readingStarted(); return release }
    const loading = initializeSharedJsonSync()
    await started
    useSettingsStore.getState().setDensity('compact')
    assert.equal(useSettingsStore.getState().density, 'regular')
    releaseRead()
    assert.equal(await loading, true)
    await flushSharedJsonSync()

    const legacy = parseFileSettings({ aiProtocol: 'openai-responses', aiCustomApiKey: 'test-only',
      aiCustomBaseURL: 'https://example.invalid/v1', aiSelectedModelId: 'legacy-model', setDensity: '恶意键' })
    assert.equal(legacy.aiCustomApiKey, 'test-only')
    assert.equal(legacy.aiCustomBaseURL, 'https://example.invalid/v1')
    assert.equal(legacy.aiSelectedModelId, 'legacy-model')
    assert.equal('setDensity' in legacy, false)
    assert.throws(() => parseFileSettings({ density: 5 }))
    assert.throws(() => parse(JSON.stringify({ ...changed, groups: [null] })))

    // 旧书签文件不含 settings，迁移当前偏好，统计与恢复位置不能丢。
    delete changed.settings
    await writeFile(file, JSON.stringify(changed))
    assert.equal(await initializeSharedJsonSync(), true)
    await flushSharedJsonSync()
    const migrated = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(migrated.settings.density, 'regular')
    assert.equal(migrated.bookmarks[0].visits, 8)
    assert.deepEqual(migrated.bookmarks[0].prevLocations, bookmark.prevLocations)
    assert.deepEqual(parse(await portableSnapshot(parse(JSON.stringify(migrated)))).bookmarks[0].prevLocations, bookmark.prevLocations)

    // 运行期间文件与本地同时变更，不能覆盖外部内容。
    const external = { ...migrated, bookmarks: [{ ...migrated.bookmarks[0], title: '外部修改' }] }
    const externalText = JSON.stringify(external)
    await writeFile(file, externalText)
    useBookmarkStore.getState().recordBookmarkUse(bookmark.id)
    await flushSharedJsonSync()
    assert.equal(await readFile(file, 'utf8'), externalText)
    assert.equal(useBookmarkStore.getState().isReadOnly, true)
    assert.equal(isSettingsFileReadOnly(), true)
    useSettingsStore.getState().setDensity('compact')
    assert.equal(useSettingsStore.getState().density, 'regular')
    assert.ok(alerts.at(-1)?.includes('文件已被外部修改'))

    assert.equal(await initializeSharedJsonSync(), true)
    await flushSharedJsonSync()
    assert.equal(useBookmarkStore.getState().bookmarks[0].title, '外部修改')
    // 锁争用导致写入失败，保留文件并暂停。
    await writeFile(`${file}.lock`, 'other writer')
    useSettingsStore.getState().setDensity('compact')
    await flushSharedJsonSync()
    assert.equal(await readFile(file, 'utf8'), externalText)
    assert.equal(isSettingsFileReadOnly(), true)
    await rm(`${file}.lock`)

    // 损坏文件不能被缓存自动重建。
    await writeFile(file, '{broken')
    assert.equal(await initializeSharedJsonSync(), false)
    assert.equal(await readFile(file, 'utf8'), '{broken')
    assert.equal(useBookmarkStore.getState().isReadOnly, true)
  } finally {
    // 失败初始化会清掉监听 timer，测试仅触碰临时目录。
    await writeFile(file, '{broken')
    await initializeSharedJsonSync()
    await rm(directory, { recursive: true, force: true })
    Object.assign(globalThis, { window: previousWindow, BroadcastChannel: previousChannel })
  }
})
