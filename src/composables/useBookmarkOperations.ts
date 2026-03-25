
import type { Bookmark } from '@/types/bookmark'
import { getTemplateLabel, resolveBookmarkLaunchUrl } from '@/lib/utils'
import { trackEvent } from '@/services/analytics'

type UToolsExtendedApi = {
  copyText?: (text: string) => void
  shellOpenExternal?: (url: string) => void
  ubrowser?: {
    goto(url: string): { run(options?: { width?: number; height?: number }): Promise<unknown[]> }
  }
  outPlugin?: () => void
  getWindowType?: () => string
}

type OpenBookmarkOptions = {
  query?: string
  useUiQuery?: boolean
  source?: string
  openMethod?: 'keyboard' | 'click' | 'command' | 'plugin'
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

  // Actions
  const notifyCopySuccess = () => {
    showToast({
      title: '已复制书签地址',
      variant: 'success',
      duration: 2000
    })
  }

  const copyText = async (text: string, onSuccess: () => void) => {
    try {
      if (window.utools && typeof window.utools.copyText === 'function') {
        window.utools.copyText(text)
        onSuccess()
        return true
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(text)
          onSuccess()
          return true
        } catch (clipboardErr) {
          console.warn('[Bookmark] Clipboard API 失败，尝试备用方案', clipboardErr)
        }
      }

      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '0'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (!successful) {
        throw new Error('无法访问剪贴板')
      }

      onSuccess()
      return true
    } catch {
      return false
    }
  }

  const copyBookmarkUrl = async (bookmark: Bookmark) => {
    if (!bookmark || !bookmark.url) return

    const copied = await copyText(bookmark.url, notifyCopySuccess)
    if (!copied) {
      showToast({
        title: '复制失败',
        description: '由于环境限制，请手动开启书签后在地址栏复制',
        variant: 'error'
      })
    }
  }

  const copyBookmarkDescription = async (bookmark: Bookmark) => {
    const desc = bookmark?.desc?.trim()
    if (!desc) {
      showToast({
        title: '暂无描述可复制',
        variant: 'error'
      })
      return
    }

    const copied = await copyText(desc, () => {
      showToast({
        title: '已复制描述',
        variant: 'success',
        duration: 2000
      })
    })

    if (!copied) {
      showToast({
        title: '复制失败',
        description: '由于环境限制，请手动选中描述后复制',
        variant: 'error'
      })
    }
  }

  const openBookmarkLink = (bookmark: Bookmark, options: OpenBookmarkOptions = {}) => {
    // 记录书签点击统计
    const statsStore = useStatsStore()
    statsStore.recordClick(bookmark.id)
    
    if (isDevRuntime) {
      console.info('[Bookmark] open', bookmark)
    }
    addBehaviorLog('open', `${bookmark.title || ''} ${bookmark.url || ''}`.trim())
    const raw = typeof bookmark.url === 'string' ? bookmark.url : ''
    const hasTemplate = /{[^}]+}/.test(raw)
    const queryFromOptions = typeof options.query === 'string' ? options.query.trim() : undefined
    const queryFromUi = options.useUiQuery === false
      ? ''
      : (typeof store.search === 'string' ? store.search : '').trim()
    const query = queryFromOptions ?? queryFromUi
    const url = resolveBookmarkLaunchUrl(raw, query)

    if (!url) {
      if (hasTemplate) {
        const label = getTemplateLabel(raw)
        console.info(`[Bookmark] 模板书签需要输入${label}`)
      }
      return
    }

    store.updateBookmark(bookmark.id, {})
    openUrl(url, {
      source: options.source ?? (query ? 'search' : 'bookmark'),
      openMethod: options.openMethod,
      bookmarkId: bookmark.id,
      hasTemplate,
    })
  }

  const openUrl = (url: string, analytics?: {
    source?: string
    openMethod?: 'keyboard' | 'click' | 'command' | 'plugin'
    bookmarkId?: string
    hasTemplate?: boolean
  }) => {
    trackEvent('bookmark_open', {
      source: analytics?.source,
      openMethod: analytics?.openMethod,
      bookmarkId: analytics?.bookmarkId,
      hasTemplate: analytics?.hasTemplate,
      useUtoolsBrowser: settingsStore.preferUtoolsBrowser,
      autoCloseWindow: settingsStore.autoCloseWindow,
    })

    if (analytics?.source === 'search' && analytics?.openMethod) {
      trackEvent('search_result_open', {
        openMethod: analytics.openMethod,
        bookmarkId: analytics.bookmarkId,
      })
    }

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
    copyBookmarkDescription,
    openUrl,
    openUrlInUtoolsBrowser,
    handleRemove,
    requestDelete,
    confirmDelete,
    emptyTrash,
    handleReorder
  }
}
