<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import SearchHintLine from '@/components/bookmarks/SearchHintLine.vue'

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
  close: []
  keydown: [e: KeyboardEvent]
  refocus: []
  edit: [bookmark: Bookmark, el?: HTMLElement]
  open: [bookmark: Bookmark]
  contextmenu: [e: MouseEvent, bookmark: Bookmark]
  reorder: [payload: { fromId: string; toId: string }]
  locate: [bookmark: Bookmark]
}>()

const localSearchInputComponentRef = ref<{ $el: HTMLElement } | null>(null)

// 依然提供 ref，供 useSearch 使用
const localSearchInputRef = computed(() => {
  const el = localSearchInputComponentRef.value?.$el
  if (el instanceof HTMLInputElement) return el
  return el?.querySelector('input') || null as HTMLInputElement | null
})

// 提供聚焦方法给父组件调用
const focus = () => {
  const inputEl = localSearchInputRef.value
  if (inputEl && typeof inputEl.focus === 'function') {
    inputEl.focus()
  }
}

const handleClose = () => emit('close')
const handleKeydown = (e: KeyboardEvent) => emit('keydown', e)
const handleRefocus = () => emit('refocus')
const overlayHintText = '按下 Tab 退出搜索模式'

const emptyStateTitle = computed(() => {
  if (props.storeSearch) return '未找到匹配结果'
  return props.enableSubInput ? '在上方搜索框输入关键字' : '输入关键字开始搜索'
})

const emptyStateIconClass = computed(() => {
  if (props.storeSearch) return 'i-mdi-text-search'
  return 'i-mdi-magnify'
})

defineExpose({ focus, localSearchInputRef }) // 保留 localSearchInputRef 以防万一，但主要推荐使用 focus
</script>

<template>
  <Transition name="fade">
    <section
      v-if="open"
      class="search-overlay fixed inset-0 z-[2000] backdrop-blur-md px-6 py-8 overflow-y-auto"
    >
      <div class="max-w-5xl mx-auto space-y-4">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" class="h-11 w-11" @click="handleClose">
            <span class="i-mdi-arrow-left text-xl" />
          </Button>
          <template v-if="isUTools">
            <button
              type="button"
              class="flex h-12 flex-1 items-center rounded-2xl bg-muted/35 px-4 text-left text-base text-muted-foreground transition-colors hover:bg-muted/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              @mousedown.prevent="handleRefocus"
              @click.prevent="handleRefocus"
              @keydown.enter.prevent="handleRefocus"
              @keydown.space.prevent="handleRefocus"
            >
              <span class="truncate">{{ overlayHintText }}</span>
            </button>
          </template>
          <template v-else>
            <Input
              :model-value="searchValue"
              ref="localSearchInputComponentRef"
              @update:model-value="emit('update:searchValue', $event as string)"
              @keydown="handleKeydown"
              placeholder="输入关键字搜索书签..."
              class="flex-1 h-12 text-base bg-muted/50 border-border focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </template>
        </div>
        <div
          v-if="!storeSearch"
          class="py-10 text-center text-sm text-muted-foreground"
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
        <div
          v-else-if="activeBookmarks.length === 0"
          class="py-10 text-center text-sm text-muted-foreground"
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
        <BookmarksGrid
          v-else
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
    </section>
  </Transition>
</template>

<style scoped>
.search-overlay {
  background-color: hsl(var(--background) / 0.95);
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
