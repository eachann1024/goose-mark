<script setup lang="ts">
import { useTextOverflow } from '@/composables/useTextOverflow'
import { useUIManager } from '@/composables/useUIManager'

const props = defineProps<{
  sub: { id: string; name: string; shareId?: string; sourceShareId?: string; lastSyncedAt?: number; bookmarkIds?: string[] }
  isActive: boolean
  isDragOver: boolean
  hasUpdate: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'dragover', event: DragEvent): void
  (e: 'dragleave', event: DragEvent): void
  (e: 'drop', event: DragEvent): void
}>()

const { isTooltipEnabled } = useUIManager()
const { overflowMap, observeOverflow } = useTextOverflow()
const store = useBookmarkStore()

const nameRef = ref<HTMLElement | null>(null)

// 监听名称变化，重新触发检查
watch(() => props.sub.name, () => {
  if (nameRef.value) {
    observeOverflow('self', nameRef.value)
  }
})

onMounted(() => {
  nextTick(() => {
    if (nameRef.value) {
      observeOverflow('self', nameRef.value)
    }
  })
})

const isTruncated = computed(() => overflowMap.value['self'] ?? false)

// 计算子分组中的有效书签数量
const hasValidBookmarks = computed(() => {
  if (!props.sub.bookmarkIds || props.sub.bookmarkIds.length === 0) return false
  return props.sub.bookmarkIds.some(id => {
    const bookmark = store.bookmarks.find(b => b.id === id)
    return bookmark && !bookmark.isDeleted
  })
})
</script>

<template>
  <Tooltip :disabled="!isTooltipEnabled || !isTruncated">
    <TooltipTrigger as-child>
      <button
        type="button"
        class="flex items-center justify-start w-full px-3 py-2 rounded-md text-sm transition-all text-left relative min-w-0 overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        :class="[
          isActive
            ? 'text-primary font-medium border-l-2 border-primary bg-primary/5 hover:bg-primary/15'
            : 'text-muted-foreground hover:text-foreground hover:bg-primary/5',
          sub.shareId && 'border border-dashed border-blue-500/50',
          sub.sourceShareId && 'border border-dashed border-green-500/50',
          isDragOver && 'ring-2 ring-primary ring-offset-1 bg-primary/10'
        ]"
        @click="emit('select', sub.id)"
        @dragover="emit('dragover', $event)"
        @dragleave="emit('dragleave', $event)"
        @drop="emit('drop', $event)"
      >
        <div ref="nameRef" class="flex-1 min-w-0 truncate block">
          {{ sub.name }}
        </div>
        <!-- 分享图标：只在有有效书签时显示 -->
        <span v-if="sub.shareId && hasValidBookmarks" class="i-mdi-share-variant text-xs text-blue-500/60 shrink-0 ml-1" title="我分享的" />
        <!-- 导入来源图标 -->
        <div v-if="sub.sourceShareId" class="shrink-0 relative flex items-center ml-1">
           <span class="i-mdi-cloud-download-outline text-xs text-green-500/60" title="已导入" />
           <span v-if="hasUpdate" class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        </div>
      </button>
    </TooltipTrigger>
    <TooltipContent side="right" :side-offset="8" align="center">
      <p>{{ sub.name }}</p>
    </TooltipContent>
  </Tooltip>
</template>
