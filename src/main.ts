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

// 应用启动后异步生成图标缓存，提升后续搜索体验
setTimeout(() => {
  bookmarkStore.generateIconCaches().catch(e => {
    console.warn('[App] 图标缓存生成失败:', e)
  })
}, 1000) // 提前到1秒启动，确保在syncFeatures前完成

// 开发调试用：在控制台中可以调用 window.refreshIconCaches() 来手动刷新图标缓存
if (import.meta.env.DEV) {
  (window as any).refreshIconCaches = () => bookmarkStore.refreshIconCaches()
}
