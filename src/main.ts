import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import './assets/index.css'
import './assets/fonts.css'
import 'uno.css'
import { useBookmarkStore } from '@/stores/bookmark'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
setActivePinia(pinia)
const settingsStore = useSettingsStore()
const bookmarkStore = useBookmarkStore()
const { setExpendHeight } = useUTools()
setExpendHeight(settingsStore.windowHeight)
initConsoleCapture()
app.mount('#app')

// 应用启动后异步生成全局搜索图标缓存，提升后续搜索体验
setTimeout(() => {
  if (!settingsStore.autoMatchSearchIcons) return
  bookmarkStore.generateSearchIconCaches().then(report => {
    if (!report) return
    const summary = `[IconCache] 搜索图标缓存完成: ${report.success}/${report.total} 成功, ${report.failed} 失败`
    console.log(summary)
    if (report.failedTitles.length > 0) {
      console.log(`[IconCache] 失败: ${report.failedTitles.join('、')}`)
    }
    settingsStore.addIconMatchLog({
      time: Date.now(),
      scope: 'search',
      total: report.total,
      success: report.success,
      failed: report.failed,
      failedTitles: report.failedTitles
    })
  }).catch(e => {
    console.warn('[App] 图标缓存生成失败:', e)
  })
}, 1000) // 提前到1秒启动，确保在syncFeatures前完成

// 开发调试用：在控制台中可以调用 window.refreshIconCaches() 来手动刷新图标缓存
if (import.meta.env.DEV) {
  (window as any).refreshIconCaches = () => bookmarkStore.refreshIconCaches()
}
