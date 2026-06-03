import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './assets/index.css'
import './assets/fonts.css'
import { getRuntimePlatform } from '@/lib/platform'
import { useBookmarkStore } from '@/stores/bookmark'

// 平台检测：window.utools 存在 → uTools 模式，否则独立（浏览器 / Tauri）模式。
const platform = getRuntimePlatform()
if (import.meta.env.DEV) {
  console.log(`[Main] 运行模式: ${platform}`)
}

// 启动引导：旧版数据迁移（保留二级分组 + 回收站 + bookmarkIds 引用结构）。
// 持久化已由 zustand persist + piniaCompatStorage 在 store 创建时自动水合，
// 这里只做格式迁移与选中态兜底。
useBookmarkStore.getState().migrateFromLegacy()

const container = document.getElementById('root')
if (!container) {
  throw new Error('[Main] 未找到挂载节点 #root')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
