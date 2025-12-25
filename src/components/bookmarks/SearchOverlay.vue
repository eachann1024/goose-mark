<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'

const props = defineProps<{
  open: boolean
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

defineExpose({ focus, localSearchInputRef }) // 保留 localSearchInputRef 以防万一，但主要推荐使用 focus
</script>

<template>
  <Transition name="fade">
    <section
      v-if="open"
      class="fixed inset-0 z-[2000] bg-background/95 backdrop-blur-md px-6 py-8 overflow-y-auto"
    >
      <div class="max-w-5xl mx-auto space-y-4">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" class="h-11 w-11" @click="handleClose">
            <span class="i-mdi-arrow-left text-xl" />
          </Button>
          <template v-if="enableSubInput">
            <div class="flex-1 h-12 rounded-xl border border-border bg-muted/50 px-4 flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <span class="i-mdi-magnify text-base" />
                <span>请在 uTools 输入框输入关键字进行搜索</span>
              </div>
              <div v-if="storeSearch" class="text-xs text-muted-foreground flex items-center gap-1">
                <span class="i-mdi-ray-start-vertex" />
                <span>当前：{{ storeSearch }}</span>
              </div>
            </div>
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
          <Button variant="secondary" class="h-11 px-4" @click="handleClose">退出</Button>
        </div>
        <div
          v-if="!storeSearch"
          class="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        >
          <div>输入关键字开始搜索</div>
          <div class="flex items-center gap-2 justify-center">
            <span class="i-mdi-information-outline" />
            <span>按 ESC 退出；按 ↑ ↓ ← → 选择，回车打开；{{ searchAutoExitText }}</span>
          </div>
        </div>
        <div
          v-else-if="activeBookmarks.length === 0"
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
          :columns="gridColumns"
          :set-grid-ref="setGridRef"
          :hide-add-card="true"
          :show-command-hints="showCmdHints"
          :hint-key-by-id="hintKeyById"
          :readonly="true"
          :show-edit="false"
          :show-delete="false"
          :show-locate="true"
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
