<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Bookmark } from '@/types/bookmark'
import BookmarkCard from '@/components/BookmarkCard.vue'
import ResultToast from '@/components/ResultToast.vue'
import { notify } from '@/lib/notify'
import { Plus } from 'lucide-vue-next'
import draggable from 'vuedraggable'

// 检测环境：uTools vs Web
const isUTools = typeof window !== 'undefined' && !!(window as any).utools

// 添加按钮高度：Web 66px, uTools 60px
const addButtonHeight = computed(() => isUTools ? '60px' : '66px')

const props = defineProps<{
  bookmarks: Bookmark[]
  selectedIndex: number
  isTrashActive: boolean
  setGridRef?: (el: HTMLElement | null) => void
  columns?: number
  hideAddCard?: boolean
  showCommandHints?: boolean
  hintKeyById?: Record<string, string>
  showEdit?: boolean
  showDelete?: boolean
  showLocate?: boolean
  highlightedId?: string | null
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', bookmark: Bookmark): void
  (e: 'edit', bookmark: Bookmark, el?: HTMLElement): void
  (e: 'open', bookmark: Bookmark): void
  (e: 'contextmenu', event: MouseEvent, bookmark: Bookmark): void
  (e: 'locate', bookmark: Bookmark): void
  (e: 'add', el?: HTMLElement): void
  (e: 'emptyTrash'): void
  (e: 'reorder', payload: { fromId: string; toId: string }): void
  (e: 'update:bookmarks', bookmarks: Bookmark[]): void
}>()

// 记录一次拖拽开始时的顺序，用于稳定计算 fromId/toId
let dragStartOrderIds: string[] = []

// 本地书签列表，用于 v-model
const localBookmarks = computed({
  get: () => props.bookmarks,
  set: (val) => emit('update:bookmarks', val)
})

// vuedraggable change 事件处理
const handleDragChange = (evt: { moved?: { oldIndex: number; newIndex: number } }) => {
  if (!evt.moved || props.readonly) return
  const { oldIndex, newIndex } = evt.moved
  if (oldIndex === newIndex) return

  const fromId = dragStartOrderIds[oldIndex]
  const toId = dragStartOrderIds[newIndex]
  if (fromId && toId) {
    emit('reorder', { fromId, toId })
  }

  dragStartOrderIds = []
}

const gridStyle = computed(() => {
  const cols = props.columns && props.columns >= 2 && props.columns <= 5 ? props.columns : 4
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
})

// 拖拽开始时设置书签 ID
const handleDragStart = (evt: any) => {
  dragStartOrderIds = props.bookmarks.map(item => item.id)

  // vuedraggable 的 @start 事件直接传递 Sortable 事件对象
  const item = evt.item as HTMLElement
  const originalEvent = evt.originalEvent as DragEvent | undefined

  if (!item || !originalEvent?.dataTransfer) {
    console.warn('[BookmarksGrid] Drag start: missing item or dataTransfer')
    return
  }

  const index = item.dataset.bookmarkIndex
  if (index !== undefined) {
    const bookmark = props.bookmarks[parseInt(index)]
    if (bookmark) {
      originalEvent.dataTransfer.setData('text/bookmark-id', bookmark.id)
      originalEvent.dataTransfer.effectAllowed = 'move'
      console.log('[BookmarksGrid] Drag start:', bookmark.id, bookmark.title)
    }
  }
}

// 原生 dragstart 事件处理（作为备用方案）
const handleNativeDragStart = (e: DragEvent, bookmark: Bookmark) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/bookmark-id', bookmark.id)
    e.dataTransfer.effectAllowed = 'move'
    console.log('[BookmarksGrid] Native drag start:', bookmark.id, bookmark.title)
  }
}

const emptyTrashConfirmOpen = ref(false)
const emptyToastOpen = ref(false)
const emptyToastTitle = ref('')
const emptyToastDesc = ref<string | undefined>(undefined)
const confirmEmptyTrashButtonRef = ref<HTMLElement | null>(null)
let emptyToastUrls = ''

const copyText = async (text: string) => {
  try {
    if (!navigator.clipboard) {
      notify('当前环境不支持剪贴板复制')
      return
    }
    await navigator.clipboard.writeText(text)
    notify('已复制到剪贴板')
  } catch {
    notify('复制失败，请检查权限后重试')
  }
}

const requestEmptyTrash = () => {
  emptyTrashConfirmOpen.value = true
}

// 当清空回收站确认对话框打开时，聚焦到确认清空按钮
watch(emptyTrashConfirmOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      // 查找确认清空按钮并聚焦
      const button = confirmEmptyTrashButtonRef.value as HTMLElement | null
      if (button && typeof button.focus === 'function') {
        button.focus()
      } else {
        // 备用方案：通过查询选择器查找
        const dialog = document.querySelector('[role="dialog"]')
        const confirmBtn = dialog?.querySelector('button[class*="destructive"]') as HTMLElement | null
        if (confirmBtn && typeof confirmBtn.focus === 'function') {
          confirmBtn.focus()
        }
      }
    })
  }
})

const confirmEmptyTrash = () => {
  emptyToastUrls = props.bookmarks.map(b => b.url).filter(Boolean).join('\n')
  const count = props.bookmarks.length
  emit('emptyTrash')
  emptyTrashConfirmOpen.value = false

  emptyToastTitle.value = '回收站已清空'
  emptyToastDesc.value = count > 0 ? `已永久删除 ${count} 条书签` : undefined
  emptyToastOpen.value = true
}

watch(() => props.highlightedId, (id) => {
  if (!id) return
  nextTick(() => {
    const el = document.querySelector(`[data-bookmark-id="${id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
})
</script>

<template>
  <section
    :ref="setGridRef"
    class="flex-1"
  >
    <!-- Header Slot for Onboarding Banner -->
    <slot name="header" />

    <draggable
      v-model="localBookmarks"
      item-key="id"
      :animation="150"
      :delay="10"
      :delay-on-touch-only="false"
      :touch-start-threshold="5"
      ghost-class="bookmark-drag-ghost"
      chosen-class="bookmark-drag-chosen"
      drag-class="bookmark-drag-active"
      class="grid gap-4 content-start pt-2"
      :style="gridStyle"
      :disabled="readonly"
      @change="handleDragChange"
      @start="handleDragStart"
    >
      <template #item="{ element: bookmark, index }">
        <div
          :data-bookmark-index="index"
          :data-bookmark-id="bookmark.id"
          class="bookmark-card-wrapper"
          @dragstart="(e) => handleNativeDragStart(e, bookmark)"
        >
          <BookmarkCard
            :bookmark="bookmark"
            :selected="selectedIndex === index"
            :show-hint="showCommandHints"
            :hint-key="hintKeyById?.[bookmark.id]"
            :readonly="readonly"
            :show-edit="showEdit"
            :show-delete="showDelete"
            :show-locate="showLocate"
            :highlighted="highlightedId === bookmark.id"
            :index="index"
            :grid-columns="columns"
            @remove="emit('remove', bookmark)"
            @edit="(b, el) => emit('edit', b, el)"
            @open="emit('open', bookmark)"
            @locate="emit('locate', bookmark)"
            @contextmenu="(e) => emit('contextmenu', e, bookmark)"
          />
        </div>
      </template>
      <template #footer>
        <div v-if="!isTrashActive && !hideAddCard && !readonly">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                class="group relative flex flex-row items-center justify-center gap-2 rounded-xl border-dashed py-3 px-4 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer w-full bg-transparent"
                :style="{ height: addButtonHeight }"
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
      <Button variant="destructive" @click="requestEmptyTrash">
        <span class="i-mdi-delete-empty mr-2" />
        清空回收站
      </Button>
    </div>

    <Dialog :open="emptyTrashConfirmOpen" @update:open="v => (emptyTrashConfirmOpen = v)">
      <DialogContent class="sm:max-w-md" @pointer-down-outside.prevent @interact-outside.prevent>
        <DialogHeader>
          <DialogTitle>清空回收站？</DialogTitle>
          <DialogDescription>此操作不可恢复，将永久删除回收站内 {{ bookmarks.length }} 条书签。</DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-3">
          <Button variant="ghost" @click="emptyTrashConfirmOpen = false">取消</Button>
          <Button ref="confirmEmptyTrashButtonRef" variant="destructive" @click="confirmEmptyTrash">确认清空</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ResultToast
      :open="emptyToastOpen"
      variant="success"
      :title="emptyToastTitle"
      :description="emptyToastDesc"
      :action-label="emptyToastUrls ? '复制URL列表' : undefined"
      @close="emptyToastOpen = false"
      @action="copyText(emptyToastUrls)"
    />
  </section>
</template>

<style scoped>
/* 拖拽占位 Ghost */
.bookmark-drag-ghost {
  opacity: 0.4;
  background: hsl(var(--primary) / 0.08);
  border-radius: var(--radius-xl);
  border: 2px dashed hsl(var(--primary) / 0.4) !important;
}

/* 被选中的卡片 */
.bookmark-drag-chosen {
  opacity: 1;
  transform: scale(1.03) rotate(1deg);
  filter: drop-shadow(0 12px 40px hsl(var(--primary) / 0.2));
  z-index: 100;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  border-radius: var(--radius-xl);
  background: transparent;
}

/* 拖拽中的卡片 */
.bookmark-drag-active {
  cursor: grabbing !important;
  opacity: 0.95;
  border-radius: var(--radius-xl);
  background: transparent;
}

/* 卡片容器动画 */
.bookmark-card-wrapper {
  transition: transform 0.2s ease;
}
</style>
