<script setup lang="ts">
import { useTextOverflow } from '@/composables/useTextOverflow'
import { useUIManager } from '@/composables/useUIManager'

const props = defineProps<{
  sub: { id: string; name: string; bookmarkIds?: string[] }
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

const refreshOverflow = () => {
  if (!nameRef.value) return
  observeOverflow('self', nameRef.value)
}

watch(() => props.sub.name, () => {
  nextTick(refreshOverflow)
})

onMounted(() => {
  nextTick(refreshOverflow)
})

const isTruncated = computed(() => overflowMap.value['self'] ?? false)

const stateClass = computed(() => ({
  'subgroup-btn--active': props.isActive,
  'subgroup-btn--idle': !props.isActive,
  'subgroup-btn--drag-over': props.isDragOver
}))

const handleSelect = (event: MouseEvent) => {
  emit('select', props.sub.id)
  const target = event.currentTarget as HTMLElement | null
  target?.blur?.()
}
</script>

<template>
  <Tooltip :disabled="!isTooltipEnabled || !isTruncated">
    <TooltipTrigger as-child>
      <button
        type="button"
        class="subgroup-btn flex items-center justify-start w-full px-3 py-2 rounded-md text-sm transition-none text-left relative min-w-0 overflow-hidden outline-none disabled:pointer-events-none disabled:opacity-50"
        :data-active="isActive ? 'true' : undefined"
        :class="stateClass"
        @pointerdown.prevent
        @mousedown.prevent
        @click="handleSelect"
        @dragover="emit('dragover', $event)"
        @dragleave="emit('dragleave', $event)"
        @drop="emit('drop', $event)"
      >
        <div ref="nameRef" class="flex-1 min-w-0 truncate block">
          {{ sub.name }}
        </div>
        <span v-if="hasUpdate" class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="right" :side-offset="8" align="center">
      <p>{{ sub.name }}</p>
    </TooltipContent>
  </Tooltip>
</template>

<style scoped>
.subgroup-btn {
  border-left: 2px solid transparent;
  color: hsl(var(--muted-foreground));
  background-color: transparent;
}

.subgroup-btn--idle:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.8);
}

.subgroup-btn--active {
  color: hsl(var(--foreground));
  font-weight: 500;
  border-left-color: hsl(var(--primary));
  background-color: hsl(var(--muted));
}

.dark .subgroup-btn--idle:hover {
  color: hsl(var(--accent-foreground));
  background-color: hsl(var(--accent));
}

.dark .subgroup-btn--active {
  color: hsl(var(--accent-foreground));
  background-color: hsl(var(--accent));
}

.subgroup-btn--drag-over {
  color: hsl(var(--foreground));
  background-color: hsl(var(--primary) / 0.1);
  box-shadow: inset 0 0 0 2px hsl(var(--primary) / 0.55);
}

.dark .subgroup-btn--drag-over {
  color: hsl(var(--primary));
}

.subgroup-btn:focus,
.subgroup-btn:focus-visible,
.subgroup-btn:focus-within,
.subgroup-btn:active {
  outline: none !important;
  box-shadow: none !important;
  --tw-ring-offset-shadow: 0 0 #0000 !important;
  --tw-ring-shadow: 0 0 #0000 !important;
  --tw-ring-color: transparent !important;
}
</style>
