<script setup lang="ts">
import { useTextOverflow } from '@/composables/useTextOverflow'
import { useUIManager } from '@/composables/useUIManager'

const props = defineProps<{
  sub: { id: string; name: string; shareId?: string; sourceShareId?: string; lastSyncedAt?: number }
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
</script>

<template>
  <Tooltip :disabled="!isTooltipEnabled || !isTruncated">
    <TooltipTrigger as-child>
      <button
        type="button"
        class="flex items-center justify-start w-full px-3 py-2 rounded-md text-sm transition-all text-left relative min-w-0 overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-muted/50"
        :class="{
          'text-primary font-medium border-l-2 border-primary bg-primary/5': isActive,
          'text-muted-foreground hover:text-foreground': !isActive,
          'border border-dashed border-blue-500/50': sub.shareId,
          'border border-dashed border-green-500/50': sub.sourceShareId,
          'ring-2 ring-primary ring-offset-1 bg-primary/10': isDragOver
        }"
        @click="emit('select', sub.id)"
        @dragover="emit('dragover', $event)"
        @dragleave="emit('dragleave', $event)"
        @drop="emit('drop', $event)"
      >
        <div ref="nameRef" class="flex-1 min-w-0 truncate block">
          {{ sub.name }}
        </div>
        <!-- 分享图标 -->
        <span v-if="sub.shareId" class="i-mdi-share-variant text-xs text-blue-500/60 shrink-0 ml-1" title="我分享的" />
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
