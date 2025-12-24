<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'success' | 'info' | 'warning' | 'error'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  variant?: Variant
  icon?: string
  actionLabel?: string
}>()

const emit = defineEmits<{
  close: []
  action: []
}>()

const iconClass = computed(() => {
  if (props.icon) return props.icon
  const v = props.variant ?? 'info'
  if (v === 'success') return 'i-mdi-check-circle-outline text-primary'
  if (v === 'warning') return 'i-mdi-alert-outline text-yellow-500'
  if (v === 'error') return 'i-mdi-close-circle-outline text-destructive'
  return 'i-mdi-information-outline text-muted-foreground'
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-180 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-if="open"
        class="fixed top-20 right-4 z-[9999] w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-lg backdrop-blur-sm p-4"
      >
        <div class="flex gap-3" :class="description ? 'items-start' : 'items-center'">
          <span :class="[iconClass, 'text-lg shrink-0', description ? 'mt-0.5' : '']" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground leading-tight">{{ title }}</p>
            <p v-if="description" class="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{{ description }}</p>
          </div>
          <Button variant="ghost" size="icon" class="h-7 w-7" title="关闭" @click="emit('close')">
            <span class="i-mdi-close text-sm text-muted-foreground" />
          </Button>
        </div>

        <div v-if="actionLabel || $slots.action" class="mt-3 flex items-center justify-end gap-2">
          <slot name="action" />
          <Button v-if="actionLabel" size="sm" variant="outline" class="h-7 px-3 text-xs" @click="emit('action')">
            {{ actionLabel }}
          </Button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

