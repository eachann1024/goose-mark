import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 首页改造：以「鹅的书签 · 配色改造预览」为新首页（旧业务壳 App.tsx 暂保留在仓库，未删除）。
import HomePage from './views/home/HomePage'
import './assets/index.css'
import 'virtual:uno.css'
import './assets/fonts.css'
import { getRuntimePlatform } from '@/lib/platform'
import { initErrorReporting } from '@/lib/errorReporting'
import { initializeBookmarkStorePersistence, useBookmarkStore } from '@/stores/bookmark'
import { initializeSettingsStorePersistence } from '@/stores/settings'
import { initializeSharedJsonSync } from '@/lib/sharedJson'
// 平台检测：window.utools 存在 → uTools 模式，否则独立浏览器调试模式。
initErrorReporting()
const platform = getRuntimePlatform()
if (import.meta.env.DEV) {
  console.log(`[Main] 运行模式: ${platform}`)
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('[Main] 未找到挂载节点 #root')
}

// HMR 守卫：开发期 Vite 热更新会重复执行本模块，若每次都 createRoot()
// 而旧 root 不卸载，会把多份 App 叠挂到同一个 #root（多实例 bug）。
// 这里把 root 缓存到 container 上，模块重执行时复用同一个 root。
type RootHolder = HTMLElement & { __gooseRoot?: ReturnType<typeof createRoot> }
const holder = container as RootHolder
const root = holder.__gooseRoot ?? (holder.__gooseRoot = createRoot(container))

const bootstrap = async () => {
  let cacheReadable = true
  // 缓存只用于首次迁移；损坏时仍继续读取权威文件，不能让缓存阻断插件启动。
  for (const initialize of [initializeSettingsStorePersistence, initializeBookmarkStorePersistence]) {
    try { await initialize() }
    catch (error) {
      cacheReadable = false
      console.warn('[Main] 旧缓存读取失败，继续尝试 JSON 文件:', error)
    }
  }
  await initializeSharedJsonSync({ allowDefaultCreation: cacheReadable })
  // 权威文件读取完成后才补图标，避免旧缓存的后台任务污染刚读取的数据。
  if (!useBookmarkStore.getState().isReadOnly) {
    void useBookmarkStore.getState().backfillIconCache()
    void useBookmarkStore.getState().refreshMissingIcons()
  }

  root.render(
    <StrictMode>
      <HomePage />
    </StrictMode>
  )
}

void bootstrap()
