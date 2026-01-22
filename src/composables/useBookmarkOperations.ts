
import type { Bookmark } from '@/types/bookmark'

type UToolsExtendedApi = {
  copyText?: (text: string) => void
  shellOpenExternal?: (url: string) => void
  ubrowser?: {
    goto(url: string): { run(options?: { width?: number; height?: number }): Promise<unknown[]> }
  }
  outPlugin?: () => void
  getWindowType?: () => string
}

export function useBookmarkOperations() {
  const store = useBookmarkStore()
  const settingsStore = useSettingsStore()
  const { showToast } = useUIManager()
  const isDevRuntime = import.meta.env.DEV

  // Delete Confirmation State
  const showDeleteConfirm = ref(false)
  const confirmDeleteId = ref('')


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
    showToast({
      title: '已复制书签地址',
      variant: 'success',
      duration: 2000
    })
  }

  const copyBookmarkUrl = async (bookmark: Bookmark) => {
    if (!bookmark || !bookmark.url) return
    
    const url = bookmark.url
    
    try {
      // 1. 优先使用 uTools 原生 API
      if (window.utools && typeof window.utools.copyText === 'function') {
        window.utools.copyText(url)
        notifyCopySuccess()
        return
      }
      
      // 2. 尝试使用现代 Clipboard API
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(url)
          notifyCopySuccess()
          return
        } catch (clipboardErr) {
          console.warn('[Bookmark] Clipboard API 失败，尝试备用方案', clipboardErr)
        }
      }
      
      // 3. 最后的保底方案：execCommand('copy')
      const textArea = document.createElement('textarea')
      textArea.value = url
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '0'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      if (successful) {
        notifyCopySuccess()
      } else {
        throw new Error('无法访问剪贴板')
      }
    } catch (error) {
      showToast({
        title: '复制失败',
        description: '由于环境限制，请手动开启书签后在地址栏复制',
        variant: 'error'
      })
    }
  }

  const openBookmarkLink = (bookmark: Bookmark) => {
    // 记录书签点击统计
    const statsStore = useStatsStore()
    statsStore.recordClick(bookmark.id)
    
    if (isDevRuntime) {
      console.info('[Bookmark] open', bookmark)
    }
    addBehaviorLog('open', `${bookmark.title || ''} ${bookmark.url || ''}`.trim())
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
          console.info(`[Bookmark] 模板书签需要输入${label}`)
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
      const canUseInner = settingsStore.preferUtoolsBrowser && utoolsApi?.ubrowser
      let opened = false
      if (canUseInner) {
        try {
          utoolsApi.ubrowser?.goto(url).run({ width: 1280, height: 800 })
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

  const openUrlInUtoolsBrowser = (url: string) => {
    if (window.utools) {
      const utoolsApi = window.utools as unknown as UToolsExtendedApi | undefined
      if (utoolsApi?.ubrowser) {
        try {
          utoolsApi.ubrowser.goto(url).run({ width: 1280, height: 800 })
        } catch (e) {
          console.warn('[Bookmark] 内置浏览器打开失败', e)
          utoolsApi?.shellOpenExternal?.(url)
        }
      } else {
        utoolsApi?.shellOpenExternal?.(url)
      }
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
    // 只从当前位置移除书签（如果还有其他位置则保留书签）
    const groupId = store.activeGroupId
    const subGroupId = store.activeSubGroupId
    
    store.removeBookmarkFromLocation(bookmark.id, groupId, subGroupId)
    
  }

  // For context menu or other places that need confirmation
  const requestDelete = (id: string) => {
    confirmDeleteId.value = id
    showDeleteConfirm.value = true
  }

  const confirmDelete = () => {
    if (confirmDeleteId.value) {
      // 只从当前位置移除书签
      const groupId = store.activeGroupId
      const subGroupId = store.activeSubGroupId
      
      store.removeBookmarkFromLocation(confirmDeleteId.value, groupId, subGroupId)
      
    }
    showDeleteConfirm.value = false
  }

  const emptyTrash = () => {
    store.emptyTrash()
  }

  const handleReorder = ({ fromId, toId }: { fromId: string; toId: string }) => {
    if (store.search) return
    const groupId = store.activeGroupId
    const subId = store.activeSubGroupId
    if (!groupId || !subId || groupId === TRASH_GROUP_ID) return
    store.reorderInSub(groupId, subId, fromId, toId)
  }

  return {
    showDeleteConfirm,
    confirmDeleteId,
    openBookmarkLink,
    copyBookmarkUrl,
    openUrl,
    openUrlInUtoolsBrowser,
    handleRemove,
    requestDelete,
    confirmDelete,
    emptyTrash,
    handleReorder,
    getTemplateLabel
  }
}
