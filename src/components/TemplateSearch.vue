<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'
import { getTemplateLabel } from '@/lib/utils'

const props = defineProps<{
  bookmark: Bookmark
  query: string
}>()

const emit = defineEmits<{
  (e: 'update:query', value: string): void
  (e: 'submit'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})
</script>

<template>
  <div class="h-screen flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in zoom-in-95 duration-200">
    <input
      ref="inputRef"
      :value="query"
      class="sr-only"
      data-template-query-input
      autofocus
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="emit('submit')"
    />
    <!-- Icon -->
    <BookmarkIcon 
      :icon="bookmark.icon"
      :fallback-text="bookmark.title"
      size="xl"
      class="shadow-2xl bg-card"
    />

    <!-- Title & Desc -->
    <div class="space-y-2">
      <h2 class="text-3xl font-bold tracking-tight text-foreground">{{ bookmark.title }}</h2>
    </div>

    <!-- Live Preview -->
    <div class="w-full max-w-lg">
      <div class="relative min-h-[3rem] flex items-center justify-center">
        <div v-if="query" class="text-2xl font-medium text-primary break-all">
          {{ query }}<span class="animate-pulse inline-block w-[2px] h-6 bg-primary ml-1 align-middle"></span>
        </div>
        <div v-else class="text-2xl text-muted-foreground/50 italic">
          输入关键词...
        </div>
      </div>
      <p class="mt-8 text-sm text-muted-foreground">
        按 <kbd class="px-2 py-1 bg-muted rounded border border-border text-xs font-sans mx-1">Enter</kbd> 打开链接
      </p>
    </div>
  </div>
</template>
