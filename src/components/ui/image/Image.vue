<script setup lang="ts">
import { type HTMLAttributes, ref, computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
  class?: HTMLAttributes['class']
  fallback?: 'icon' | 'none'
}>()

const emit = defineEmits<{
  (e: 'error'): void
  (e: 'load'): void
}>()

const hasError = ref(false)
const hasLoaded = ref(false)

const handleError = () => {
  hasError.value = true
  emit('error')
}

const handleLoad = () => {
  hasLoaded.value = true
  emit('load')
}

const showSkeleton = computed(() => !hasError.value && !hasLoaded.value && !!props.src)
</script>

<template>
  <div
    :class="cn('relative overflow-hidden rounded-md bg-secondary', props.class)"
    :style="{
      width: typeof width === 'number' ? width + 'px' : width,
      height: typeof height === 'number' ? height + 'px' : height
    }"
  >
    <div v-if="showSkeleton" class="absolute inset-0 bg-muted animate-pulse" />
    <img
      v-if="!hasError && src"
      :src="src"
      :alt="alt"
      class="h-full w-full object-cover transition-all hover:scale-105"
      @error="handleError"
      @load="handleLoad"
    />
    <div v-else-if="props.fallback !== 'none'" class="flex h-full w-full items-center justify-center text-muted-foreground">
      <span class="i-mdi-image-off text-xl" />
    </div>
  </div>
</template>
