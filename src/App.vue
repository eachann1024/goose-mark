<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

import type { Bookmark } from '@/types/bookmark'

// Stores
const store = useBookmarkStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const { toastState, closeToast, showToast, tooltipProviderKey, onMainViewSwitch } = useUIManager()

// Composables
const { tab, isDark, toggleDark, isUTools, isMac } = useAppState()
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
  contextMenu,
  handleContextMenu: onContextMenu,
  closeContextMenu: closeContext
} = useContextMenu()

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
  checkForUpdate,
  getShareData,
  validateShareStatus
} = useShare()

// Shared State
const selectedIndex = ref(-1)
const showSharePanel = ref(false)
const showNameConflict = ref(false)
const showShareCanceledDialog = ref(false)
const shareCanceledInfo = ref<{ 
  type: 'group' | 'subGroup'
  groupId: string
  subGroupId?: string
  name: string 
} | null>(null)

const handleSelectGroup = async (groupId: string) => {
  store.selectGroup(groupId)
  tab.value = "bookmarks"
  
  const group = store.groups.find(g => g.id === groupId)
  if (!group) return

  // 1. 检查分组本身的分享状态
  if (group.sourceShareId) {
    const status = await validateShareStatus(group.sourceShareId)
    if (status === "canceled" || status === "not_found") {
      shareCanceledInfo.value = {
        type: 'group',
        groupId: group.id,
        name: group.name
      }
      showShareCanceledDialog.value = true
      return
    }
  }

  // 2. 检查子分组的分享状态
  for (const sub of group.children) {
    if (sub.sourceShareId) {
      const status = await validateShareStatus(sub.sourceShareId)
      if (status === "canceled" || status === "not_found") {
        shareCanceledInfo.value = {
          type: 'subGroup',
          groupId: group.id,
          subGroupId: sub.id,
          name: sub.name
        }
        showShareCanceledDialog.value = true
        return // 一次只提示一个
      }
    }
  }
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
  openBookmarkLink
)

// hintKeyById 包装函数供模板使用
const getHintKey = (id: string) => hintKeyById.value[id]

// Group Helpers
const activeGroup = computed(() => store.groups.find(g => g.id === store.activeGroupId))
const activeSubGroups = computed(() => activeGroup.value?.children ?? [])
const shouldShowSubs = computed(() => activeSubGroups.value.length > 1)
const visibleGroups = computed(() => store.groups.filter(g => g.id !== TRASH_GROUP_ID))
const isTrashActive = computed(() => store.activeGroupId === TRASH_GROUP_ID)
const currentSubGroup = computed(() => 
  activeSubGroups.value.find(s => s.id === store.activeSubGroupId)
)

// Coordination Watchers
watch(() => store.search, () => hideCmdHints())
watch(() => tab.value, () => {
  hideCmdHints()
  closeContext()
  onMainViewSwitch()
})

watch([() => store.activeGroupId, () => store.activeSubGroupId], () => {
  selectedIndex.value = -1
  hideCmdHints()
  closeContext()
})

watch(() => store.activeGroupId, (groupId) => {
  if (groupId && groupId !== TRASH_GROUP_ID) {
    validateAndCleanGroupShares(groupId)
  }
})

// Context Menu Action Handler
const onContextMenuAction = (action: string) => {
  const b = contextMenu.target
  if (!b) return
  if (action === 'open') openBookmarkLink(b)
  if (action === 'restore') store.restoreBookmark(b.id)
  if (action === 'remove') {
    confirmDeleteId.value = b.id
    showDeleteConfirm.value = true
  }
}

const handleContextMenuWrapper = (e: MouseEvent, bookmark: Bookmark) => {
  e.preventDefault()
  onContextMenu(e, bookmark)
  void copyBookmarkUrl(bookmark)
}

// Share Handlers
const handleOpenShareUrl = (shareId: string) => {
  openUrl(buildShareUrl(shareId))
}

const handleCopyShareLink = async (shareId: string) => {
  await copyShareLink(shareId)
}

const handleCheckUpdate = async () => {
  if (!currentSubGroup.value?.sourceShareId) return
  
  const sourceShareId = currentSubGroup.value.sourceShareId
  const lastSyncedAt = currentSubGroup.value.lastSyncedAt || 0
  
  try {
    const hasUpdate = await checkForUpdate(sourceShareId, lastSyncedAt, true)
    
    if (!hasUpdate) {
      showToast({ title: '当前已是最新版本', variant: 'success' })
      return
    }
    
    const result = await getShareData(sourceShareId)
    if (result?.data) {
      const shareData = result.data.data
      const dataForUpdate = {
        groups: [{
          id: shareData.group?.id || 'shared',
          name: shareData.group?.name || '分享内容',
          children: shareData.subGroups
        }],
        bookmarks: shareData.bookmarks
      }
      
      const updateResult = store.updateFromShare(store.activeGroupId, dataForUpdate)
      
      if (updateResult && typeof updateResult === 'object') {
        const logs: string[] = []
        if (updateResult.added > 0) {
          const items = updateResult.addedItems.join('、')
          const suffix = updateResult.added > 5 ? ` 等 ${updateResult.added} 项` : ''
          logs.push(`📥 新增: ${items}${suffix}`)
        }
        if (updateResult.removed > 0) {
          const items = updateResult.removedItems.join('、')
          const suffix = updateResult.removed > 5 ? ` 等 ${updateResult.removed} 项` : ''
          logs.push(`📤 删除: ${items}${suffix}`)
        }
        
        const description = logs.length > 0 ? logs.join('\n') : '内容已同步（无新增/删除）'
        showToast({ title: '更新成功', description, variant: 'success' })
      } else {
        showToast({ title: '更新失败', description: '无法应用更新', variant: 'error' })
      }
    } else {
      showToast({ title: '获取更新失败', description: result?.error || '未知错误', variant: 'error' })
    }
  } catch (e: unknown) {
    showToast({ 
      title: '检查更新失败', 
      description: e instanceof Error ? e.message : '网络错误',
      variant: 'error' 
    })
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
  } else {
    store.migrateFromLegacy()
  }

  statsStore.recordUse('open')
  
  type UToolsApi = {
    isDarkColors?: () => boolean
    setSubInput?: (cb: (payload: { text: string }) => void, placeholder?: string, isSelectAll?: boolean) => void
    removeSubInput?: () => void
    onPluginEnter?: (cb: (params: { code?: unknown; payload?: unknown } | undefined) => void) => void
  }
  const utoolsApi = window.utools as unknown as UToolsApi | undefined
  if (!utoolsApi) settingsStore.setEnableSubInput(false)
  
  if (utoolsApi) {
    const syncTheme = () => {
      try {
        const isdev = utoolsApi.isDarkColors?.()
        if (typeof isdev === 'boolean') useAppState().isDark.value = isdev
      } catch {}
    }

    const syncSubInput = () => {
      const shouldUse = !isDetachedWindowNow()
      settingsStore.setEnableSubInput(shouldUse)
      if (shouldUse) {
        utoolsApi.setSubInput?.(handleSubInput, '搜索书签...', true)
      } else {
        utoolsApi.removeSubInput?.()
      }
    }
    
    syncTheme()
    syncFeatures(store.bookmarks)
    syncSubInput()
    
    window.utools?.onPluginEnter?.((params) => {
      const code = params?.code
      const isTemplateFeature = typeof code === 'string' && code.startsWith(FEATURE_PREFIX)
      
      // 1. 如果不是模板特性，执行常规清理和同步
      if (!isTemplateFeature) {
        onMainViewSwitch()
        activeTemplateBookmark.value = null
        syncTheme()
        // 仅在非交互敏感时刻同步 features
        syncFeatures(store.bookmarks)
        syncSubInput()
        store.setSearch('')
        return
      }
      
      // 2. 如果是模板特性，处理模板逻辑
      syncTheme()
      // 注意：此时已在 onPluginEnter 内部，绝对不能调用 syncFeatures
      // 且由于进入了模板模式，我们应该已经通过 enterTemplateMode 设置了 isSyncPaused = true
      
      const id = (code as string).slice(FEATURE_PREFIX.length)
      const bookmark = store.bookmarks.find(b => b.id === id)
      
      if (!bookmark) {
        window.utools?.outPlugin()
        return
      }
      
      const hasTemplate = /{[^}]+}/.test(bookmark.url)
      
      // 判断是否已经在模板模式中
      const isInTemplateMode = activeTemplateBookmark.value?.id === id
      // 在模板模式中使用 templateQuery，否则使用 payload
      const payloadQuery = getEnterText(params?.payload).trim()
      const query = isInTemplateMode ? templateQuery.value.trim() : payloadQuery
      
      if (hasTemplate) {
        // 通过关键词进入（无查询词或查询词等于书签标题）且不在模板模式时，进入模板模式
        const isKeywordLaunch = (!payloadQuery || payloadQuery === bookmark.title) && !isInTemplateMode
        
        if (isKeywordLaunch) {
           enterTemplateMode(bookmark)
           return
        }
      }
      
      // 执行搜索
      let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      
      // 添加反馈提示
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
</script>

<template>
  <TooltipProvider :delay-duration="100">
  <TemplateSearch 
    v-if="activeTemplateBookmark" 
    :bookmark="activeTemplateBookmark" 
    :query="templateQuery" 
  />
  <div v-else class="min-h-screen h-screen flex flex-col bg-background text-foreground overflow-hidden" @click="closeContext" @contextmenu.prevent>
    <!-- Top Navigation for Groups -->
    <header class="sticky top-0 z-30 flex flex-col gap-2 p-6 bg-background/80 backdrop-blur-md">
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
      :open="searchViewOpen"
      :search-value="searchValue"
      :active-bookmarks="activeBookmarks"
      :selected-index="selectedIndex"
      :enable-sub-input="settingsStore.enableSubInput"
      :store-search="store.search"
      :search-auto-exit-text="searchAutoExitText"
      :show-cmd-hints="showCmdHints"
      :hint-key-by-id="hintKeyById"
      :grid-columns="settingsStore.gridColumns"
      :set-grid-ref="setBookmarkGridRef"
      @update:search-value="searchValue = $event"
      @close="closeSearchView"
      @keydown="handleLocalSearchKey"
      @remove="handleRemove"
      @edit="(b, el) => openEdit(b, el)"
      @open="openBookmarkLink"
      @contextmenu="handleContextMenuWrapper"
      @reorder="handleReorder"
    />

    <!-- Main Content with Sub-groups sidebar -->
    <main class="flex-1 min-h-0 flex px-6 pb-6 gap-4 overflow-y-auto no-scrollbar">
      <SubGroupSidebar
        :show="tab === 'bookmarks' && shouldShowSubs"
        :active-sub-groups="activeSubGroups"
        :active-sub-group-id="store.activeSubGroupId"
        :active-group-id="store.activeGroupId"
        @select="store.selectSubGroup"
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
        @remove="(b) => !(activeGroup?.sourceShareId || activeSubGroups.find(s => s.id === store.activeSubGroupId)?.sourceShareId) && handleRemove(b)"
        @edit="(b, el) => !(activeGroup?.sourceShareId || activeSubGroups.find(s => s.id === store.activeSubGroupId)?.sourceShareId) && openEdit(b, el)"
        @open="openBookmarkLink"
        @contextmenu="handleContextMenuWrapper"
        @reorder="handleReorder"
        @add="(el) => openAdd(el)"
        @emptyTrash="emptyTrash"
      />

      <section v-else class="max-w-4xl mx-auto w-full">
        <SettingsPanel />
      </section>
    </main>
    
    <!-- Share Float Button -->
    <ShareFloatButton
      :show="tab === 'bookmarks' && activeSubGroups.length > 0"
      :current-sub-group="currentSubGroup"
      @open-share-url="handleOpenShareUrl"
      @copy-share-link="handleCopyShareLink"
      @manage-share="showSharePanel = true"
      @check-update="handleCheckUpdate"
      @delete-sub-group="store.deleteSubGroup(store.activeGroupId, store.activeSubGroupId)"
    />

    <ContextMenu 
      v-if="contextMenu.show && !store.isReadOnly" 
      :x="contextMenu.x" 
      :y="contextMenu.y" 
      :isTrash="isTrashActive"
      @close="closeContext"
      @action="onContextMenuAction"
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

    <ResultToast
      :open="toastState.visible"
      :title="toastState.title"
      :description="toastState.description"
      :variant="toastState.variant"
      :action-label="toastState.actionLabel"
      @close="closeToast"
      @action="toastState.onAction?.()"
    />
  </TooltipProvider>
</template>

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
</style>
