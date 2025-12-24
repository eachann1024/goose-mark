import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import './assets/index.css'
import 'uno.css'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
setActivePinia(pinia)
const settingsStore = useSettingsStore()
const { setExpendHeight } = useUTools()
setExpendHeight(settingsStore.windowHeight)
initConsoleCapture()
app.mount('#app')
