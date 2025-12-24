<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'

const props = defineProps<{
  bookmark: Bookmark
  query: string
}>()

const iconUrl = computed(() => iconToDisplayUrl(props.bookmark.icon))
const letters = computed(() => {
  if (props.bookmark.icon?.type === 'text') return props.bookmark.icon.value.slice(0, 4)
  const title = props.bookmark.title.trim()
  return (title || '•').slice(0, 4).toUpperCase()
})

const iconBgStyle = computed(() => {
  const icon = props.bookmark.icon
  if (icon?.bgColor) return { backgroundColor: icon.bgColor }
  return { backgroundColor: 'transparent' }
})

const getTemplateLabel = (url: string) => {
  const label = (url.match(/{([^}]+)}/)?.[1] ?? '').trim()
  return label || '搜索内容'
}
</script>

<template>
  <div class="h-screen flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in zoom-in-95 duration-200">
    <!-- Icon -->
    <div 
      class="w-24 h-24 rounded-2xl border border-border flex items-center justify-center overflow-hidden shadow-2xl bg-card"
      :style="iconBgStyle"
    >
      <Image 
        v-if="iconUrl" 
        :src="iconUrl" 
        class="w-4/5 h-4/5 object-contain" 
      />
      <span 
        v-else 
        class="text-4xl font-bold"
        :class="bookmark.icon?.type === 'text' && bookmark.icon.bgColor ? 'text-white' : 'text-foreground'"
      >{{ letters }}</span>
    </div>

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
