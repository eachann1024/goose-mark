<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { useSync } from '@/composables/useSync'

import type { Bookmark } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import OnboardingBanner from '@/components/OnboardingBanner.vue'
import { parseHtmlBookmarks, isHtmlBookmarkFile } from '@/lib/htmlBookmarkParser'

// Stores
const store = useBookmarkStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const { toastState, closeToast, showToast, tooltipProviderKey, onMainViewSwitch } = useUIManager()

// Composables
const { tab, isDark, toggleDark, isUTools, isMac } = useAppState()
const { isSyncing, syncError } = useSync()
const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu()
const { 
  openBookmarkLink: originalOpenBookmarkLink, 
  openUrl,
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
  openEdit,
} = useBookmarkForm()

const {
  syncFeatures,
  getEnterText,
  isDetachedWindowNow,
  FEATURE_PREFIX,
  setExpendHeight
} = useUTools()

const {
  loadShareData,
  isLoadingShare,
  copyShareLink,
  buildShareUrl,
  validateAndCleanGroupShares,
  getShareData,
  validateShareStatus,
  checkForUpdate
} = useShare()

// Shared State
const selectedIndex = ref(-1)
const showSharePanel = ref(false)
const showNameConflict = ref(false)
const showShareCanceledDialog = ref(false)
const showConvertLocalDialog = ref(false)
const showRemoveImportedDialog = ref(false)
const shareCanceledInfo = ref<{ 
  type: 'group' | 'subGroup'
  groupId: string
  subGroupId?: string
  name: string 
} | null>(null)

const checkCurrentShareStatus = async (groupId: string, subGroupId?: string) => {
  const group = store.groups.find(g => g.id === groupId)
  if (!group) return false

  // 1. 如果指定了子分组，只检查该子分组
  if (subGroupId) {
    const sub = group.children.find(c => c.id === subGroupId)
    if (sub?.sourceShareId) {
      const status = await validateShareStatus(sub.sourceShareId)
      if (status === "canceled" || status === "not_found") {
        shareCanceledInfo.value = {
          type: 'subGroup',
          groupId: group.id,
          subGroupId: sub.id,
          name: sub.name
        }
        showShareCanceledDialog.value = true
        return true
      }
    }
    return false
  }

  // 2. 检查分组本身的分享状态
  if (group.sourceShareId) {
    const status = await validateShareStatus(group.sourceShareId)
    if (status === "canceled" || status === "not_found") {
      shareCanceledInfo.value = {
        type: 'group',
        groupId: group.id,
        name: group.name
      }
      showShareCanceledDialog.value = true
      return true
    }
  }

  // 3. 检查当前活跃的子分组状态
  if (store.activeSubGroupId) {
     const sub = group.children.find(c => c.id === store.activeSubGroupId)
     if (sub?.sourceShareId) {
        const status = await validateShareStatus(sub.sourceShareId)
        if (status === "canceled" || status === "not_found") {
          shareCanceledInfo.value = {
            type: 'subGroup',
            groupId: group.id,
            subGroupId: sub.id,
            name: sub.name
          }
          showShareCanceledDialog.value = true
          return true
        }
     }
  }

  return false
}

const handleSelectGroup = async (groupId: string) => {
  store.selectGroup(groupId)
  tab.value = "bookmarks"
}

const nameConflictInfo = ref<{
  targetGroup: { id: string; name: string }
  sourceGroup: { id: string; name: string }
  shareId: string
  data: any
} | null>(null)

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
  
  // 检查是否在分享页面
  const pathMatch = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)$/)
  const shareId = pathMatch?.[1] || new URLSearchParams(window.location.search).get('shareId')
  
  if (shareId) {
    parts.push('分享')
  } else if (tab.value === 'settings') {
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

// 使用防抖避免切换分组/子分组时重复请求 check 接口
const debouncedShareCheck = useDebounceFn(async (groupId: string, subId?: string) => {
  // validateAndCleanGroupShares 内部会调用 validateShareStatus 并使用缓存
  // 所以只需要调用一次即可
  await validateAndCleanGroupShares(groupId)
  // 验证后检查当前子分组的状态（利用缓存，不会重复请求）
  checkCurrentShareStatus(groupId, subId)
}, 300)

watch([() => store.activeGroupId, () => store.activeSubGroupId], ([groupId, subId]) => {
  if (groupId && groupId !== TRASH_GROUP_ID) {
    debouncedShareCheck(groupId, subId || undefined)
  }
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
    case 'copy':
      copyBookmarkUrl(bookmark)
      break
    case 'edit':
      openEdit(bookmark)
      break
    case 'remove':
      handleRemove(bookmark)
      break
    case 'restore':
      store.restoreBookmark(bookmark.id)
      showToast({ title: '已还原', variant: 'success', duration: 1500 })
      break
  }
}

// Share Handlers
const handleOpenShareUrl = (shareId: string) => {
  openUrl(buildShareUrl(shareId))
}

const handleCopyShareLink = async (shareId: string) => {
  await copyShareLink(shareId)
}

// 接收者分组管理

const handleCheckImportedUpdate = async () => {
  const sub = currentSubGroup.value
  if (!sub?.sourceShareId) return
  
  showToast({ title: '正在检查更新...', variant: 'info', duration: 1500 })
  try {
    const hasUpdate = await checkForUpdate(sub.sourceShareId, sub.lastSyncedAt || 0)
    if (hasUpdate) {
      // 自动更新
      const result = await getShareData(sub.sourceShareId)
      if (result?.data) {
        const shareData = result.data.data
        if (shareData.subGroups?.length) {
          const groups = shareData.group 
            ? [{ id: shareData.group.id, name: shareData.group.name, children: shareData.subGroups }]
            : [{ id: 'shared', name: '分享内容', children: shareData.subGroups }]
          const dataToUpdate = { groups, bookmarks: shareData.bookmarks || [] } as any
          const updateResult = store.updateSubGroupFromShare(store.activeGroupId, sub.id, sub.sourceShareId, dataToUpdate)
          if (updateResult && typeof updateResult === 'object') {
            const logs: string[] = []
            if (updateResult.added > 0) logs.push(`新增 ${updateResult.added} 项`)
            if (updateResult.removed > 0) logs.push(`移除 ${updateResult.removed} 项`)
            showToast({ title: '已更新', description: logs.join('，') || '同步完成', variant: 'success' })
          }
        }
      }
    } else {
      showToast({ title: '已是最新版本', variant: 'success', duration: 1500 })
    }
  } catch (e) {
    showToast({ title: '检查更新失败', variant: 'error' })
  }
}

const handleConvertToLocal = () => {
  store.detachSubGroupFromShare(store.activeGroupId, store.activeSubGroupId)
  showConvertLocalDialog.value = false
  showToast({ title: '已转为本地分组', description: '此分组不再与分享源关联', variant: 'success' })
}

const handleRemoveImportedSubGroup = () => {
  store.deleteSubGroup(store.activeGroupId, store.activeSubGroupId)
  showRemoveImportedDialog.value = false
  showToast({ title: '已移除分组', variant: 'success' })
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


const handleNameConflictAction = async (action: 'merge' | 'new') => {
  if (!nameConflictInfo.value) return

  const { targetGroup, shareId, data } = nameConflictInfo.value

  if (action === 'merge') {
    await store.importToExistingGroup(data, targetGroup.id, shareId)
    showToast({ title: '合并成功', variant: 'success' })
  } else {
    const existingGroup = store.findGroupByName(nameConflictInfo.value.sourceGroup.name)
    let suffix = 1
    let finalName = nameConflictInfo.value.sourceGroup.name
    while (store.groups.some(g => g.name === finalName && g.id !== TRASH_GROUP_ID)) {
      finalName = `${nameConflictInfo.value.sourceGroup.name} (${suffix++})`
    }

    const newData = { ...data, groups: [{ ...data.groups[0], name: finalName }] }
    const result = store.importFromShare(newData, shareId, finalName)
    if (result) showToast({ title: '导入成功', variant: 'success' })
  }

  // 异步触发图标获取
  store.refreshMissingIcons()
  nameConflictInfo.value = null
  clearShareIdFromUrl()
}

const clearShareIdFromUrl = () => {
  const url = new URL(window.location.href)
  if (url.searchParams.has('shareId') || /^\/s\/[a-zA-Z0-9_-]+$/.test(url.pathname)) {
    try {
      url.searchParams.delete('shareId')
      url.pathname = url.pathname.replace(/^\/s\/[a-zA-Z0-9_-]+$/, '/')
      history.replaceState({}, '', url.pathname + url.search)
      updatePageTitle()
    } catch (e) {
      console.warn('[App] URL 清理失败', e)
    }
  }
}

const activeTemplateBookmark = ref<Bookmark | null>(null)
const templateQuery = ref('')

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
  showSharePanel.value = false
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

  let shareId: string | null = null
  
  const pathMatch = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)$/)
  if (pathMatch) shareId = pathMatch[1]
  
  if (!shareId) {
    shareId = new URLSearchParams(window.location.search).get('shareId')
  }
  
  if (shareId) {
    const result = await loadShareData(shareId)
    if ('conflict' in result && result.conflict && result.isNameConflict) {
      nameConflictInfo.value = {
        targetGroup: result.targetGroup!,
        sourceGroup: result.sourceGroup!,
        shareId: result.shareId,
        data: result.data
      }
      showNameConflict.value = true
    } else if ('success' in result && result.success) {
      clearShareIdFromUrl()
    }
    updatePageTitle()
  } else {
    store.migrateFromLegacy()
  }

  // 进入应用时检查当前活跃分组的分享状态
  if (store.activeGroupId) {
    checkCurrentShareStatus(store.activeGroupId)
  }

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
        :readonly="!!(activeGroup?.sourceShareId || activeSubGroups.find(s => s.id === store.activeSubGroupId)?.sourceShareId)"
        :highlighted-id="highlightedBookmarkId"
        @remove="(b) => !(activeGroup?.sourceShareId || activeSubGroups.find(s => s.id === store.activeSubGroupId)?.sourceShareId) && handleRemove(b)"
        @edit="(b, el) => !(activeGroup?.sourceShareId || activeSubGroups.find(s => s.id === store.activeSubGroupId)?.sourceShareId) && openEdit(b, el)"
        @open="openBookmarkLink"
        @contextmenu="handleContextMenuWrapper"
        @reorder="handleReorder"
        @add="(el) => openAdd(el)"
        @emptyTrash="emptyTrash"
        @locate="handleLocate"
      >
        <template #header>
          <OnboardingBanner 
            v-if="!isTrashActive && !(activeGroup?.sourceShareId)"
            @import="handleOnboardingImport"
          />
        </template>
      </BookmarksGrid>

      <section v-else class="flex-1 min-h-0">
        <SettingsLayout />
      </section>
    </main>
    
    <!-- Share Float Button -->
    <ShareFloatButton
      v-if="settingsStore.enableShare"
      :show="tab === 'bookmarks' && activeSubGroups.length > 0 && !isTrashActive"
      :current-sub-group="currentSubGroup"
      @open-share-url="handleOpenShareUrl"
      @copy-share-link="handleCopyShareLink"
      @manage-share="showSharePanel = true"
      @delete-sub-group="store.deleteSubGroup(store.activeGroupId, store.activeSubGroupId)"
      @check-update="handleCheckImportedUpdate"
      @convert-to-local="showConvertLocalDialog = true"
      @remove-imported-sub-group="showRemoveImportedDialog = true"
    />

    <!-- Bookmark Context Menu -->
    <ContextMenu 
      v-if="contextMenu.show" 
      :x="contextMenu.x" 
      :y="contextMenu.y"
      :is-trash="isTrashActive"
      :readonly="!!(activeGroup?.sourceShareId || activeSubGroups.find(s => s.id === store.activeSubGroupId)?.sourceShareId)"
      @close="closeContextMenu"
      @action="handleContextMenuAction"
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

    <!-- Share Manage Panel -->
    <ShareManagePanel
      v-model:open="showSharePanel"
      :group-id="store.activeGroupId"
      :sub-group-id="store.activeSubGroupId"
      @shared="() => {}"
      @update-from-share="(id: string, data: any) => store.updateFromShare(id, data)"
      @share-canceled="(info) => {
        shareCanceledInfo = info;
        showShareCanceledDialog = true;
      }"
    />

    <!-- Name Conflict Dialog -->
    <NameConflictDialog
      v-model:open="showNameConflict"
      :target-group-name="nameConflictInfo?.targetGroup.name || ''"
      :source-group-name="nameConflictInfo?.sourceGroup.name || ''"
      @action="handleNameConflictAction"
    />
  </div>
  
  <div v-if="isLoadingShare" class="fixed inset-0 z-[99999] bg-background flex flex-col items-center justify-center gap-4">
    <Loader2 class="w-10 h-10 animate-spin text-primary" />
    <p class="text-muted-foreground font-medium">正在加载分享数据...</p>
  </div>
  
    <!-- Share Canceled Dialog -->
    <Dialog v-model:open="showShareCanceledDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>分享已失效</DialogTitle>
          <DialogDescription>
            分享者已经移除该分享... 你是否需要保留该本组到本地...
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" @click="() => {
            if (shareCanceledInfo) {
              if (shareCanceledInfo.type === 'group') {
                store.removeGroup(shareCanceledInfo.groupId)
              } else if (shareCanceledInfo.type === 'subGroup' && shareCanceledInfo.subGroupId) {
                store.deleteSubGroup(shareCanceledInfo.groupId, shareCanceledInfo.subGroupId)
              }
              showShareCanceledDialog = false
              shareCanceledInfo = null
            }
          }">
            不需要
          </Button>
          <Button variant="default" @click="() => {
            if (shareCanceledInfo) {
              if (shareCanceledInfo.type === 'group') {
                store.detachGroupFromShare(shareCanceledInfo.groupId)
              } else if (shareCanceledInfo.type === 'subGroup' && shareCanceledInfo.subGroupId) {
                store.detachSubGroupFromShare(shareCanceledInfo.groupId, shareCanceledInfo.subGroupId)
              }
              showShareCanceledDialog = false
              shareCanceledInfo = null
            }
          }">
            保留为本地分组
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Convert to Local Dialog -->
    <Dialog v-model:open="showConvertLocalDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>转为本地分组</DialogTitle>
          <DialogDescription>
            转为本地后，此分组将不再与分享源关联，也不会收到后续更新。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showConvertLocalDialog = false">取消</Button>
          <Button @click="handleConvertToLocal">确认转换</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Remove Imported SubGroup Dialog -->
    <Dialog v-model:open="showRemoveImportedDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>移除导入分组</DialogTitle>
          <DialogDescription>
            移除后，此分组及其书签将被删除。如果这是最后一个子分组，主分组也会被删除。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showRemoveImportedDialog = false">取消</Button>
          <Button variant="destructive" @click="handleRemoveImportedSubGroup">确认移除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
