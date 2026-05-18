<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import SearchHintLine from '@/components/bookmarks/SearchHintLine.vue'
import BookmarkPreview from '@/components/bookmarks/BookmarkPreview.vue'

const settingsStore = useSettingsStore()

const props = defineProps<{
  open: boolean
  isUTools: boolean
  searchValue: string
  activeBookmarks: Bookmark[]
  selectedIndex: number
  enableSubInput: boolean
  storeSearch: string
  searchAutoExitText: string
  showCmdHints: boolean
  hintKeyById: Record<string, string>
  gridColumns: number
  setGridRef: (el: HTMLElement | null) => void
}>()

const emit = defineEmits<{
  'update:searchValue': [value: string]
  'update:selectedIndex': [value: number]
  close: []
  keydown: [e: KeyboardEvent]
  refocus: []
  edit: [bookmark: Bookmark, el?: HTMLElement]
  open: [bookmark: Bookmark]
  'copy-url': [bookmark: Bookmark]
  remove: [bookmark: Bookmark]
  contextmenu: [e: MouseEvent, bookmark: Bookmark]
  reorder: [payload: { fromId: string; toId: string }]
  locate: [bookmark: Bookmark]
}>()

const localSearchInputComponentRef = ref<{ $el: HTMLElement } | null>(null)

const localSearchInputRef = computed(() => {
  const el = localSearchInputComponentRef.value?.$el
  if (el instanceof HTMLInputElement) return el
  return el?.querySelector('input') || null as HTMLInputElement | null
})

const focus = () => {
  const inputEl = localSearchInputRef.value
  if (inputEl && typeof inputEl.focus === 'function') {
    inputEl.focus()
  }
}

const handleClose = () => emit('close')
const handleKeydown = (e: KeyboardEvent) => emit('keydown', e)
const handleRefocus = () => emit('refocus')

// 搜索视图模式：列表 / 网格（独立持久化）
const searchViewMode = ref<'list' | 'grid'>(settingsStore.searchViewMode)
let searchViewModePersistTimer: ReturnType<typeof setTimeout> | null = null
watch(searchViewMode, (mode) => {
  if (searchViewModePersistTimer) clearTimeout(searchViewModePersistTimer)
  searchViewModePersistTimer = setTimeout(() => {
    if (settingsStore.searchViewMode !== mode) {
      settingsStore.setSearchViewMode(mode)
    }
  }, 0)
})

// 选中的书签（用于预览侧栏）
const selectedBookmark = computed(() => {
  if (props.selectedIndex < 0 || props.selectedIndex >= props.activeBookmarks.length) return null
  return props.activeBookmarks[props.selectedIndex]
})

// 列表视图交互
const handleListSelect = (index: number) => {
  emit('update:selectedIndex', index)
}

const handleListOpen = (bookmark: Bookmark) => {
  emit('open', bookmark)
}

const handleListRightClick = (e: MouseEvent, bookmark: Bookmark) => {
  e.preventDefault()
  emit('copy-url', bookmark)
}

const handleIconClick = (bookmark: Bookmark) => {
  emit('copy-url', bookmark)
}

const overlayHintText = '按下 Tab 退出搜索模式'

const emptyStateTitle = computed(() => {
  if (props.storeSearch) return '未找到匹配结果'
  return props.enableSubInput ? '在上方搜索框输入关键字' : '输入关键字开始搜索'
})

const emptyStateIconClass = computed(() => {
  if (props.storeSearch) return 'i-ph-textbox-thin'
  return 'i-ph-magnifying-glass-thin'
})

// 搜索结果数量文本
const resultCountText = computed(() => {
  const count = props.activeBookmarks.length
  if (count === 0) return ''
  return `共 ${count} 条结果`
})

defineExpose({ focus, localSearchInputRef })

onUnmounted(() => {
  if (searchViewModePersistTimer) {
    clearTimeout(searchViewModePersistTimer)
    searchViewModePersistTimer = null
  }
})
</script>

<template>
  <Transition name="fade">
    <section
      v-if="open"
      class="search-overlay fixed inset-0 z-[2000] backdrop-blur-md overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="shrink-0 px-5 py-3.5 flex items-center gap-3 border-b border-border/20">
        <Button variant="ghost" size="icon" class="h-9 w-9 shrink-0" @click="handleClose">
          <span class="i-ph-arrow-left-thin text-lg" />
        </Button>

        <!-- 非 uTools：显示搜索输入框 -->
        <template v-if="!isUTools">
          <Input
            :model-value="searchValue"
            ref="localSearchInputComponentRef"
            @update:model-value="emit('update:searchValue', $event as string)"
            @keydown="handleKeydown"
            placeholder="输入关键字搜索书签..."
            class="flex-1 h-10 text-sm bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl"
          />
        </template>

        <!-- uTools：显示提示文字 -->
        <template v-else>
          <div
            class="flex-1 flex items-center gap-2 h-10 px-4 rounded-xl bg-muted/30 text-sm text-muted-foreground"
          >
            <span class="i-ph-magnifying-glass-thin text-muted-foreground/50" />
            <span class="truncate">{{ storeSearch || overlayHintText }}</span>
          </div>
        </template>

        <!-- 结果计数 -->
        <span v-if="resultCountText" class="text-xs text-muted-foreground/60 shrink-0 hidden sm:block">
          {{ resultCountText }}
        </span>

        <!-- 视图切换 -->
        <div class="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5 shrink-0">
          <button
            class="h-8 w-8 flex items-center justify-center rounded-md text-xs transition-colors"
            :class="searchViewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="searchViewMode = 'list'"
          >
            <span class="i-ph-list-thin text-base" />
          </button>
          <button
            class="h-8 w-8 flex items-center justify-center rounded-md text-xs transition-colors"
            :class="searchViewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="searchViewMode = 'grid'"
          >
            <span class="i-ph-squares-four-thin text-base" />
          </button>
        </div>
      </div>

      <!-- Content Area -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <!-- Empty State -->
        <div
          v-if="!storeSearch"
          class="h-full flex flex-col items-center justify-center text-sm text-muted-foreground"
        >
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/35 text-foreground/55">
            <span :class="[emptyStateIconClass, 'text-4xl']" />
          </div>
          <div class="text-base font-medium text-foreground/60 mb-2">{{ emptyStateTitle }}</div>
          <SearchHintLine
            :enable-sub-input="enableSubInput"
            :search-auto-exit-text="searchAutoExitText"
          />
        </div>

        <!-- No Results -->
        <div
          v-else-if="activeBookmarks.length === 0"
          class="h-full flex flex-col items-center justify-center text-sm text-muted-foreground"
        >
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/35 text-foreground/55">
            <span :class="[emptyStateIconClass, 'text-4xl']" />
          </div>
          <div class="text-base font-medium text-foreground/60 mb-2">{{ emptyStateTitle }}</div>
          <div class="text-[13px] text-muted-foreground">
            <SearchHintLine
              :enable-sub-input="enableSubInput"
              :search-auto-exit-text="searchAutoExitText"
            />
          </div>
        </div>

        <!-- List View -->
        <div
          v-else-if="searchViewMode === 'list'"
          class="h-full flex"
        >
          <div class="flex-1 min-w-0 overflow-y-auto px-4 py-2">
            <BookmarksList
              :bookmarks="activeBookmarks"
              :selected-index="selectedIndex"
              :is-trash-active="false"
              :show-command-hints="showCmdHints"
              :hint-key-by-id="hintKeyById"
              :readonly="true"
              :clickable-icon="true"
              @select="handleListSelect"
              @open="handleListOpen"
              @contextmenu="handleListRightClick"
              @icon-click="handleIconClick"
              @locate="emit('locate', $event)"
            />
          </div>
          <!-- Preview Sidebar -->
          <BookmarkPreview
            :bookmark="selectedBookmark"
            :is-trash-active="false"
            @open="emit('open', $event)"
            @edit="emit('edit', $event)"
            @remove="emit('remove', $event)"
            @copy-url="emit('copy-url', $event)"
            @locate="emit('locate', $event)"
          />
        </div>

        <!-- Grid View -->
        <div
          v-else
          class="h-full overflow-y-auto px-5 py-3"
        >
          <BookmarksGrid
            :bookmarks="activeBookmarks"
            :selected-index="selectedIndex"
            :is-trash-active="false"
            :columns="gridColumns"
            :set-grid-ref="setGridRef"
            :hide-add-card="true"
            :show-command-hints="showCmdHints"
            :hint-key-by-id="hintKeyById"
            :readonly="true"
            :show-edit="false"
            :show-delete="false"
            :show-locate="true"
            selection-variant="search"
            @edit="(b, el) => emit('edit', b, el)"
            @open="emit('open', $event)"
            @contextmenu="(e, b) => emit('contextmenu', e, b)"
            @reorder="emit('reorder', $event)"
            @locate="emit('locate', $event)"
          />
        </div>
      </div>

      <!-- Footer hint -->
      <div class="shrink-0 px-5 py-2 border-t border-border/20 flex items-center justify-between text-[11px] text-muted-foreground/50">
        <span>{{ searchAutoExitText }}</span>
        <span class="hidden sm:inline">Tab 退出 · 双击打开 · 右键复制</span>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.search-overlay {
  background-color: hsl(var(--background) / 0.96);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
