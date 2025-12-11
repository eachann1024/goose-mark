<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, nextTick } from 'vue'

import BookmarkCard from '@/components/BookmarkCard.vue'
import SettingsPanel from '@/views/SettingsPanel.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import CategoryMultiSelect from '@/components/CategoryMultiSelect.vue'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import type { Bookmark, IconSource, BookmarkLocation } from '@/types/bookmark'
import { ensureIconForBookmark, iconToDisplayUrl } from '@/services/iconCache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Image } from '@/components/ui/image'

import IconSelector from '@/components/IconSelector.vue'

import { useDark, useToggle, onClickOutside, useDebounceFn, useEventListener } from '@vueuse/core'
import { probeUrl } from '@/services/siteProbe'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'


const store = useBookmarkStore()
const tab = ref<'bookmarks' | 'settings'>('bookmarks')
const showAdd = ref(false)
const modalTitle = ref('新建书签')
const editingId = ref('')
// Delete confirmation state
const showDeleteConfirm = ref(false)
const confirmDeleteId = ref('')

// 键盘导航状态
const selectedIndex = ref(-1)
const bookmarkGridRef = ref<HTMLElement | null>(null)



const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
})
const toggleDark = useToggle(isDark)
const isUTools = ref(typeof window !== 'undefined' && !!window.utools)

// Theme Logic
import { useThemeStore } from '@/stores/theme'
const themeStore = useThemeStore()

watch(() => themeStore.currentTheme, (v) => {
  document.documentElement.dataset.theme = v
}, { immediate: true })

// AI Logic
const isUrlAccessible = ref(false)
const isCheckingUrl = ref(false)
const isGenerating = ref(false)

const checkUrl = useDebounceFn(async (url: string) => {
  if (!url) {
    isUrlAccessible.value = false
    return
  }
  // In Dev environment (no uTools), skip strict probe check to allow UI testing
  if (!window.utools) {
     isUrlAccessible.value = true
     return
  }

  isCheckingUrl.value = true
  let target = url
  // Auto-prepend https if missing for check
  if (!/^https?:\/\//i.test(target)) {
     target = 'https://' + target
  }
  
  // Optimistic update
  isUrlAccessible.value = true
  
  try {
     const res = await probeUrl(target)
     if (!res.ok) isUrlAccessible.value = false
  } catch {
     isUrlAccessible.value = false
  } finally {
     isCheckingUrl.value = false
  }
}, 500)

watch(() => draft.url, (v) => {
  checkUrl(v)
})

const askAI = async () => {
  if (!draft.url || !isUrlAccessible.value) return
  
  isGenerating.value = true
  try {
    const prompt = `Please generate a concise title and description for this URL: ${draft.url}. Return a JSON object with keys "title" and "desc".`
    
    if (window.utools?.askAI) {
       const res = await window.utools.askAI(prompt)
       try {
          const match = res.match(/\{[\s\S]*\}/)
          const jsonStr = match ? match[0] : res
          const data = JSON.parse(jsonStr)
          if (data.title) draft.title = data.title
          if (data.desc) draft.desc = data.desc
       } catch {
          draft.desc = res
       }
    } else {
       // Mock for dev
       await new Promise(r => setTimeout(r, 1000))
       draft.title = `AI Title for ${draft.url}`
       draft.desc = `AI Description for ${draft.url}`
    }
  } catch(e) {
    console.error(e)
  } finally {
    isGenerating.value = false
  }
}

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  target: null as Bookmark | null
})

// Click outside logic for Category Selector
const categorySelectContainer = ref(null)
onClickOutside(categorySelectContainer, () => {
  showCategorySelector.value = false
})

const searchValue = computed({
  get: () => store.search,
  set: v => store.setSearch(v as string)
})

// 计算当前网格列数（用于左右导航）
const getGridColumns = (): number => {
  if (!bookmarkGridRef.value) return 5
  const style = getComputedStyle(bookmarkGridRef.value)
  const columns = style.getPropertyValue('grid-template-columns')
  return columns.split(' ').filter(Boolean).length || 1
}

// 键盘导航处理
const handleKeyNavigation = (e: KeyboardEvent) => {
  // 如果弹窗开启/正在输入，跳过
  if (showAdd.value || showDeleteConfirm.value || showIconSelector.value || tab.value !== 'bookmarks') return
  
  const active = document.activeElement as HTMLElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
  
  const bookmarks = store.filteredBookmarks
  if (bookmarks.length === 0) return
  
  const key = e.key
  const cols = getGridColumns()
  const total = bookmarks.length
  
  // 添加卡片占据最后一个位置（如果不在回收站）
  const hasAddCard = !isTrashActive.value
  const totalSlots = hasAddCard ? total + 1 : total
  
  let newIndex = selectedIndex.value
  
  switch (key) {
    case 'ArrowRight':
      e.preventDefault()
      if (selectedIndex.value < 0) {
        newIndex = 0
      } else {
        newIndex = Math.min(selectedIndex.value + 1, total - 1)
      }
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (selectedIndex.value < 0) {
        newIndex = 0
      } else {
        newIndex = Math.max(selectedIndex.value - 1, 0)
      }
      break
    case 'ArrowDown':
      e.preventDefault()
      if (selectedIndex.value < 0) {
        newIndex = 0
      } else {
        // 移动到下一行同一列
        const nextRowIndex = selectedIndex.value + cols
        newIndex = Math.min(nextRowIndex, total - 1)
      }
      break
    case 'ArrowUp':
      e.preventDefault()
      if (selectedIndex.value < 0) {
        newIndex = 0
      } else {
        // 移动到上一行同一列
        const prevRowIndex = selectedIndex.value - cols
        newIndex = Math.max(prevRowIndex, 0)
      }
      break
    case 'Enter':
      e.preventDefault()
      if (selectedIndex.value >= 0 && selectedIndex.value < total) {
        const bookmark = bookmarks[selectedIndex.value]
        if (bookmark) {
          if (window.utools) {
            window.utools.shellOpenExternal(bookmark.url)
          } else {
            window.open(bookmark.url, '_blank')
          }
        }
      }
      return
    default:
      return
  }
  
  selectedIndex.value = newIndex
}

// 监听键盘事件
useEventListener(window, 'keydown', handleKeyNavigation)

// 搜索变化时重置选中索引
watch(() => store.search, () => {
  selectedIndex.value = store.filteredBookmarks.length > 0 ? 0 : -1
})

// 切换分组时重置选中索引
watch([() => store.activeGroupId, () => store.activeSubGroupId], () => {
  selectedIndex.value = -1
})

const draft = reactive({ title: '', url: '', desc: '' })
const draftLocations = ref<BookmarkLocation[]>([])
const showCategorySelector = ref(false)
const showIconSelector = ref(false)
const previewIcon = ref<IconSource | null>(null)
const formError = ref('')  // 验证错误提示
let previewTimer: ReturnType<typeof setTimeout> | null = null

const previewIconStyle = computed(() => {
  if (previewIcon.value?.type === 'text' && previewIcon.value.bgColor) {
    return { backgroundColor: previewIcon.value.bgColor }
  }
  return { backgroundColor: 'hsl(var(--background))' }
})

const previewText = computed(() => {
  const text = (draft.title || draft.url || '').trim()
  return text ? text.slice(0, 4) : 'ICON'
})

const previewIconUrl = computed(() => iconToDisplayUrl(previewIcon.value ?? undefined))

// 选中的分类标签显示
const selectedLocationsLabel = computed(() => {
  if (draftLocations.value.length === 0) return ''
  return draftLocations.value.map(loc => {
    const group = store.groups.find(g => g.id === loc.groupId)
    const sub = group?.children.find(c => c.id === loc.subGroupId)
    return group && sub ? `${group.name} / ${sub.name}` : ''
  }).filter(Boolean).join(', ')
})

const openAdd = () => {
   editingId.value = ''
   modalTitle.value = '新建书签'
   draft.title = ''
   draft.url = ''
   draft.desc = ''
   // 默认选择当前激活的分组
   draftLocations.value = [{ groupId: store.activeGroupId, subGroupId: store.activeSubGroupId }]
   previewIcon.value = null
   formError.value = ''
   showAdd.value = true
}

const openEdit = (bookmark: Bookmark) => {
   editingId.value = bookmark.id
   modalTitle.value = '编辑书签'
   draft.title = bookmark.title || ''
   draft.url = bookmark.url
   draft.desc = bookmark.desc || ''
   previewIcon.value = bookmark.icon ?? null
   formError.value = ''
   
   // 获取书签的所有位置
   draftLocations.value = store.getBookmarkLocations(bookmark.id)
   showAdd.value = true
}

// Global Paste Listener for Image Replacement
useEventListener(window, 'paste', (e: ClipboardEvent) => {
  if (!showAdd.value) return
  
  // Ignore if pasting into input/textarea
  const active = document.activeElement as HTMLElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    return
  }
  
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
       e.preventDefault() // Prevent default handling
       const file = item.getAsFile()
       if (file) {
         const reader = new FileReader()
         reader.onload = (evt) => {
            const result = evt.target?.result as string
            if (result) {
              previewIcon.value = {
                type: 'remote',
                src: result,
                fetchedAt: Date.now()
              }
            }
         }
         reader.readAsDataURL(file)
       }
       return
    }
  }
})

onMounted(() => {
  // 执行数据迁移
  store.migrateFromLegacy()
  
  if (window.utools) {
    const syncTheme = () => {
      try {
         const isdev = window.utools.isDarkColors?.()
         if (typeof isdev === 'boolean') {
           isDark.value = isdev
         }
      } catch (e) {}
    }
    
    syncTheme()
    
    window.utools.onPluginEnter(() => {
       syncTheme()
       window.utools?.setSubInput(({ text }) => {
         store.setSearch(text)
       }, '搜索书签...', true)
    })
  }
})

// Smart Creation: Auto-fill title from URL + Icon 预览
watch(() => draft.url, async (val) => {
  if (editingId.value) return
  
  if (!val) {
    previewIcon.value = null
    return
  }
  
  if (!draft.title) {
    try {
      const url = new URL(val)
      if (url.hostname) {
        draft.title = url.hostname
      }
    } catch (e) { }
  }

  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(async () => {
    try {
      const icon = await ensureIconForBookmark({
        id: 'temp',
        title: draft.title || val,
        url: val,
        desc: draft.desc,
        tags: []
      })
      previewIcon.value = icon ?? null
    } catch {
      previewIcon.value = null
    }
  }, 300)
})

watch(showAdd, (v) => {
  if (!v) {
    previewIcon.value = null
    showCategorySelector.value = false
  }
})

const handleSave = async () => {
  // 重置错误
  formError.value = ''
  if (!draft.title.trim() || !draft.url.trim()) {
    formError.value = '标题和链接为必填项'
    return
  }
  if (draftLocations.value.length === 0) {
    formError.value = '请至少选择一个分类'
    return
  }

  const iconToSave = previewIcon.value ?? undefined

  if (editingId.value) {
    // 更新书签属性
    store.updateBookmark(editingId.value, {
      title: draft.title.trim(),
      url: draft.url.trim(),
      desc: draft.desc.trim(),
      icon: iconToSave
    })
    // 更新分组位置
    store.updateBookmarkLocations(editingId.value, draftLocations.value)
  } else {
    const created = store.addBookmark(
      {
        title: draft.title.trim(),
        url: draft.url.trim(),
        desc: draft.desc.trim(),
        tags: [],
        pinned: false,
        icon: iconToSave
      },
      draftLocations.value
    )
    if (created && !iconToSave) await store.refreshSingleIcon(created)
  }
  
  showAdd.value = false
}

const handleRemove = (bookmark: Bookmark) => {
  // BookmarkCard 已经有 Popover 二次确认，直接执行删除
  store.removeBookmark(bookmark.id)
}

const handleContextMenu = (e: MouseEvent, bookmark: Bookmark) => {
  contextMenu.show = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.target = bookmark
}

const onContextMenuAction = (action: string) => {
  const b = contextMenu.target
  if (!b) return
  if (action === 'open') {
    if (window.utools) {
      window.utools.shellOpenExternal(b.url)
    } else {
      window.open(b.url, '_blank')
    }
  }
  if (action === 'restore') {
      store.restoreBookmark(b.id)
  }
  if (action === 'remove') {
    // 右键菜单删除需要 Dialog 确认
    confirmDeleteId.value = b.id
    showDeleteConfirm.value = true
  }
}
const confirmDelete = () => {
  if (confirmDeleteId.value) {
    store.removeBookmark(confirmDeleteId.value)
  }
  showDeleteConfirm.value = false
}

const emptyTrash = () => {
    if (confirm('确定要清空回收站吗？此操作不可恢复。')) {
        store.emptyTrash()
    }
}

const activeGroup = computed(() => store.groups.find(g => g.id === store.activeGroupId))
const activeSubGroups = computed(() => activeGroup.value?.children ?? [])
// 修改：只有一个子分组就隐藏
const shouldShowSubs = computed(() => {
  return activeSubGroups.value.length > 1
})

const visibleGroups = computed(() => store.groups.filter(g => g.id !== TRASH_GROUP_ID))
const isTrashActive = computed(() => store.activeGroupId === TRASH_GROUP_ID)

</script>

<template>
  <TooltipProvider :delay-duration="100">
  <div class="min-h-screen flex flex-col bg-background text-foreground" @click="contextMenu.show = false">
    <!-- Top Navigation for Groups -->
    <header class="sticky top-0 z-30 flex flex-col gap-2 p-6 bg-background/80 backdrop-blur-md">
       <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 overflow-x-auto no-scrollbar mask-gradient-right">
            <Button
              v-for="group in visibleGroups"
              :key="group.id"
              variant="ghost"
              size="sm"
              class="rounded-full px-4 h-9 font-normal transition-all data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md"
              :data-active="store.activeGroupId === group.id ? 'true' : undefined"
              @click="store.selectGroup(group.id); tab = 'bookmarks'"
            >
              {{ group.name }}
            </Button>
          </div>
          <div class="flex items-center gap-2 shrink-0 ml-4">
             <Input v-if="!isUTools" class="w-64 h-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-input transition-all" v-model="searchValue" placeholder="搜索..." />
             <div class="h-6 w-px bg-border mx-2"></div>
             <Button
               variant="ghost"
               size="sm"
               class="text-xs text-muted-foreground hover:text-foreground"
               :class="{ 'bg-muted text-foreground': tab === 'bookmarks' }"
               @click="tab = 'bookmarks'"
             >View</Button>
             <Button
               variant="ghost"
               size="sm"
               class="text-xs text-muted-foreground hover:text-foreground"
               :class="{ 'bg-muted text-foreground': tab === 'settings' }"
               @click="tab = 'settings'"
             >Config</Button>
              <div class="h-6 w-px bg-border mx-2"></div>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost" 
                    size="icon"
                    class="w-7 h-7 text-muted-foreground hover:text-foreground"
                    @click="toggleDark()"
                  >
                     <span class="i-mdi-theme-light-dark text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>切换主题</p></TooltipContent>
              </Tooltip>

              <div class="h-6 w-px bg-border mx-2"></div>
              
              <!-- Trash Icon -->
              <Tooltip>
                <TooltipTrigger as-child>
                   <Button
                     variant="ghost"
                     size="icon"
                     class="w-7 h-7 text-muted-foreground hover:text-destructive transition-colors"
                     :class="{ 'bg-destructive/10 text-destructive': isTrashActive }"
                     @click="store.selectGroup(TRASH_GROUP_ID); tab = 'bookmarks'"
                   >
                      <span class="i-mdi-trash-can-outline text-lg" />
                   </Button>
                </TooltipTrigger>
                <TooltipContent><p>回收站</p></TooltipContent>
              </Tooltip>
          </div>
       </div>
    </header>

    <!-- Main Content with Sub-groups sidebar -->
    <main class="flex-1 flex px-6 pb-6 gap-4">
      <!-- Sub-groups Sidebar (图二布局) -->
      <aside 
        v-if="tab === 'bookmarks' && shouldShowSubs" 
        class="shrink-0 w-32 flex flex-col gap-1"
      >
        <button
            v-for="sub in activeSubGroups"
            :key="sub.id"
            class="text-left px-3 py-2 rounded-md text-sm transition-all"
            :class="{
              'text-primary font-medium border-l-2 border-primary bg-primary/5': store.activeSubGroupId === sub.id,
              'text-muted-foreground hover:text-foreground hover:bg-muted/50': store.activeSubGroupId !== sub.id
            }"
            @click="store.selectSubGroup(sub.id)"
        >
          {{ sub.name }}
        </button>
      </aside>

      <!-- Bookmarks Grid -->
      <section 
        v-if="tab === 'bookmarks'" 
        ref="bookmarkGridRef"
        class="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start"
      >
        <BookmarkCard
          v-for="(bookmark, index) in store.filteredBookmarks"
          :key="bookmark.id"
          :bookmark="bookmark"
          :selected="selectedIndex === index"
          @remove="handleRemove"
          @edit="openEdit"
          @contextmenu="handleContextMenu($event, bookmark)"
        />
        
        <!-- Add New Card (Hidden in Trash) -->
        <Tooltip v-if="!isTrashActive">
          <TooltipTrigger as-child>
             <button 
                class="group relative flex flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-muted-foreground hover:border-primary hover:text-primary hover:bg-muted/30 transition-all cursor-pointer h-full min-h-[72px] w-full"
                @click="openAdd"
             >
                <div class="group-hover:scale-110 transition-transform">
                  <span class="i-mdi-plus text-3xl" />
                </div>
             </button>
          </TooltipTrigger>
          <TooltipContent><p>添加书签</p></TooltipContent>
        </Tooltip>

        <!-- Empty Trash Button -->
        <div v-if="isTrashActive && store.filteredBookmarks.length > 0" class="col-span-full flex justify-center py-8">
           <Button variant="destructive" @click="emptyTrash">
              <span class="i-mdi-delete-empty mr-2" />
              清空回收站
           </Button>
        </div>
      </section>

      <section v-else class="max-w-4xl mx-auto w-full">
        <SettingsPanel />
      </section>
    </main>
    
    <ContextMenu 
      v-if="contextMenu.show" 
      :x="contextMenu.x" 
      :y="contextMenu.y" 
      :isTrash="isTrashActive"
      @close="contextMenu.show = false"
      @action="onContextMenuAction"
    />

    <Dialog v-model:open="showAdd">
      <DialogContent class="sm:max-w-[600px] p-0 gap-0 bg-card border-border overflow-visible">
         <div class="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
            <DialogTitle class="text-lg font-medium flex items-center gap-2">
               <span class="i-mdi-card-text-outline text-primary text-xl" />
               {{ modalTitle }}
            </DialogTitle>
         </div>

         <div class="p-6 space-y-6 min-h-[420px]">
             <!-- URL Input -->
             <div class="space-y-2">
                 <div class="flex gap-2 items-center">
                   <Input 
                     v-model="draft.url" 
                     placeholder="https://example.com" 
                     class="h-12 bg-muted/30 font-mono text-base placeholder:text-muted-foreground/50 flex-1"
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
                            <span v-else>🪄</span>
                         </Button>
                       </TooltipTrigger>
                       <TooltipContent>
                         <p v-if="!draft.url">请输入网址以使用 AI</p>
                         <p v-else-if="isCheckingUrl">正在检测网址连通性...</p>
                         <p v-else-if="!isUrlAccessible">网址无法访问，AI 无法读取</p>
                         <p v-else>点击使用 AI 优化标题和描述</p>
                       </TooltipContent>
                     </Tooltip>
                 </div>
             </div>

             <!-- 错误提示 -->
             <p v-if="formError" class="text-sm text-red-500">{{ formError }}</p>

             <!-- Info Card -->
             <div class="flex gap-4 p-4 rounded-xl border border-border bg-muted/10">
                 <!-- Icon -->
                 <div class="shrink-0">
                     <div 
                        class="w-16 h-16 rounded-xl border border-border flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        :style="previewIconStyle"
                        @click="showIconSelector = true"
                     >
                        <Image v-if="previewIconUrl" :src="previewIconUrl" class="w-full h-full object-contain" />
                        <span v-else class="text-sm font-semibold text-muted-foreground px-1 text-center" :class="{ 'text-white': previewIcon?.type === 'text' && previewIcon.bgColor }">
                          {{ previewIcon?.type === 'text' ? previewIcon.value : previewText }}
                        </span>
                     </div>
                 </div>
                 
                 <div class="flex-1 space-y-3">
                     <div class="relative">
                       <Input 
                          v-model="draft.title" 
                          placeholder="网站标题" 
                          class="h-9 border-0 border-b border-border rounded-none px-0 bg-transparent focus-visible:ring-0 focus-visible:border-primary shadow-none font-bold text-lg placeholder:text-muted-foreground/50 placeholder:font-normal"
                       />
                       <span class="absolute right-0 top-2 text-xs text-muted-foreground">{{ draft.title?.length ?? 0 }} / 50</span>
                     </div>
                     <Textarea 
                        v-model="draft.desc" 
                        placeholder="请输入网站简介" 
                        class="min-h-[60px] resize-none bg-transparent border-0 px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50 text-sm"
                     />
                 </div>
             </div>

             <!-- Category Multi-Select -->
             <div class="space-y-2">
                <label class="text-sm font-medium text-muted-foreground flex items-center gap-1">
                   <span class="text-destructive">*</span> 所在分类
                </label>
                
                <div class="relative" ref="categorySelectContainer">
                   <div 
                     class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-muted/50"
                     @click="showCategorySelector = !showCategorySelector"
                   >
                     <div v-if="selectedLocationsLabel" class="flex items-center gap-2 truncate text-primary font-medium">
                        {{ selectedLocationsLabel }}
                     </div>
                     <span v-else class="text-muted-foreground">选择分类...</span>
                     <span class="i-mdi-chevron-down opacity-50 shrink-0" />
                   </div>

                   <!-- Multi-Select Dropdown -->
                   <div v-if="showCategorySelector" class="absolute top-full left-0 z-50 mt-1">
                      <CategoryMultiSelect 
                        v-model="draftLocations"
                        @close="showCategorySelector = false"
                      />
                   </div>
                </div>
             </div>
         </div>

         <DialogFooter class="px-6 py-4 bg-muted/20 border-t border-border sm:justify-center">
            <Button variant="outline" class="w-32" @click="showAdd = false">取消</Button>
            <Button class="w-32" @click="handleSave">保存</Button>
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
  </div>
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
</style>
