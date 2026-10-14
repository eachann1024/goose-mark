import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export async function verifySharedJsonTransitions(file: string) {
  const { useBookmarkStore, flushBookmarkStorePersistence } = await import('../src/stores/bookmark')
  const { useSettingsStore, isSettingsFileReadOnly } = await import('../src/stores/settings')
  const { chooseSharedJsonSource, createSharedJsonSource, removeSharedJsonSource, initializeSharedJsonSync,
    flushSharedJsonSync, sharedJsonConnected, sharedJsonSourcePath, useSharedJsonStatus } = await import('../src/lib/sharedJson')
  const { utoolsStorage } = await import('../src/lib/utoolsStorage')
  const host = window.utools as any
  const original = { open: host.showOpenDialog, save: host.showSaveDialog, confirm: window.confirm, put: host.db.put, require: window.require }
  const originalText = await readFile(file, 'utf8')
  const target = join(dirname(file), 'selected.json')
  let selected: string[] | undefined
  let savePath: string | undefined
  let confirmed = true
  host.showOpenDialog = () => selected
  host.showSaveDialog = () => savePath
  window.confirm = () => confirmed
  const unchanged = async () => {
    await flushSharedJsonSync()
    assert.equal(sharedJsonSourcePath(), file)
    assert.equal(useSharedJsonStatus.getState().phase, 'connected')
    assert.equal(useSharedJsonStatus.getState().busy, false)
    assert.equal(useBookmarkStore.getState().isReadOnly, false)
    assert.equal(isSettingsFileReadOnly(), false)
  }
  try {
    assert.equal(await chooseSharedJsonSource(), false)
    assert.equal(await createSharedJsonSource(), false)
    await unchanged()
    await writeFile(target, originalText)
    selected = [target]
    confirmed = false
    assert.equal(await chooseSharedJsonSource(), false)
    assert.equal(await removeSharedJsonSource(), false)
    await unchanged()

    // 文件选择对话框打开期间阻止重复切换与生命周期重载。
    let resolveDialog!: (files: string[] | undefined) => void
    host.showOpenDialog = () => new Promise(resolve => { resolveDialog = resolve })
    const choosing = chooseSharedJsonSource()
    assert.equal(useSharedJsonStatus.getState().busy, true)
    assert.equal(await createSharedJsonSource(), false)
    assert.equal(await initializeSharedJsonSync(), false)
    resolveDialog(undefined)
    assert.equal(await choosing, false)
    host.showOpenDialog = () => selected
    confirmed = true

    const badIcon = JSON.parse(originalText)
    badIcon.bookmarks[0].icon = { type: 'custom', data: 'data:image/png;base64,ab==' }
    await writeFile(target, JSON.stringify(badIcon))
    await assert.rejects(chooseSharedJsonSource(), /图标.*无效/)
    await unchanged()
    await writeFile(target, originalText)
    window.confirm = () => { writeFileSync(target, '{broken'); return true }
    await assert.rejects(chooseSharedJsonSource())
    await unchanged()
    window.confirm = () => confirmed
    await writeFile(target, originalText)

    host.db.put = (doc: any) => doc._id === 'gm:storage:shared-json-source-path' ? { ok: false, error: 'test-only' } : original.put(doc)
    await assert.rejects(chooseSharedJsonSource(), /路径保存失败/)
    await assert.rejects(removeSharedJsonSource(), /移除连接失败/)
    await unchanged()
    host.db.put = original.put
    host.db.put = (doc: any) => doc._id === 'gm:settings' ? { ok: false, error: 'test-only' } : original.put(doc)
    await assert.rejects(removeSharedJsonSource(), /保存设置失败/)
    await unchanged()
    host.db.put = original.put
    const cachedBookmark = host.db.get('gm:bookmark:test-bookmark')
    original.put({ ...cachedBookmark, data: { ...cachedBookmark.data, title: 'older cached title' } })
    host.db.put = (doc: any) => doc._id === 'gm:bookmark:test-bookmark' ? { ok: false, error: 'test-only' } : original.put(doc)
    await assert.rejects(removeSharedJsonSource(), /保存书签数据失败/)
    await unchanged()
    host.db.put = original.put

    // 激活时发生意外错误，也恢复旧数据、路径与监听。
    const withIcon = JSON.parse(originalText)
    withIcon.bookmarks[0].icon = { type: 'custom', data: 'data:image/png;base64,aWNvbg==' }
    await writeFile(target, JSON.stringify(withIcon))
    let bufferCalls = 0
    window.require = (name: string) => {
      if (name === 'node:buffer' && ++bufferCalls === 2) throw new Error('test activation failure')
      return original.require!(name)
    }
    await assert.rejects(chooseSharedJsonSource(), /activation failure/)
    window.require = original.require
    await unchanged()
    const originalHeight = host.setExpendHeight
    host.setExpendHeight = () => { throw new Error('test window height failure') }
    await assert.rejects(chooseSharedJsonSource(), /window height failure/)
    host.setExpendHeight = originalHeight
    await unchanged()
    assert.equal(JSON.stringify(useBookmarkStore.getState().bookmarks), JSON.stringify(JSON.parse(originalText).bookmarks))
    useSettingsStore.getState().setDensity('compact')
    await flushSharedJsonSync()
    assert.equal(JSON.parse(await readFile(file, 'utf8')).settings.density, 'compact')

    const beforeRemove = await readFile(file, 'utf8')
    assert.equal(await removeSharedJsonSource(), true)
    assert.equal(sharedJsonConnected(), false)
    assert.equal(sharedJsonSourcePath(), null)
    assert.equal(utoolsStorage.getItem('shared-json-source-path'), '')
    assert.equal(useSharedJsonStatus.getState().phase, 'local')
    const visits = useBookmarkStore.getState().bookmarks[0].visits!
    useBookmarkStore.getState().recordBookmarkUse('test-bookmark')
    useSettingsStore.getState().setDensity('comfy')
    await flushSharedJsonSync()
    await flushBookmarkStorePersistence()
    assert.equal(host.db.get('gm:bookmark:test-bookmark').data.visits, visits + 1)
    assert.equal(await readFile(file, 'utf8'), beforeRemove)
    window.dispatchEvent(new Event('goose-marks:plugin-enter'))
    await flushSharedJsonSync()
    assert.equal(await initializeSharedJsonSync(), false)
    assert.equal(sharedJsonConnected(), false)
    assert.equal(useSettingsStore.getState().density, 'comfy')
    assert.equal(useBookmarkStore.getState().bookmarks[0].visits, visits + 1)

    // 新建带当前数据；成功后修改只写入新文件。
    savePath = join(dirname(file), 'after-remove.json')
    assert.equal(await createSharedJsonSource(), true)
    await flushSharedJsonSync()
    assert.equal(sharedJsonSourcePath(), savePath)
    assert.equal(useSharedJsonStatus.getState().phase, 'connected')
    assert.equal(JSON.parse(await readFile(savePath, 'utf8')).settings.density, 'comfy')
    useSettingsStore.getState().setDensity('regular')
    await flushSharedJsonSync()
    assert.equal(JSON.parse(await readFile(savePath, 'utf8')).settings.density, 'regular')
    assert.equal(await readFile(file, 'utf8'), beforeRemove)
    await writeFile(savePath, '{broken')
    assert.equal(await initializeSharedJsonSync(), false)
    assert.equal(useSharedJsonStatus.getState().phase, 'paused')
    assert.equal(useBookmarkStore.getState().isReadOnly, true)
    assert.equal(await removeSharedJsonSource(), true)
    assert.equal(isSettingsFileReadOnly(), false)
    assert.equal(useBookmarkStore.getState().isReadOnly, false)
    assert.equal(await readFile(savePath, 'utf8'), '{broken')

    await writeFile(file, originalText)
    selected = [file]
    assert.equal(await chooseSharedJsonSource(), true)
    await unchanged()
  } finally {
    host.showOpenDialog = original.open
    host.showSaveDialog = original.save
    host.db.put = original.put
    window.confirm = original.confirm
    window.require = original.require
  }
}
