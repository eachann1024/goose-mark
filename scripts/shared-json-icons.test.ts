import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

test('图标可在没有全局 Buffer 的宿主中同步，仍拒绝无效编码', async () => {
  const previousWindow = globalThis.window
  const previousBuffer = globalThis.Buffer
  const nativeRequire = createRequire(import.meta.url)
  const data = 'data:image/png;base64,aWNvbg=='
  Object.assign(globalThis, { window: { require: nativeRequire } })
  const { portableSnapshot } = await import('../src/lib/shared-json/files')
  const now = Date.now()
  const bookmark = { id: 'icon', title: '图标', url: 'https://example.com', tags: [], createdAt: now, updatedAt: now }
  try {
    Object.assign(globalThis, { Buffer: undefined })
    const portable = JSON.parse(await portableSnapshot({ groups: [], bookmarks: [
      { ...bookmark, icon: { type: 'custom', data } },
      { ...bookmark, id: 'remote', icon: { type: 'remote', src: 'https://example.com/icon.png', cache: data } }
    ] }))
    assert.deepEqual(portable.bookmarks.map((item: any) => item.icon), Array(2).fill({ type: 'custom', data }))
    for (const invalid of ['data:image/png;base64,', 'data:image/png;base64,a===', 'data:image/png;base64,ab==']) {
      await assert.rejects(portableSnapshot({ groups: [], bookmarks: [
        { ...bookmark, icon: { type: 'custom', data: invalid } }
      ] }), /图标.*无效/)
    }
    await assert.rejects(portableSnapshot({ groups: [], bookmarks: [
      { ...bookmark, icon: { type: 'custom', data: `data:image/png;base64,${'AAAA'.repeat(700000)}` } }
    ] }), /图标超过 2 MiB/)
  } finally {
    Object.assign(globalThis, { window: previousWindow, Buffer: previousBuffer })
  }
})
