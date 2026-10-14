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

test('网站 ICO 的标准 MIME 可写入并规范化，不修改原图标', async () => {
  const previousWindow = globalThis.window
  Object.assign(globalThis, { window: { require: createRequire(import.meta.url) } })
  const { portableSnapshot } = await import('../src/lib/shared-json/files')
  const data = 'data:image/vnd.microsoft.icon;base64,aWNvbg=='
  const normalized = 'data:image/x-icon;base64,aWNvbg=='
  const now = Date.now()
  const bookmark = { id: 'ico', title: 'tailscale 设备列表', url: 'https://example.com', tags: [], createdAt: now, updatedAt: now }
  const snapshot = { groups: [], bookmarks: [
    { ...bookmark, icon: { type: 'custom' as const, data, bgColor: '#fff' } },
    { ...bookmark, id: 'remote-ico', icon: { type: 'remote' as const, src: 'https://example.com/favicon.ico', cache: data } }
  ] }
  try {
    const portable = JSON.parse(await portableSnapshot(snapshot))
    assert.deepEqual(portable.bookmarks.map((item: any) => item.icon), [
      { type: 'custom', data: normalized, bgColor: '#fff' }, { type: 'custom', data: normalized }
    ])
    assert.equal(snapshot.bookmarks[0].icon.data, data)
    assert.equal(snapshot.bookmarks[1].icon.cache, data)
    for (const invalid of ['data:image/vnd.microsoft.icon;base64,ab==', 'data:text/html;base64,aWNvbg==']) {
      await assert.rejects(portableSnapshot({ groups: [], bookmarks: [
        { ...bookmark, icon: { type: 'custom', data: invalid } }
      ] }), /图标.*无效/)
    }
  } finally { Object.assign(globalThis, { window: previousWindow }) }
})
