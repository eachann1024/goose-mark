<script setup lang="ts">


import SettingsPanel from '@/views/SettingsPanel.vue'






import { TRASH_GROUP_ID } from '@/stores/bookmark'
import type { Bookmark } from '@/types/bookmark'



// Stores
const store = useBookmarkStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const { toastState, closeToast } = useToast()

// Composables
const { tab, isDark, toggleDark, isUTools, isMac } = useAppState()
const { 
  openBookmarkLink, 
  openUrl,
  copyBookmarkUrl, 
  handleRemove, 
  requestDelete: openDeleteConfirm,
  confirmDelete, 
  emptyTrash, 
  handleReorder,
  showDeleteConfirm, 
  confirmDeleteId, 
  copyNotice,
  getTemplateLabel
} = useBookmarkOperations()

const {
  showAdd,
  modalTitle,
  editingId,
  draft,
  draftLocations,
  previewIcon,
  showCategorySelector,
  showIconSelector,
  categorySelectContainer,
  formError,
  isSaving,
  iconLoading,
  iconFetchFailed,
  titleFetchFailed,
  dialogOrigin,
  isEditing,
  maxDescLen,
  previewIconStyle,
  previewText,
  previewIconUrl,
  selectedLocationsLabel,
  isDraftTemplate,
  draftTemplateLabel,
  openAdd,
  openEdit,
  handleSave,
  askAI,
  isUrlAccessible,
  isCheckingUrl,
  isGenerating
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
  shareError,
  createShare,
  copyShareLink,
  buildShareUrl,
  validateAndCleanGroupShares
} = useShare()

// 打开分享链接
const handleOpenShareUrl = (shareId: string) => {
  const url = buildShareUrl(shareId)
  window.open(url, '_blank')
}

// 复制分享链接
const handleCopyShareLink = async (shareId: string) => {
  const success = await copyShareLink(shareId)
  if (success) {
    window.utools?.showNotification?.('分享链接已复制到剪贴板')
  } else {
    window.utools?.showNotification?.('复制失败，无法访问剪贴板')
  }
}

// 分享管理面板状态
const showSharePanel = ref(false)

// 打开分享管理面板
const handleShareSubGroup = () => {
  showSharePanel.value = true
}

// 分享成功回调
const handleShared = (shareId: string) => {
  window.utools?.showNotification?.('分享链接已生成')
}

// Shared State
const selectedIndex = ref(-1)

// Window Height Watcher
watch(() => settingsStore.windowHeight, (h) => {
  setExpendHeight(h)
}, { immediate: true })

// Search
const {
  localSearchInputRef,
  searchViewOpen,
  searchValue,
  debouncedSearch, // exposed if needed for debug
  searchResults,
  activeBookmarks,
  searchAutoExitText,
  openSearchView,
  closeSearchView,
  handleTypeToSearch,
  handleSubInput,
  focusUToolsInput
} = useSearch(tab, selectedIndex, isUTools)

// Keyboard
const {
  bookmarkGridRef,
  setBookmarkGridRef,
  cmdPressed,
  showCmdHints,
  hintKeyById,
  hideCmdHints,
  handleKeyNavigation,
  handleLocalSearchKey
} = useKeyboard(
  selectedIndex, 
  activeBookmarks, 
  searchViewOpen, 
  isMac, 
  showAdd, 
  showDeleteConfirm, 
  showIconSelector, 
  tab, 
  openBookmarkLink
)

// Coordination Watchers
// Close context menu on click is handled by template click handler
watch(() => store.search, () => {
  hideCmdHints()
})
watch(() => tab.value, () => {
  hideCmdHints()
  closeContext()
})
// Reset selected index when group changes
watch([() => store.activeGroupId, () => store.activeSubGroupId], () => {
  selectedIndex.value = -1
  hideCmdHints()
  closeContext() // Also close context menu
})

// 切换主分组时，验证并清理失效的分享状态
watch(() => store.activeGroupId, (groupId) => {
  if (groupId && groupId !== TRASH_GROUP_ID) {
    // 异步验证，不阻塞 UI
    validateAndCleanGroupShares(groupId)
  }
})

// Context Menu Action Handler
const onContextMenuAction = (action: string) => {
  const b = contextMenu.target
  if (!b) return
  if (action === 'open') {
    openBookmarkLink(b)
  }
  if (action === 'restore') {
      store.restoreBookmark(b.id)
  }
  if (action === 'remove') {
    confirmDeleteId.value = b.id
    showDeleteConfirm.value = true
  }
  if (action === 'copy') {
      // Missing copy action in original? Original called copy immediately on open context menu.
      // Re-implementing behavior from original:
      // "void copyBookmarkUrl(bookmark)" was called in handleContextMenu.
      // But ContextMenu component emits 'action' for other things.
      // If user clicks "copy" in context menu?
      // Original ContextMenu.vue likely has 'copy' item? 
      // Original code:
      // const handleContextMenu = (e, bookmark) => { ... void copyBookmarkUrl(bookmark) }
      // So it copied on open.
      // I should replicate this in my wrapper.
  }
}

// Wrapper for ContextMenu open to include auto-copy
const handleContextMenuWrapper = (e: MouseEvent, bookmark: Bookmark) => {
    onContextMenu(e, bookmark)
    void copyBookmarkUrl(bookmark)
}

// Group Helpers
const activeGroup = computed(() => store.groups.find(g => g.id === store.activeGroupId))
const activeSubGroups = computed(() => activeGroup.value?.children ?? [])
const shouldShowSubs = computed(() => activeSubGroups.value.length >= 1)
const visibleGroups = computed(() => store.groups.filter(g => g.id !== TRASH_GROUP_ID))
const isTrashActive = computed(() => store.activeGroupId === TRASH_GROUP_ID)

// Lifecycle
onMounted(async () => {
    // Check for shareId in URL - support both /s/xxx path and ?shareId=xxx query
    let shareId: string | null = null
    
    // 1. 检查路径格式 /s/xxx
    const pathMatch = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)$/)
    if (pathMatch) {
      shareId = pathMatch[1]
    }
    
    // 2. 检查查询参数格式 ?shareId=xxx
    if (!shareId) {
      const urlParams = new URLSearchParams(window.location.search)
      shareId = urlParams.get('shareId')
    }
    
    if (shareId) {
      await loadShareData(shareId)
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
  if (!utoolsApi) {
    settingsStore.setEnableSubInput(false)
  }
  if (utoolsApi) {
    const syncTheme = () => {
      try {
         const isdev = utoolsApi.isDarkColors?.()
         if (typeof isdev === 'boolean') {
           useAppState().isDark.value = isdev // Accessing ref from composable
         }
      } catch (e) {}
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
       syncTheme()
       syncFeatures(store.bookmarks)
       syncSubInput()

       const code = params?.code
       if (typeof code === 'string' && code.startsWith(FEATURE_PREFIX)) {
         const id = code.slice(FEATURE_PREFIX.length)
         const bookmark = store.bookmarks.find(b => b.id === id)
         if (import.meta.env.DEV) {
           console.info('[Bookmark] utools open', bookmark)
         }
         const query = getEnterText(params?.payload).trim()
         if (!bookmark) {
           window.utools?.outPlugin()
           return
         }
         
         const hasTemplate = /{[^}]+}/.test(bookmark.url)
         if (hasTemplate && !query) {
           window.utools?.showNotification?.(`请输入${getTemplateLabel(bookmark.url)}`)
           window.utools?.outPlugin()
           return
         }
         
         let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
         if (!/^https?:\/\//i.test(url)) url = 'https://' + url
         openUrl(url)
         if (settingsStore.autoCloseWindow && isDetachedWindowNow()) {
           window.utools?.outPlugin()
         }
         return
       }

       store.setSearch('')
       // Reset various states handled by composables?
       // searchViewOpen.value = false // Already default? 
       // We might need to force reset if plugin was kept alive.
       closeSearchView() 
       
       // Force window height on enter
       setExpendHeight(settingsStore.windowHeight)

       if (settingsStore.enableSubInput) {
         focusUToolsInput()
       }
    })
  }
})

watch(() => store.bookmarks, () => {
  syncFeatures(store.bookmarks)
}, { deep: true })

</script>

<template>
  <TooltipProvider :delay-duration="100">
  <div class="min-h-screen h-screen flex flex-col bg-background text-foreground overflow-hidden" @click="closeContext">
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
         @select-group="(id) => { store.selectGroup(id); tab = 'bookmarks' }"
         @select-trash="store.selectGroup(TRASH_GROUP_ID); tab = 'bookmarks'"
         @toggle-dark="toggleDark()"
         @open-search="openSearchView"
       />
    </header>

    <Transition name="fade">
      <section
        v-if="searchViewOpen"
        class="fixed inset-0 z-[2000] bg-background/95 backdrop-blur-md px-6 py-8 overflow-y-auto"
      >
        <div class="max-w-5xl mx-auto space-y-4">
          <div class="flex items-center gap-3">
            <Button variant="ghost" size="icon" class="h-11 w-11" @click="closeSearchView">
              <span class="i-mdi-arrow-left text-xl" />
            </Button>
            <template v-if="settingsStore.enableSubInput">
              <div class="flex-1 h-12 rounded-xl border border-border bg-muted/50 px-4 flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <span class="i-mdi-magnify text-base" />
                  <span>请在 uTools 输入框输入关键字进行搜索</span>
                </div>
                <div v-if="store.search" class="text-xs text-muted-foreground flex items-center gap-1">
                  <span class="i-mdi-ray-start-vertex" />
                  <span>当前：{{ store.search }}</span>
                </div>
              </div>
            </template>
            <template v-else>
              <Input
                v-model="searchValue"
                ref="localSearchInputRef"
                @keydown="handleLocalSearchKey"
                placeholder="输入关键字搜索书签..."
                class="flex-1 h-12 text-base bg-muted/50 border-border focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </template>
            <Button variant="secondary" class="h-11 px-4" @click="closeSearchView">退出</Button>
          </div>
          <div
            v-if="!store.search"
            class="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
          >
            <div>输入关键字开始搜索</div>
              <div class="flex items-center gap-2 justify-center">
                <span class="i-mdi-information-outline" />
                <span>按 ESC 退出；按 ↑ ↓ ← → 选择，回车打开；{{ searchAutoExitText }}</span>
              </div>
          </div>
          <div
            v-else-if="searchResults.length === 0"
            class="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
          >
            <div>未找到匹配结果</div>
            <div class="space-y-1 text-[13px] text-muted-foreground flex flex-col gap-1 px-1 mt-3">
              <div class="flex items-center gap-2 justify-center">
                <span class="i-mdi-information-outline" />
                <span>按 ESC 退出；按 ↑ ↓ ← → 选择，回车打开；{{ searchAutoExitText }}</span>
              </div>
            </div>
          </div>
          <BookmarksGrid
            v-else
            :bookmarks="activeBookmarks"
            :selected-index="selectedIndex"
            :is-trash-active="false"
            :columns="settingsStore.gridColumns"
            :set-grid-ref="setBookmarkGridRef"
            :hide-add-card="true"
            :show-command-hints="showCmdHints"
            :hint-key-by-id="hintKeyById"
            @remove="handleRemove"
            @edit="(b, el) => openEdit(b, el)"
            @open="openBookmarkLink"
            @contextmenu="handleContextMenuWrapper"
            @reorder="handleReorder"
          />
        </div>
      </section>
    </Transition>

      <!-- Main Content with Sub-groups sidebar -->
    <main class="flex-1 min-h-0 flex px-6 pb-6 gap-4 overflow-y-auto no-scrollbar">
      <SubGroupSidebar
        :show="tab === 'bookmarks' && shouldShowSubs"
        :active-sub-groups="activeSubGroups"
        :active-sub-group-id="store.activeSubGroupId"
        :active-group-id="store.activeGroupId"
        @select="store.selectSubGroup"
        @share="handleShareSubGroup"
        @open-share-url="handleOpenShareUrl"
        @copy-share-link="handleCopyShareLink"
        @delete-sub-group="(id) => store.deleteSubGroup(store.activeGroupId, id)"
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
    

    <ContextMenu 
      v-if="contextMenu.show && !store.isReadOnly" 
      :x="contextMenu.x" 
      :y="contextMenu.y" 
      :isTrash="isTrashActive"
      @close="closeContext"
      @action="onContextMenuAction"
    />

    <Transition name="fade">
      <div
        v-if="copyNotice.visible"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-card/90 backdrop-blur px-4 py-2 rounded-lg border border-border shadow-lg text-sm text-foreground"
      >
        {{ copyNotice.text }}
      </div>
    </Transition>

    <Dialog v-model:open="showAdd">
      <DialogContent 
        class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 bg-card border-border"
        :origin-x="dialogOrigin?.x"
        :origin-y="dialogOrigin?.y"
      >
         <div class="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
            <DialogTitle class="text-lg font-medium flex items-center gap-2">
               <span class="i-mdi-card-text-outline text-primary text-xl" />
               {{ modalTitle }}
            </DialogTitle>
         </div>

         <div class="p-6 space-y-6">
             <!-- URL Input -->
             <div class="space-y-3">
                 <div class="flex gap-2 items-center">
                  <Input 
                     v-model="draft.url" 
                     placeholder="https://example.com 或含 {query} 的搜索模板" 
                     class="h-12 bg-muted/30 font-mono text-base placeholder:text-muted-foreground/40 flex-1 px-4"
                     auto-focus
                   />
                     <Tooltip>
                       <TooltipTrigger as-child>
                         <Button
                           variant="outline"
                           size="icon"
                           class="h-12 w-12 shrink-0 transition-all text-2xl"
                           :class="{ 
                             'opacity-50 cursor-not-allowed': !draft.url || !isUrlAccessible || isGenerating,
                             'text-primary border-primary bg-primary/5': draft.url && isUrlAccessible && !isGenerating
                           }"
                           @click="(!draft.url || !isUrlAccessible || isGenerating) ? null : askAI()"
                         >
                            <span v-if="isGenerating" class="i-mdi-loading animate-spin text-xl" />
                            <span v-else class="i-mdi-sparkles text-xl" />
                          </Button>
                       </TooltipTrigger>
                       <TooltipContent class="text-xs text-muted-foreground">
                         <p v-if="!draft.url">请输入网址以使用 AI</p>
                         <p v-else-if="isCheckingUrl">正在检测网址连通性...</p>
                         <p v-else-if="!isUrlAccessible">网址无法访问，AI 无法读取</p>
                         <p v-else>点击使用 AI 优化标题和描述</p>
                       </TooltipContent>
                     </Tooltip>
                 </div>
             </div>

             <!-- 模板书签提示 (uTools only) -->
             <Transition name="fade">
               <div v-if="isDraftTemplate && isUTools" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                 <span class="i-mdi-lightbulb-on-outline text-primary text-lg shrink-0 mt-0.5" />
                 <div class="text-sm text-muted-foreground">
                    <p class="font-medium text-foreground decoration-dashed decoration-primary underline underline-offset-2">🚀 快捷搜索书签</p>
                   <p class="mt-1">
                     保存后，在 uTools 主搜索输入「<span class="text-primary font-medium">{{ draft.title || '书签名' }}</span>」
                     按 <kbd class="px-1.5 py-0.5 mx-0.5 rounded bg-muted border border-border text-xs font-mono">Tab</kbd> 
                     输入「{{ draftTemplateLabel }}」即可快速打开
                   </p>
                 </div>
               </div>
             </Transition>

             <!-- Universal Search Option (uTools only) -->
             <div v-if="isDraftTemplate && isUTools">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2 w-max">
                        <Checkbox 
                          id="allowUniversal" 
                          :checked="draft.allowUniversal"
                          @update:checked="(v) => draft.allowUniversal = v"
                        />
                        <label for="allowUniversal" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 select-none cursor-pointer">
                           开启万能匹配（匹配主输入框任意文本）
                        </label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs">
                      <p>勾选后，主输入框输入"任意内容"均可匹配此书签（通常用于聚合搜索）</p>
                    </TooltipContent>
                  </Tooltip>
            </div>

             <!-- 错误提示 -->
             <p v-if="formError" class="text-sm text-red-500">{{ formError }}</p>

             <!-- Info Card -->
             <div class="flex gap-4 p-4 rounded-xl border border-border bg-muted/10">
                 <!-- Icon -->
                 <div class="shrink-0 flex flex-col items-center gap-1">
                   <div 
                      class="w-10 h-10 rounded-lg border border-border flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                      :style="previewIconStyle"
                      @click="showIconSelector = true"
                    >
                       <div v-if="iconLoading" class="w-7 h-7 border-2 border-primary/60 border-t-transparent rounded-full animate-spin" />
                       <template v-else>
                         <Image v-if="previewIconUrl" :src="previewIconUrl" class="w-4/5 h-4/5 object-contain" />
                         <span v-else class="text-xs font-bold px-1 text-center" :class="previewIcon?.type === 'text' && previewIcon.bgColor ? 'text-white' : 'text-muted-foreground'">
                           {{ previewIcon?.type === 'text' ? previewIcon.value : previewText }}
                         </span>
                       </template>
                    </div>
                     <p v-if="iconFetchFailed && !iconLoading && draft.url" class="text-[10px] text-muted-foreground text-center max-w-[80px] leading-tight">
                       可复制网页图标后粘贴
                     </p>
                 </div>
                 
                 <div class="flex-1 space-y-3">
                     <div class="relative">
                  <Input 
                     v-model="draft.title" 
                     placeholder="网站标题" 
                      class="h-12 border-border rounded-md bg-background px-4 py-3 focus-visible:ring-2 focus-visible:ring-primary/30 shadow-none text-base font-semibold placeholder:text-muted-foreground/40"
                   />
                     <p v-if="titleFetchFailed" class="text-xs text-muted-foreground mt-1">未能自动获取标题，请手动输入。</p>
                   </div>
                     <Textarea 
                        v-model="draft.desc" 
                        placeholder="请输入网站简介" 
                        :maxlength="maxDescLen"
                        class="min-h-[80px] resize-none bg-background border border-border rounded-md px-4 py-3 focus-visible:ring-2 focus-visible:ring-primary/30 placeholder:text-muted-foreground/40 text-sm"
                     />
                 </div>
             </div>

             <!-- Category Multi-Select -->
             <div class="space-y-3">
                <label class="text-sm font-medium text-muted-foreground flex items-center gap-1">
                   <span class="text-destructive">*</span> 所在分类
                </label>
                
                <Popover v-model:open="showCategorySelector">
                  <PopoverTrigger as-child>
                    <div 
                      class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-muted/50"
                    >
                      <div v-if="selectedLocationsLabel" class="flex items-center gap-2 truncate text-primary font-medium">
                         {{ selectedLocationsLabel }}
                      </div>
                      <span v-else class="text-muted-foreground">选择分类...</span>
                      <span class="i-mdi-chevron-down opacity-50 shrink-0" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent class="w-auto p-0 bg-transparent border-0 shadow-none z-[9999]" align="start">
                      <CategoryMultiSelect 
                        v-model="draftLocations"
                        @close="showCategorySelector = false"
                      />
                  </PopoverContent>
                </Popover>
             </div>
         </div>

         <DialogFooter class="px-6 py-4 bg-muted/20 border-t border-border sm:justify-center">
            <Button variant="outline" class="w-32" @click="showAdd = false">取消</Button>
            <Button class="w-32" :disabled="isSaving" @click="handleSave">保存</Button>
         </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showIconSelector">
       <DialogContent class="w-auto p-0 bg-transparent border-0 shadow-none">
           <IconSelector 
              :modelValue="previewIcon ?? undefined"
              :title="draft.title"
              @update:modelValue="(val) => previewIcon = val"
              @close="showIconSelector = false"
              @confirm="showIconSelector = false"
           />
       </DialogContent>
    </Dialog>
    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteConfirm">
      <DialogContent class="sm:max-w-[400px] p-4 bg-card border-border">
        <DialogHeader>
          <DialogTitle class="text-lg">确认删除</DialogTitle>
        </DialogHeader>
        <p class="py-2 text-sm">
          {{ isTrashActive ? '确定要彻底删除此书签吗？此操作不可撤销。' : '确定要将此书签移入回收站吗？' }}
        </p>
        <DialogFooter class="flex justify-end space-x-2">
          <Button variant="outline" @click="showDeleteConfirm = false">取消</Button>
          <Button @click="confirmDelete">确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 分享管理面板 -->
    <ShareManagePanel
      v-model:open="showSharePanel"
      :group-id="store.activeGroupId"
      :sub-group-id="store.activeSubGroupId"
      @shared="handleShared"
      @update-from-share="(id: string, data: any) => store.updateFromShare(id, data)"
    />
  </div>
  
  <div v-if="isLoadingShare" class="fixed inset-0 z-[99999] bg-background flex flex-col items-center justify-center gap-4">
    <Loader2 class="w-10 h-10 animate-spin text-primary" />
    <p class="text-muted-foreground font-medium">正在加载分享数据...</p>
  </div>
  
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
  transform: translate(-50%, -6px);
}
</style>
