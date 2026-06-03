import { useCallback } from 'react'
import type { Bookmark } from '@/types/bookmark'
import { getTemplateLabel, resolveBookmarkLaunchUrl } from '@/lib/utils'
import { addBehaviorLog } from '@/lib/debugReport'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { useUIManager } from './useUIManager'

/**
 * 书签打开 / 复制 / 删除 / 重排操作（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue composable。React 版：
 *   - store / settingsStore 在回调内用 .getState() 取最新值；showToast 订阅自 useUIManager。
 *   - 已移除全部 trackEvent 上报（保留业务逻辑）。注意 openUrl 的入参对象名仍叫
 *     `analytics`（保留打开链接逻辑），但其中不再触发任何上报。
 *   - 修复旧版 openExternalUrl 自我递归的 bug：非 Tauri 环境改用 window.open。
 * 本地使用统计（useStatsStore.recordClick/recordUse）保留——这是业务排序数据，非外部埋点。
 */

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

const isTauriRuntime = () =>
  typeof window !== 'undefined' && (!!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__)

// 非 uTools 环境下打开外链：Tauri 用系统浏览器，普通浏览器用 window.open
const openExternalUrl = (url: string) => {
  if (isTauriRuntime()) {
    import('@tauri-apps/plugin-shell')
      .then(({ open }) => open(url))
      .catch(() => window.open(url, '_blank'))
    return
  }
  window.open(url, '_blank')
}

export function useBookmarkOperations() {
  const showToast = useUIManager((s) => s.showToast)
  const isDevRuntime = import.meta.env.DEV

  const notifyCopySuccess = useCallback(() => {
    showToast({ title: '已复制书签地址', variant: 'success', duration: 2000 })
  }, [showToast])

  const copyText = useCallback(async (text: string, onSuccess: () => void) => {
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

      if (!successful) throw new Error('无法访问剪贴板')

      onSuccess()
      return true
    } catch {
      return false
    }
  }, [])

  const copyBookmarkUrl = useCallback(
    async (bookmark: Bookmark) => {
      if (!bookmark || !bookmark.url) return
      const copied = await copyText(bookmark.url, notifyCopySuccess)
      if (!copied) {
        showToast({
          title: '复制失败',
          description: '由于环境限制，请手动开启书签后在地址栏复制',
          variant: 'error'
        })
      }
    },
    [copyText, notifyCopySuccess, showToast]
  )

  const copyBookmarkDescription = useCallback(
    async (bookmark: Bookmark) => {
      const desc = bookmark?.desc?.trim()
      if (!desc) {
        showToast({ title: '暂无描述可复制', variant: 'error' })
        return
      }

      const copied = await copyText(desc, () => {
        showToast({ title: '已复制描述', variant: 'success', duration: 2000 })
      })

      if (!copied) {
        showToast({
          title: '复制失败',
          description: '由于环境限制，请手动选中描述后复制',
          variant: 'error'
        })
      }
    },
    [copyText, showToast]
  )

  const openUrl = useCallback(
    (
      url: string,
      analytics?: {
        source?: string
        openMethod?: 'keyboard' | 'click' | 'command' | 'plugin'
        bookmarkId?: string
        hasTemplate?: boolean
      }
    ) => {
      // 入参对象名保留为 analytics（保留打开逻辑），但不再触发任何埋点上报。
      void analytics
      const settingsStore = useSettingsStore.getState()

      if (window.utools) {
        const utoolsApi = window.utools as unknown as UToolsExtendedApi | undefined
        const canUseInner = !!utoolsApi?.ubrowser
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
            if (isDetachedWindowNow()) window.utools.outPlugin()
          } catch (e) {
            console.warn('Failed to auto close window', e)
          }
        }
        return
      }
      openExternalUrl(url)
    },
    []
  )

  const openBookmarkLink = useCallback(
    (bookmark: Bookmark, options: OpenBookmarkOptions = {}) => {
      const store = useBookmarkStore.getState()
      // 记录书签点击统计（本地业务数据，非外部埋点）
      useStatsStore.getState().recordClick(bookmark.id)

      if (isDevRuntime) console.info('[Bookmark] open', bookmark)
      addBehaviorLog('open', `${bookmark.title || ''} ${bookmark.url || ''}`.trim())

      const raw = typeof bookmark.url === 'string' ? bookmark.url : ''
      const hasTemplate = /{[^}]+}/.test(raw)
      const queryFromOptions = typeof options.query === 'string' ? options.query.trim() : undefined
      const queryFromUi =
        options.useUiQuery === false ? '' : (typeof store.search === 'string' ? store.search : '').trim()
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
        hasTemplate
      })
    },
    [isDevRuntime, openUrl]
  )

  const openUrlInUtoolsBrowser = useCallback((url: string) => {
    const settingsStore = useSettingsStore.getState()
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
          if (isDetachedWindowNow()) window.utools.outPlugin()
        } catch (e) {
          console.warn('Failed to auto close window', e)
        }
      }
      return
    }
    openExternalUrl(url)
  }, [])

  const handleRemove = useCallback((bookmark: Bookmark) => {
    // 只从当前位置移除书签（如果还有其他位置则保留书签）
    const store = useBookmarkStore.getState()
    store.removeBookmarkFromLocation(bookmark.id, store.activeGroupId, store.activeSubGroupId)
  }, [])

  const emptyTrash = useCallback(() => {
    useBookmarkStore.getState().emptyTrash()
  }, [])

  const handleReorder = useCallback(({ fromId, toId }: { fromId: string; toId: string }) => {
    const store = useBookmarkStore.getState()
    if (store.search) return
    const groupId = store.activeGroupId
    const subId = store.activeSubGroupId
    if (!groupId || !subId || groupId === TRASH_GROUP_ID) return
    store.reorderInSub(groupId, subId, fromId, toId)
  }, [])

  return {
    openBookmarkLink,
    copyBookmarkUrl,
    copyBookmarkDescription,
    openUrl,
    openUrlInUtoolsBrowser,
    getTemplateLabel,
    handleRemove,
    emptyTrash,
    handleReorder
  }
}
