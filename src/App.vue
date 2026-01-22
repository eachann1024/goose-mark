<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { useSync } from '@/composables/useSync'
import { onUnmounted } from 'vue'

import type { Bookmark } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import OnboardingBanner from '@/components/OnboardingBanner.vue'
import QuickSaveDialog from '@/components/QuickSaveDialog.vue'
import { parseHtmlBookmarks, isHtmlBookmarkFile } from '@/lib/htmlBookmarkParser'
import { ensureIconForBookmark, fetchPageMeta } from '@/services/iconCache'

// Stores
const store = useBookmarkStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const { toastState, closeToast, showToast, tooltipProviderKey, onMainViewSwitch } = useUIManager()

// Composables
const { tab, isDark, toggleDark, isUTools, isMac } = useAppState()
const { isSyncing, syncError } = useSync()
const { generateMetadata } = useAI()
const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu()
const {
  openBookmarkLink: originalOpenBookmarkLink,
  openUrl,
  openUrlInUtoolsBrowser,
  copyBookmarkUrl,
  handleRemove,
  confirmDelete,
  emptyTrash,
  handleReorder,
  showDeleteConfirm,
  confirmDeleteId,
  getTemplateLabel
} = useBookmarkOperations()

const openBookmarkLink = (bookmark: Bookmark) => {
  const hasTemplate = /{[^}]+}/.test(bookmark.url)
  
  if (hasTemplate) {
    enterTemplateMode(bookmark)
    return
  }
  
  originalOpenBookmarkLink(bookmark)
}

// 暂停/恢复 watcher 的标记
const isSyncPaused = ref(false)


const {
  showAdd,
  openAdd,
  openAddWithUrl,
  openEdit,
} = useBookmarkForm()

const {
  syncFeatures,
  getEnterText,
  isDetachedWindowNow,
  FEATURE_PREFIX,
  setExpendHeight
} = useUTools()

// 防抖定时器引用
let syncTimeout: NodeJS.Timeout | null = null

// Shared State
const selectedIndex = ref(-1)


const handleSelectGroup = async (groupId: string) => {
  store.selectGroup(groupId)
  tab.value = "bookmarks"
}


// Window Height Watcher
watch(() => settingsStore.windowHeight, (h) => {
  setExpendHeight(h)
})

// Search
const canUseSubInput = computed(() => {
  if (!isUTools.value) return false
  try {
     return !isDetachedWindowNow()
  } catch {
     return false
  }
})

// Search
const {
  localSearchInputRef,
  searchViewOpen,
  searchValue,
  searchResults,
  activeBookmarks,
  searchAutoExitText,
  openSearchView,
  closeSearchView,
  handleSubInput,
  focusUToolsInput,
} = useSearch(tab, selectedIndex, isUTools)

// SearchOverlay 组件 ref
const searchOverlayRef = ref<{ 
  focus: () => void;
  localSearchInputRef?: HTMLInputElement | null 
} | null>(null)

// 当搜索视图打开时，同步并聚焦输入框
watch(searchViewOpen, (isOpen) => {
  if (isOpen && !canUseSubInput.value) {
    nextTick(() => {
      requestAnimationFrame(() => {
        const overlay = searchOverlayRef.value
        if (overlay && typeof overlay.focus === 'function') {
          // 1. 调用组件的 focus 方法确保聚焦
          overlay.focus()
          
          // 2. 同步 DOM 元素给 useSearch (用于其他逻辑)
          // 注意：被 expose 的 ref 会自动解包，所以这里直接获取即可
          const inputEl = overlay.localSearchInputRef
          if (inputEl instanceof HTMLInputElement) {
            localSearchInputRef.value = inputEl
            // 确保光标在末尾 (focus 可能已经做了，但双重保险)
            const len = inputEl.value?.length ?? 0
            try { inputEl.setSelectionRange(len, len) } catch {}
          }
        }
      })
    })
  }
})


// Keyboard
const {
  setBookmarkGridRef,
  showCmdHints,
  hintKeyById,
  hideCmdHints,
  handleLocalSearchKey,
} = useKeyboard(
  selectedIndex,
  activeBookmarks,
  searchViewOpen,
  isMac,
  showAdd,
  showDeleteConfirm,
  ref(false),
  tab,
  openBookmarkLink,
  // 新增参数：分组快捷键切换
  computed(() => store.groups),
  computed(() => store.activeGroupId),
  (groupId: string) => {
    store.selectGroup(groupId)
    tab.value = "bookmarks"
  }
)

// hintKeyById 包装函数供模板使用
const getHintKey = (id: string) => hintKeyById.value[id]

// Group Helpers
const activeGroup = computed(() => store.groups.find(g => g.id === store.activeGroupId))
const activeSubGroups = computed(() => activeGroup.value?.children ?? [])
const shouldShowSubs = computed(() => activeSubGroups.value.length > 1)
// 监听彩蛋状态，同步到 body 类名
watch([() => settingsStore.easterEggEnabled, isDark], ([enabled, dark]) => {
  if (enabled && dark) {
    document.body.classList.add('easter-egg-active')
  } else {
    document.body.classList.remove('easter-egg-active')
  }
}, { immediate: true })

const visibleGroups = computed(() => store.groups.filter(g => g.id !== TRASH_GROUP_ID))
const isTrashActive = computed(() => store.activeGroupId === TRASH_GROUP_ID)
const currentSubGroup = computed(() => 
  activeSubGroups.value.find(s => s.id === store.activeSubGroupId)
)

// 更新页面标题
const updatePageTitle = () => {
  const baseTitle = '鹅的书签'
  const parts: string[] = []

  if (tab.value === 'settings') {
    parts.push('设置')
  } else if (isTrashActive.value) {
    parts.push('回收站')
  } else {
    // 添加子分组名称
    if (currentSubGroup.value && shouldShowSubs.value) {
      parts.push(currentSubGroup.value.name)
    }
    // 添加分组名称
    if (activeGroup.value && activeGroup.value.id !== TRASH_GROUP_ID) {
      parts.push(activeGroup.value.name)
    }
  }

  // 如果有部分，则组合标题；否则使用基础标题
  document.title = parts.length > 0 ? `${parts.join(' - ')} - ${baseTitle}` : baseTitle
}

// Coordination Watchers
watch(() => store.search, () => hideCmdHints())
watch(() => tab.value, () => {
  hideCmdHints()
  onMainViewSwitch()
  updatePageTitle()
})

watch([() => store.activeGroupId, () => store.activeSubGroupId], () => {
  selectedIndex.value = -1
  hideCmdHints()
  updatePageTitle()
})


// 书签点击逻辑：左键打开，右键复制
const handleBookmarkClick = (bookmark: Bookmark) => {
  openBookmarkLink(bookmark)
}

const handleBookmarkRightClick = (e: MouseEvent, bookmark: Bookmark) => {
  e.preventDefault()
  copyBookmarkUrl(bookmark)
}

const handleContextMenuWrapper = (e: MouseEvent, bookmark: Bookmark) => {
  console.log('[ContextMenu] triggered:', bookmark?.title, 'at', e.clientX, e.clientY)
  e.preventDefault()
  e.stopPropagation() // 阻止冒泡，避免触发 document 的 click/contextmenu 导致菜单立即关闭
  handleContextMenu(e, bookmark)
}

// 书签拖拽到子分组的处理
const handleBookmarkDrop = (bookmarkId: string, toSubId: string) => {
  const moved = store.moveBookmarkToSubGroup(
    bookmarkId,
    store.activeGroupId,
    store.activeSubGroupId,
    store.activeGroupId,
    toSubId
  )
  if (moved) {
    showToast({ title: '书签已移动', variant: 'success', duration: 1500 })
  }
}

const handleContextMenuAction = (action: string) => {
  const bookmark = contextMenu.target
  if (!bookmark) return

  switch (action) {
    case 'open':
      openBookmarkLink(bookmark)
      break
    case 'openInUtoolsBrowser':
      // 处理模板书签
      const raw = bookmark.url
      const hasTemplate = /{[^}]+}/.test(raw)
      const queryFromUi = (typeof store.search === 'string' ? store.search : '').trim()
      let url = raw
      if (hasTemplate) {
        if (queryFromUi) {
          url = raw.replace(/{[^}]+}/g, encodeURIComponent(queryFromUi))
        } else {
          // 无搜索词时跳转到首页
          try {
            let tempRaw = raw
            if (!/^https?:\/\//i.test(tempRaw)) tempRaw = 'https://' + tempRaw
            const urlObj = new URL(tempRaw)
            const qIndex = raw.indexOf('?')
            const tIndex = raw.indexOf('{')
            if (qIndex !== -1 && tIndex > qIndex) {
              urlObj.search = ''
              url = urlObj.toString()
            } else {
              url = urlObj.origin
            }
          } catch {
            return
          }
        }
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      openUrlInUtoolsBrowser(url)
      break
    case 'copy':
      copyBookmarkUrl(bookmark)
      break
    case 'edit':
      openEdit(bookmark)
      break
    case 'remove':
      handleRemove(bookmark)
      break
  }
}


// 引导导入书签
const handleOnboardingImport = async (file: File) => {
  try {
    const text = await file.text()
    
    if (isHtmlBookmarkFile(text)) {
      // HTML 格式：直接解析并导入
      const result = parseHtmlBookmarks(text)
      if (result.stats.totalBookmarks === 0) {
        showToast({ title: '导入失败', description: '未在文件中找到有效书签', variant: 'error' })
        return
      }
      
      // 简化导入：所有顶级文件夹都导入
      const now = Date.now()
      const uid = () => crypto.randomUUID()
      let addedGroups = 0
      let addedBookmarks = 0
      
      // 1. 处理根层级的书签（不在任何文件夹中）
      const rootBookmarks = result.flatBookmarks.filter(b => b.folderPath.length === 0)
      if (rootBookmarks.length > 0) {
        const newGroupId = uid()
        const subId = uid()
        const newBookmarks: Bookmark[] = rootBookmarks.map(b => ({
          id: uid(), title: b.title, url: b.url, desc: '', tags: [],
          createdAt: b.addDate || now, updatedAt: now,
          locations: [{ groupId: newGroupId, subGroupId: subId }]
        }))
        
        const newGroup = { 
          id: newGroupId, 
          name: '导入书签', 
          createdAt: now, 
          updatedAt: now, 
          children: [{ id: subId, name: '未分类', bookmarkIds: newBookmarks.map(b => b.id), createdAt: now, updatedAt: now }]
        }
        
        const trashIdx = store.groups.findIndex(g => g.id === TRASH_GROUP_ID)
        if (trashIdx !== -1) {
          store.groups.splice(trashIdx, 0, newGroup)
        } else {
          store.groups.push(newGroup)
        }
        store.bookmarks.push(...newBookmarks)
        addedGroups++
        addedBookmarks += newBookmarks.length
      }

      // 2. 处理文件夹结构
      result.folders.forEach(folder => {
        const newGroupId = uid()
        const newBookmarks: Bookmark[] = []
        const children: typeof store.groups[0]['children'] = []
        
        // 当前文件夹的书签放入默认子分组
        if (folder.bookmarks.length > 0) {
          const subId = uid()
          folder.bookmarks.forEach(b => {
            const bookmark: Bookmark = {
              id: uid(), title: b.title, url: b.url, desc: '', tags: [],
              createdAt: b.addDate || now, updatedAt: now,
              locations: [{ groupId: newGroupId, subGroupId: subId }]
            }
            newBookmarks.push(bookmark)
          })
          children.push({ id: subId, name: '未分类', bookmarkIds: newBookmarks.map(b => b.id), createdAt: now, updatedAt: now })
        }
        
        // 递归扁平化子文件夹
        const flattenFolder = (f: typeof folder, prefix: string): void => {
          const name = prefix ? `${prefix}/${f.name}` : f.name
          if (f.bookmarks.length > 0) {
            const subId = uid()
            f.bookmarks.forEach(b => {
              const bookmark: Bookmark = {
                id: uid(), title: b.title, url: b.url, desc: '', tags: [],
                createdAt: b.addDate || now, updatedAt: now,
                locations: [{ groupId: newGroupId, subGroupId: subId }]
              }
              newBookmarks.push(bookmark)
            })
            children.push({ id: subId, name, bookmarkIds: newBookmarks.slice(-f.bookmarks.length).map(b => b.id), createdAt: now, updatedAt: now })
          }
          f.children.forEach(child => flattenFolder(child, name))
        }
        folder.children.forEach(child => flattenFolder(child, ''))
        
        if (children.length === 0) {
          children.push({ id: uid(), name: '未分类', bookmarkIds: [], createdAt: now, updatedAt: now })
        }
        
        const trashIdx = store.groups.findIndex(g => g.id === TRASH_GROUP_ID)
        const newGroup = { id: newGroupId, name: folder.name, createdAt: now, updatedAt: now, children }
        if (trashIdx !== -1) {
          store.groups.splice(trashIdx, 0, newGroup)
        } else {
          store.groups.push(newGroup)
        }
        store.bookmarks.push(...newBookmarks)
        addedGroups++
        addedBookmarks += newBookmarks.length
      })
      
      showToast({ title: '导入成功', description: `新增 ${addedGroups} 个分组、${addedBookmarks} 个书签`, variant: 'success' })
      settingsStore.dismissOnboarding()
      // 异步触发图标获取
      store.refreshMissingIcons()
    } else {
      // JSON 格式
      const data = JSON.parse(text)
      if (data.groups && data.bookmarks) {
        store.$patch({ groups: data.groups, bookmarks: data.bookmarks })
        showToast({ 
          title: '导入成功', 
          description: `导入 ${data.groups.length} 个分组、${data.bookmarks.length} 个书签`,
          variant: 'success' 
        })
        settingsStore.dismissOnboarding()
        // 异步触发图标获取
        store.refreshMissingIcons()
      } else {
        showToast({ title: '无效的备份文件格式', variant: 'error' })
      }
    }
  } catch (e) {
    console.error('[App] Import failed:', e)
    showToast({ title: '文件解析失败', variant: 'error' })
  }
}



const activeTemplateBookmark = ref<Bookmark | null>(null)
const templateQuery = ref('')
const showQuickSaveDialog = ref(false)

// 验证 URL 是否有效（用于快速保存）
const isValidUrl = (text: string): boolean => {
  if (!text || text.trim().length === 0) return false
  try {
    // 确保有协议前缀
    let urlStr = text.trim()
    if (!urlStr.match(/^https?:\/\//i)) {
      urlStr = `https://${urlStr}`
    }
    const url = new URL(urlStr)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// 处理快速保存（超级面板 / 当前浏览器 / 弹窗）
const handleQuickSave = async (from: string, payload: any) => {
  let urlToSave = ''

  // 1. 从 payload 获取 URL
  if (typeof payload === 'string') {
    urlToSave = payload
  } else if (payload && typeof payload === 'object' && 'text' in payload) {
    urlToSave = String(payload.text)
  }

  // 2. 如果 payload 没有 URL，尝试从浏览器获取
  if (!urlToSave) {
    try {
      const utoolsApi = window.utools as any
      if (typeof utoolsApi?.readCurrentBrowserUrl === 'function') {
        urlToSave = await utoolsApi.readCurrentBrowserUrl()
      }
    } catch (e) {
      console.warn('[quick_save] 获取浏览器 URL 失败:', e)
    }
  }

  urlToSave = urlToSave.trim()

  // 验证是否是有效 URL
  if (urlToSave && isValidUrl(urlToSave)) {
    // 通过 proxy API 获取页面元信息
    const meta = await fetchPageMeta(urlToSave)
    let pageTitle = meta.title || ''
    let pageDesc = meta.description || ''

    // 如果仍然没有标题，使用域名作为fallback
    if (!pageTitle) {
      try {
        const url = new URL(urlToSave)
        pageTitle = url.hostname.replace(/^www\./, '')
      } catch {
        pageTitle = '未命名书签'
      }
    }

    // 快速保存到"快速收集"分组（含去重逻辑）
    const bookmark = store.quickSaveBookmark(urlToSave, pageTitle, pageDesc)
    const isNew = bookmark.title === urlToSave

    showToast({
      title: isNew ? '已保存' : '已添加到快速收集',
      description: bookmark.title,
      variant: 'success'
    })

    // 退出插件
    window.utools?.outPlugin()
    return
  } else {
    console.warn('[quick_save] 无效 URL:', { payload, urlToSave, from })
    showToast({ title: '未检测到有效链接', variant: 'warning' })
    return
  }
}

// 快速保存书签（弹窗入口）
const quickSaveBookmark = async (url: string) => handleQuickSave('dialog', url)

// Template Mode - Execute Search
const executeTemplateSearch = () => {
  const bookmark = activeTemplateBookmark.value
  if (!bookmark) return
  
  const query = templateQuery.value.trim()
  if (!query) return
  
  // 替换模板变量
  let url = bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query))
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  
  showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
  openUrl(url)
  
  if (settingsStore.autoCloseWindow && isDetachedWindowNow()) {
    window.utools?.outPlugin()
  } else {
    window.utools?.hideMainWindow?.()
    exitTemplateMode()
  }
}

// Template Mode - Keydown Handler
const handleTemplateKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && activeTemplateBookmark.value) {
    e.preventDefault()
    executeTemplateSearch()
  }
}

// Template Mode Actions
const enterTemplateMode = (bookmark: Bookmark) => {
  activeTemplateBookmark.value = bookmark
  templateQuery.value = ''
  isSyncPaused.value = true // 进入模式时暂停同步
  
  // Clean UI
  searchViewOpen.value = false
  showAdd.value = false
  showDeleteConfirm.value = false
  
  // Set uTools sub input
  const label = getTemplateLabel(bookmark.url)
  window.utools?.setSubInput?.(({ text }) => {
    templateQuery.value = text
  }, `搜索 ${bookmark.title}${label ? ` (${label})` : ''}，回车打开`)
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleTemplateKeydown)
}

const exitTemplateMode = () => {
  // 移除键盘事件监听
  window.removeEventListener('keydown', handleTemplateKeydown)
  
  activeTemplateBookmark.value = null
  templateQuery.value = ''
  isSyncPaused.value = false // 退出模式时恢复同步
  
  // Restore default sub input
  const shouldUse = !isDetachedWindowNow()
  if (shouldUse) {
    window.utools?.setSubInput?.(handleSubInput, '搜索书签...', true)
  } else {
    window.utools?.removeSubInput?.()
  }
}

// Lifecycle
onMounted(async () => {
  window.addEventListener('contextmenu', (e) => {
    // 允许书签卡片触发自定义行为（已经在 handleContextMenuWrapper 中处理）
    // 但阻止所有默认浏览器菜单
    e.preventDefault()
  }, true) // Use capture to ensure we catch it before most others

  // 监听 URL 变化（popstate 事件）
  window.addEventListener('popstate', () => {
    updatePageTitle()
  })

  // 初始化标题
  updatePageTitle()

  store.migrateFromLegacy()

  statsStore.recordUse('open')
  
  type UToolsApi = {
    isDarkColors?: () => boolean
    setSubInput?: (cb: (payload: { text: string }) => void, placeholder?: string, isSelectAll?: boolean) => void
    removeSubInput?: () => void
    onPluginEnter?: (cb: (params: { code?: unknown; payload?: unknown } | undefined) => void) => void
  }
  const utoolsApi = window.utools as unknown as UToolsApi | undefined
  
  if (utoolsApi) {
    const syncTheme = () => {
      try {
        const isdev = utoolsApi.isDarkColors?.()
        if (typeof isdev === 'boolean') useAppState().isDark.value = isdev
      } catch {}
    }

    const syncSubInput = () => {
      if (canUseSubInput.value) {
        utoolsApi.setSubInput?.(handleSubInput, '搜索书签...', true)
      } else {
        utoolsApi.removeSubInput?.()
      }
    }
    
    syncTheme()
    syncFeatures(store.bookmarks)
    syncSubInput()
    // Watch canUseSubInput indirectly via isDetachedWindowNow changes if needed, 
    // but usually window type doesn't change dynamically in a way that affects this without reload?
    // Actually, converting to detached might change it.
    // Let's watch the computed value.
    watch(canUseSubInput, () => syncSubInput())
    
    window.addEventListener('storage-sync', ((e: any) => {
      const { key, value } = e.detail
      if (!value) return
      try {
        const data = JSON.parse(value)
        if (key === 'settings') settingsStore.$patch(data)
        if (key === 'bookmark') store.$patch(data)
      } catch {}
    }) as any)

    window.utools?.onPluginEnter?.((params) => {
      const code = params?.code
      const isTemplateFeature = typeof code === 'string' && code.startsWith(FEATURE_PREFIX)

      // 处理保存链接（通过 match 匹配 URL）
      if (code === 'save_link') {
        // 直接使用 payload，因为 match 模式下 payload 就是用户输入的文本
        let urlToSave = ''
        const payload = params?.payload

        if (typeof payload === 'string') {
          urlToSave = payload
        } else if (payload && typeof payload === 'object' && 'text' in payload) {
          urlToSave = String(payload.text)
        }

        urlToSave = urlToSave.trim()

        // 验证是否是有效 URL
        if (urlToSave && isValidUrl(urlToSave)) {
          // 切换到主视图
          onMainViewSwitch()
          activeTemplateBookmark.value = null
          syncTheme()
          syncFeatures(store.bookmarks)
          syncSubInput()
          store.setSearch('')

          // 调用新的打开方法，预填充 URL 且不选分类
          openAddWithUrl(urlToSave)
          return
        } else {
          // 无效 URL，显示提示
          console.warn('[save_link] 无效 URL:', { payload, urlToSave })
          showToast({ title: '未检测到有效链接', variant: 'warning' })
          return
        }
      }

      // 处理快速保存（超级面板 / 当前浏览器）
      if (code === 'quick_save') {
        const from = (params as any)?.from || 'main'
        const payload = params?.payload
        handleQuickSave(from, payload)
      }

      // 处理快速保存弹窗
      if (code === 'quick_save_dialog') {
        onMainViewSwitch()
        showQuickSaveDialog.value = true
      }

      if (!isTemplateFeature) {
        onMainViewSwitch()
        activeTemplateBookmark.value = null
        syncTheme()
        syncFeatures(store.bookmarks)
        syncSubInput()
        store.setSearch('')
        return
      }
      
      syncTheme()
      const id = (code as string).slice(FEATURE_PREFIX.length)
      const bookmark = store.bookmarks.find(b => b.id === id)
      
      if (!bookmark) {
        window.utools?.outPlugin()
        return
      }
      
      const hasTemplate = /{[^}]+}/.test(bookmark.url)
      const isInTemplateMode = activeTemplateBookmark.value?.id === id
      const payloadQuery = getEnterText(params?.payload).trim()
      const query = isInTemplateMode ? templateQuery.value.trim() : payloadQuery
      
      if (hasTemplate) {
        const isKeywordLaunch = (!payloadQuery || payloadQuery === bookmark.title) && !isInTemplateMode
        if (isKeywordLaunch) {
           enterTemplateMode(bookmark)
           return
        }
      }
      
      let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
      openUrl(url)
      
      if (settingsStore.autoCloseWindow && isDetachedWindowNow()) {
        window.utools?.outPlugin()
      } else {
        if (activeTemplateBookmark.value) {
          window.utools?.hideMainWindow?.()
          exitTemplateMode()
        }
      }
    })
  }
})

watch(() => store.bookmarks, () => {
  if (isSyncPaused.value) return // 暂停时跳过同步
  syncFeatures(store.bookmarks)
}, { deep: true })

// 组件卸载时清理定时器
onUnmounted(() => {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
    syncTimeout = null
  }
})

// Highlight State
const highlightedBookmarkId = ref<string | null>(null)

// 定位逻辑
const handleLocate = async (bookmark: Bookmark) => {
  if (bookmark.locations && bookmark.locations.length > 0) {
    const loc = bookmark.locations[0]
    
    // 1. 先关闭搜索
    if (searchViewOpen.value) {
       closeSearchView()
       // 等待 UI 更新 (Overlay 消失动画)
       await new Promise(resolve => setTimeout(resolve, 300))
    }

    // 2. 切换位置
    store.selectGroup(loc.groupId)
    if (loc.subGroupId) {
      store.selectSubGroup(loc.subGroupId)
    }
    
    // 3. 切换到书签 tab
    tab.value = 'bookmarks'

    // 4. 设置高亮
    highlightedBookmarkId.value = bookmark.id
    
    // 5. 4秒后清除高亮
    setTimeout(() => {
      highlightedBookmarkId.value = null
    }, 4000)
    
  } else {
    showToast({ title: '无法定位', description: '该书签没有关联的位置信息', variant: 'error' })
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="100">
  <TemplateSearch 
    v-if="activeTemplateBookmark" 
    :bookmark="activeTemplateBookmark" 
    :query="templateQuery" 
  />
  <div 
    v-else 
    class="min-h-screen h-screen flex flex-col text-foreground overflow-hidden transition-all duration-500 bg-background app-container" 
    @contextmenu.prevent
  >
    <!-- Top Navigation for Groups -->
    <header
      class="sticky top-0 z-30 flex flex-col gap-2 p-6 transition-all duration-500 bg-background/80 backdrop-blur-md"
    >
       <GroupTabs
         :visible-groups="visibleGroups"
         :active-group-id="store.activeGroupId"
         :tab="tab"
         :is-u-tools="isUTools"
         :is-trash-active="isTrashActive"
         :group-layout="settingsStore.groupTabsLayout"
         :searching="searchViewOpen"
         @update:tab="tab = $event"
         @select-group="handleSelectGroup"
         @select-trash="store.selectGroup(TRASH_GROUP_ID); tab = 'bookmarks'"
         @toggle-dark="toggleDark()"
         @open-search="openSearchView"
       />
    </header>

    <!-- Search Overlay -->
    <SearchOverlay
      ref="searchOverlayRef"
      :open="searchViewOpen"
      :search-value="searchValue"
      :active-bookmarks="activeBookmarks"
      :selected-index="selectedIndex"
      :enable-sub-input="canUseSubInput"
      :store-search="store.search"
      :search-auto-exit-text="searchAutoExitText"
      :show-cmd-hints="showCmdHints"
      :hint-key-by-id="hintKeyById"
      :grid-columns="settingsStore.gridColumns"
      :set-grid-ref="setBookmarkGridRef"
      @update:search-value="searchValue = $event"
      @close="closeSearchView"
      @keydown="handleLocalSearchKey"
      @edit="(b, el) => openEdit(b, el)"
      @open="openBookmarkLink"
      @contextmenu="handleBookmarkRightClick"
      @reorder="handleReorder"
      @locate="handleLocate"
    />

    <!-- Main Content with Sub-groups sidebar -->
    <main class="flex-1 min-h-0 flex px-6 pb-6 gap-4 overflow-y-auto no-scrollbar">
      <SubGroupSidebar
        :show="tab === 'bookmarks' && shouldShowSubs"
        :active-sub-groups="activeSubGroups"
        :active-sub-group-id="store.activeSubGroupId"
        :active-group-id="store.activeGroupId"
        @select="store.selectSubGroup"
        @drop="handleBookmarkDrop"
      />

      <BookmarksGrid
        v-if="tab === 'bookmarks'"
        :bookmarks="activeBookmarks"
        :selected-index="selectedIndex"
        :is-trash-active="isTrashActive"
        :columns="settingsStore.gridColumns"
        :set-grid-ref="setBookmarkGridRef"
        :show-command-hints="showCmdHints"
        :hint-key-by-id="hintKeyById"
        :highlighted-id="highlightedBookmarkId"
        @remove="handleRemove"
        @edit="openEdit"
        @open="openBookmarkLink"
        @contextmenu="handleContextMenuWrapper"
        @reorder="handleReorder"
        @add="(el) => openAdd(el)"
        @emptyTrash="emptyTrash"
        @locate="handleLocate"
      >
        <template #header>
          <OnboardingBanner
            v-if="!isTrashActive"
            @import="handleOnboardingImport"
          />
        </template>
      </BookmarksGrid>

      <section v-else class="flex-1 min-h-0">
        <SettingsLayout />
      </section>
    </main>
    

    <!-- Bookmark Context Menu -->
    <ContextMenu
      v-if="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :is-trash="isTrashActive"
      :is-u-tools="isUTools"
      @close="closeContextMenu"
      @action="handleContextMenuAction"
    />

    <!-- Quick Save Dialog -->
    <QuickSaveDialog
      v-model:open="showQuickSaveDialog"
      @save="quickSaveBookmark"
    />

    <!-- Bookmark Form Dialog -->
    <BookmarkFormDialog
      v-model:open="showAdd"
      :is-u-tools="isUTools"
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteConfirmDialog
      v-model:open="showDeleteConfirm"
      :is-trash-active="isTrashActive"
      @confirm="confirmDelete"
    />


  </div>
  
  


    <ResultToast
      :open="toastState.visible"
      :title="toastState.title"
      :description="toastState.description"
      :variant="toastState.variant"
      :action-label="toastState.actionLabel"
      :origin="toastState.origin"
      @close="closeToast"
      @action="toastState.onAction?.()"
    />
  </TooltipProvider>
</template>

<style>
/* 全局彩蛋适配样式 */
html.dark body.easter-egg-active {
  background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=2071&auto=format&fit=crop') !important;
  background-size: cover !important;
  background-position: center !important;
  background-attachment: fixed !important;
  background-color: #000 !important;
}

/* 彩蛋模式：容器透明以显示背景图 */
html.dark body.easter-egg-active .app-container,
html.dark body.easter-egg-active #app {
  background-color: transparent !important;
}

/* 彩蛋模式：书签卡片背景参考子分组样式 */
html.dark body.easter-egg-active .bookmark-card-wrapper > div {
  background-color: hsl(var(--primary) / 0.05) !important;
}

/* 彩蛋模式：主分组按钮背景参考子分组样式 */
html.dark body.easter-egg-active button[data-active="true"] {
  background-color: hsl(var(--primary) / 0.05) !important;
}

/* 彩蛋模式：顶部导航栏透明 */
html.dark body.easter-egg-active header {
  background-color: transparent !important;
}
</style>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
/* 彩蛋相关样式已移至全局 style */
</style>
