<script setup lang="ts">
import { computed } from 'vue'
import type { Bookmark } from '@/types/bookmark'
import BookmarkCard from '@/components/BookmarkCard.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus } from 'lucide-vue-next'
import draggable from 'vuedraggable'

const props = defineProps<{
  bookmarks: Bookmark[]
  selectedIndex: number
  isTrashActive: boolean
  setGridRef?: (el: HTMLElement | null) => void
  columns?: number
  hideAddCard?: boolean
  showCommandHints?: boolean
  hintKeyById?: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'remove', bookmark: Bookmark): void
  (e: 'edit', bookmark: Bookmark, el?: HTMLElement): void
  (e: 'open', bookmark: Bookmark): void
  (e: 'contextmenu', event: MouseEvent, bookmark: Bookmark): void
  (e: 'add', el?: HTMLElement): void
  (e: 'emptyTrash'): void
  (e: 'reorder', payload: { fromId: string; toId: string }): void
  (e: 'update:bookmarks', bookmarks: Bookmark[]): void
}>()

// 本地书签列表，用于 v-model
const localBookmarks = computed({
  get: () => props.bookmarks,
  set: (val) => emit('update:bookmarks', val)
})

// vuedraggable change 事件处理
const handleDragChange = (evt: { moved?: { oldIndex: number; newIndex: number } }) => {
  if (!evt.moved) return
  const { oldIndex, newIndex } = evt.moved
  if (oldIndex === newIndex) return
  
  const fromId = props.bookmarks[oldIndex]?.id
  const toId = props.bookmarks[newIndex]?.id
  if (fromId && toId) {
    emit('reorder', { fromId, toId })
  }
}

const gridStyle = computed(() => {
  const cols = props.columns && props.columns >= 2 && props.columns <= 5 ? props.columns : 4
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
})
</script>

<template>
  <section
    :ref="setGridRef"
    class="flex-1"
  >
    <draggable
      v-model="localBookmarks"
      item-key="id"
      :animation="150"
      ghost-class="bookmark-drag-ghost"
      chosen-class="bookmark-drag-chosen"
      drag-class="bookmark-drag-active"
      class="grid gap-4 content-start"
      :style="gridStyle"
      @change="handleDragChange"
    >
      <template #item="{ element: bookmark, index }">
        <div
          :data-bookmark-index="index"
          class="bookmark-card-wrapper"
        >
          <BookmarkCard
            :bookmark="bookmark"
            :selected="selectedIndex === index"
            :show-hint="showCommandHints"
            :hint-key="hintKeyById?.[bookmark.id]"
            @remove="emit('remove', bookmark)"
            @edit="(b, el) => emit('edit', b, el)"
            @open="emit('open', bookmark)"
            @contextmenu="(e) => emit('contextmenu', e, bookmark)"
          />
        </div>
      </template>
      <template #footer>
        <div v-if="!isTrashActive && !hideAddCard">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                class="group relative flex flex-row items-center justify-center gap-2 rounded-xl border-dashed py-2.5 text-muted-foreground hover:border-primary hover:text-primary hover:bg-muted/30 transition-colors cursor-pointer min-h-[60px] w-full"
                @click="(e: MouseEvent) => emit('add', e.currentTarget as HTMLElement)"
              >
                <div class="group-hover:scale-110 transition-transform">
                  <Plus class="w-7 h-7" />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>添加书签</p></TooltipContent>
          </Tooltip>
        </div>
      </template>
    </draggable>

    <div v-if="isTrashActive && bookmarks.length > 0" class="flex justify-center py-8">
      <Button variant="destructive" @click="emit('emptyTrash')">
        <span class="i-mdi-delete-empty mr-2" />
        清空回收站
      </Button>
    </div>
  </section>
</template>

<style scoped>
/* 拖拽占位 Ghost */
.bookmark-drag-ghost {
  opacity: 0.4;
  background: hsl(var(--primary) / 0.08);
  border-radius: 12px;
  border: 2px dashed hsl(var(--primary) / 0.4) !important;
}

/* 被选中的卡片 */
.bookmark-drag-chosen {
  opacity: 1;
  transform: scale(1.03) rotate(1deg);
  box-shadow: 0 12px 40px hsl(var(--primary) / 0.2);
  z-index: 100;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

/* 拖拽中的卡片 */
.bookmark-drag-active {
  cursor: grabbing !important;
  opacity: 0.95;
}

/* 卡片容器动画 */
.bookmark-card-wrapper {
  transition: transform 0.2s ease;
}
</style>

