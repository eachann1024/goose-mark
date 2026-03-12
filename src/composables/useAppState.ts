import { ref, computed, watch } from 'vue'
import { useDark, useToggle } from '@vueuse/core'
import { getPersistentItem, utoolsStorage } from '@/lib/utoolsStorage'


// 模块级共享状态
const storedTab = typeof localStorage !== 'undefined' ? localStorage.getItem('app-tab') : null
const tab = ref<'bookmarks' | 'settings'>(storedTab === 'settings' ? 'settings' : 'bookmarks')
const themeStorageKey = 'goose-marks.theme-mode'

// 迁移历史主题配置，避免老版本切换结果在升级后丢失。
getPersistentItem(themeStorageKey, ['vueuse-color-scheme'])

const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
  storageKey: themeStorageKey,
  storage: utoolsStorage,
})
const toggleDark = useToggle(isDark)
const isUTools = ref(typeof window !== 'undefined' && !!window.utools)

// 持久化 tab 状态
if (typeof localStorage !== 'undefined') {
  watch(tab, (v) => localStorage.setItem('app-tab', v))
}
export function useAppState() {
  const isMac = computed(() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    const platform = (navigator as any).platform || ''
    return /mac/i.test(platform) || /macintosh/i.test(ua)
  })

  return {
    tab,
    isDark,
    toggleDark,
    isUTools,
    isMac,
  }
}
