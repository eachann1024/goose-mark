<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkCard from '@/components/BookmarkCard.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus } from 'lucide-vue-next'

const props = defineProps<{
  bookmarks: Bookmark[]
  selectedIndex: number
  isTrashActive: boolean
  setGridRef?: (el: HTMLElement | null) => void
}>()

const emit = defineEmits<{
  (e: 'remove', bookmark: Bookmark): void
  (e: 'edit', bookmark: Bookmark): void
  (e: 'contextmenu', event: MouseEvent, bookmark: Bookmark): void
  (e: 'add'): void
  (e: 'emptyTrash'): void
  (e: 'reorder', payload: { fromId: string; toId: string }): void
}>()

const draggingId = ref<string | null>(null)

const onDragStart = (e: DragEvent, id: string) => {
  draggingId.value = id
  e.dataTransfer?.setData('text/plain', id)
}

const onDrop = (e: DragEvent, targetId: string) => {
  const fromId = e.dataTransfer?.getData('text/plain') || draggingId.value
  if (fromId && fromId !== targetId) {
    emit('reorder', { fromId, toId: targetId })
  }
  draggingId.value = null
}
</script>

<template>
  <section
    :ref="setGridRef"
    class="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start"
  >
    <div
      v-for="(bookmark, index) in bookmarks"
      :key="bookmark.id"
      draggable="true"
      @dragstart.stop="onDragStart($event, bookmark.id)"
      @dragover.prevent
      @drop.prevent="onDrop($event, bookmark.id)"
    >
      <BookmarkCard
        :bookmark="bookmark"
        :selected="selectedIndex === index"
        @remove="emit('remove', bookmark)"
        @edit="emit('edit', bookmark)"
        @contextmenu="(e) => emit('contextmenu', e, bookmark)"
      />
    </div>

    <Tooltip v-if="!isTrashActive">
      <TooltipTrigger as-child>
        <Button
          variant="outline"
          class="group relative flex flex-row items-center justify-center gap-2 rounded-xl border-dashed py-3 text-muted-foreground hover:border-primary hover:text-primary hover:bg-muted/30 transition-all cursor-pointer h-full min-h-[64px] w-full"
          @click="emit('add')"
        >
          <div class="group-hover:scale-110 transition-transform">
            <Plus class="w-7 h-7" />
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent><p>添加书签</p></TooltipContent>
    </Tooltip>

    <div v-if="isTrashActive && bookmarks.length > 0" class="col-span-full flex justify-center py-8">
      <Button variant="destructive" @click="emit('emptyTrash')">
        <span class="i-mdi-delete-empty mr-2" />
        清空回收站
      </Button>
    </div>
  </section>
</template>
