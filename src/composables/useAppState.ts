
import { ref, computed, watch } from 'vue'
import { useDark, useToggle } from '@vueuse/core'


// 模块级共享状态
const storedTab = typeof localStorage !== 'undefined' ? localStorage.getItem('app-tab') : null
const tab = ref<'bookmarks' | 'settings'>(storedTab === 'settings' ? 'settings' : 'bookmarks')

// 持久化 tab 状态
if (typeof localStorage !== 'undefined') {
  watch(tab, (v) => localStorage.setItem('app-tab', v))
}

export function useAppState() {

  const isDark = useDark({
    selector: 'html',
    attribute: 'class',
    valueDark: 'dark',
    valueLight: '',
  })
  const toggleDark = useToggle(isDark)

  const isUTools = ref(typeof window !== 'undefined' && !!window.utools)

  const isMac = computed(() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    const platform = (navigator as any).platform || ''
    return /mac/i.test(platform) || /macintosh/i.test(ua)
  })

  // Theme Logic
  const themeStore = useThemeStore()
  watch(() => themeStore.currentTheme, (v) => {
    document.documentElement.dataset.theme = v
  }, { immediate: true })

  return {
    tab,
    isDark,
    toggleDark,
    isUTools,
    isMac,
  }
}
