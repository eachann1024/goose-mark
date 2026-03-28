import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Clarity from '@microsoft/clarity'
import App from './App.vue'
import './assets/index.css'
import './assets/fonts.css'
import 'uno.css'
import { initMcpToolsBridge } from '@/composables/useMcpTools'
import { useBookmarkStore } from '@/stores/bookmark'
import { identifyUser, trackEvent } from '@/services/analytics'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
setActivePinia(pinia)
const settingsStore = useSettingsStore()
const bookmarkStore = useBookmarkStore()
const { setExpendHeight } = useUTools()
const { start, bootstrapLocalFirstIfEnabled, hydrateMirrorDirectoryForDevice } = useLocalDataMirror()

const bootstrapApp = async () => {
  Clarity.init('w0v2zn6wcr')
  const currentUser = window.utools?.getUser?.()
  const nickname = currentUser?.nickname?.trim() || '匿名用户'
  const userType = currentUser?.type || 'guest'
  const clarityUserId = `${nickname}#${userType}`
  identifyUser(clarityUserId, {
    friendlyName: nickname,
    tags: {
      user_id: clarityUserId,
      nickname,
      user_type: userType,
      test_environment: import.meta.env.DEV ? 'utools-dev' : 'utools-prod',
    }
  })
  trackEvent('app_launch')
  setExpendHeight(settingsStore.windowHeight)
  bookmarkStore.migrateFromLegacy()
  hydrateMirrorDirectoryForDevice()
  try {
    await bootstrapLocalFirstIfEnabled()
  } catch (error) {
    console.warn('[Main] 本地优先引导失败，回退到当前数据:', error)
  }
  initMcpToolsBridge()
  start()
  initConsoleCapture()
  app.mount('#app')
}

bootstrapApp()

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
