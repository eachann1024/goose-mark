
import { ref, computed, watch } from 'vue'
import { useDark, useToggle } from '@vueuse/core'
import { useThemeStore } from '@/stores/theme'

export function useAppState() {
  const tab = ref<'bookmarks' | 'settings'>('bookmarks')

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
