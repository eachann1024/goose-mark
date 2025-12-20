
import { reactive, ref, computed } from 'vue'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import type { Bookmark } from '@/types/bookmark'

type UToolsExtendedApi = {
  copyText?: (text: string) => void
  showNotification?: (body: string) => void
  shellOpenExternal?: (url: string) => void
  createBrowserWindow?: (url: string, options?: Record<string, unknown>) => void
  outPlugin?: () => void
  getWindowType?: () => string
}

export function useBookmarkOperations() {
  const store = useBookmarkStore()
  const settingsStore = useSettingsStore()

  // Delete Confirmation State
  const showDeleteConfirm = ref(false)
  const confirmDeleteId = ref('')

  // Copy Notice State
  const copyNotice = reactive({
    visible: false,
    text: ''
  })
  let copyNoticeTimer: ReturnType<typeof setTimeout> | null = null

  // Helpers
  const getWindowType = () => {
    try {
      return window.utools?.getWindowType?.()
    } catch {
      return undefined
    }
  }

  const isDetachedWindowNow = () => {
    const type = getWindowType()
    return type === 'detach' || type === 'browser'
  }

  const getTemplateLabel = (url: string) => {
    const label = (url.match(/{([^}]+)}/)?.[1] ?? '').trim()
    return label || '搜索内容'
  }

  // Actions
  const notifyCopySuccess = () => {
    copyNotice.text = '已复制链接'
    copyNotice.visible = true
    if (copyNoticeTimer) clearTimeout(copyNoticeTimer)
    copyNoticeTimer = setTimeout(() => {
      copyNotice.visible = false
    }, 1400)
  }

  const copyBookmarkUrl = async (bookmark: Bookmark) => {
    try {
      const utoolsApi = window.utools as unknown as UToolsExtendedApi | undefined
      if (utoolsApi?.copyText) {
        utoolsApi.copyText(bookmark.url)
        notifyCopySuccess()
        return
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(bookmark.url)
        notifyCopySuccess()
      }
    } catch (error) {
      console.warn('[Bookmark] 复制链接失败', error)
    }
  }

  const openBookmarkLink = (bookmark: Bookmark) => {
    const raw = typeof bookmark.url === 'string' ? bookmark.url : ''
    const hasTemplate = /{[^}]+}/.test(raw)
    const queryFromUi = (typeof store.search === 'string' ? store.search : '').trim()
    
    let url = raw

    if (hasTemplate) {
      if (queryFromUi) {
        // User provided keywords (search mode)
        url = raw.replace(/{[^}]+}/g, encodeURIComponent(queryFromUi))
      } else {
        // Direct open (no keywords) -> Fallback to "Home"
        try {
          // Ensure protocol for parsing
          let tempRaw = raw
          if (!/^https?:\/\//i.test(tempRaw)) tempRaw = 'https://' + tempRaw
          
          const urlObj = new URL(tempRaw)
          // Check if template is in query string
          // Heuristic: check if raw string has ? and the first { appears after ?
          const qIndex = raw.indexOf('?')
          const tIndex = raw.indexOf('{')
          
          if (qIndex !== -1 && tIndex > qIndex) {
            // Template is in query params -> Remove query params, keep path
            urlObj.search = ''
            url = urlObj.toString()
          } else {
            // Template is likely in path -> Fallback to origin (safest)
            url = urlObj.origin
          }
        } catch (e) {
          // Fallback if URL parsing fails
          const label = getTemplateLabel(raw)
          window.utools?.showNotification?.(`请输入${label}`)
          return
        }
      }
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url
    }
    
    openUrl(url)
  }

  const openUrl = (url: string) => {
    if (window.utools) {
      const utoolsApi = window.utools as unknown as UToolsExtendedApi | undefined
      const canUseInner = settingsStore.preferUtoolsBrowser && typeof utoolsApi?.createBrowserWindow === 'function'
      let opened = false
      if (canUseInner) {
        try {
          const path = window.location.pathname || ''
          const base = path.includes('/dist/') ? 'dist/' : ''
          const bridgeUrl = `${base}browser.html?target=${encodeURIComponent(url)}`
          utoolsApi?.createBrowserWindow?.(bridgeUrl)
          opened = true
        } catch (e) {
          console.warn('[Bookmark] 内置浏览器打开失败', e)
        }
      }
      if (!opened) utoolsApi?.shellOpenExternal?.(url)
      if (settingsStore.autoCloseWindow) {
        try {
          if (isDetachedWindowNow()) {
            window.utools.outPlugin()
          }
        } catch (e) {
          console.warn('Failed to auto close window', e)
        }
      }
      return
    }
    window.open(url, '_blank')
  }

  const handleRemove = (bookmark: Bookmark) => {
    store.removeBookmark(bookmark.id)
  }

  // For context menu or other places that need confirmation
  const requestDelete = (id: string) => {
    confirmDeleteId.value = id
    showDeleteConfirm.value = true
  }

  const confirmDelete = () => {
    if (confirmDeleteId.value) {
      store.removeBookmark(confirmDeleteId.value)
    }
    showDeleteConfirm.value = false
  }

  const emptyTrash = () => {
    store.emptyTrash()
  }

  const handleReorder = ({ fromId, toId }: { fromId: string; toId: string }, isSearching: boolean) => {
    if (isSearching) return
    const groupId = store.activeGroupId
    const subId = store.activeSubGroupId
    if (!groupId || !subId || groupId === TRASH_GROUP_ID) return
    store.reorderInSub(groupId, subId, fromId, toId)
  }

  return {
    showDeleteConfirm,
    confirmDeleteId,
    copyNotice,
    openBookmarkLink,
    copyBookmarkUrl,
    openUrl,
    handleRemove,
    requestDelete,
    confirmDelete,
    emptyTrash,
    handleReorder,
    getTemplateLabel
  }
}
