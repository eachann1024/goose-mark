<script setup lang="ts">
import { computed } from 'vue'
import type { IconSource } from '@/types/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'

const props = defineProps<{
  icon?: IconSource | null
  fallbackText?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom'
  customSizeClass?: string
  loading?: boolean
  border?: boolean
}>()

const iconUrl = computed(() => iconToDisplayUrl(props.icon ?? undefined))

const sizeClasses = {
  sm: 'w-6 h-6 rounded-md',
  md: 'w-10 h-10 rounded-lg',
  lg: 'w-12 h-12 rounded-lg',
  xl: 'w-24 h-24 rounded-2xl',
  custom: ''
}

const currentSizeClass = computed(() => props.customSizeClass || sizeClasses[props.size || 'md'])

const containerStyle = computed(() => {
  if (props.icon?.bgColor) return { backgroundColor: props.icon.bgColor }
  return { backgroundColor: 'transparent' }
})

const isDarkBackground = computed(() => {
  // 针对透明背景的图片图标，在深色模式下添加白色背景以便看清黑色 Logo
  return !props.icon?.bgColor && props.icon?.type && props.icon.type !== 'text'
})

const letters = computed(() => {
  if (props.icon?.type === 'text') return props.icon.value.slice(0, 4)
  const base = (props.fallbackText || '').trim()
  return (base || '•').slice(0, 4).toUpperCase()
})
</script>

<template>
  <div 
    class="flex items-center justify-center overflow-hidden transition-colors"
    :class="[
      currentSizeClass,
      { 'border border-border': border !== false },
      { 'dark:bg-white': isDarkBackground }
    ]"
    :style="containerStyle"
  >
    <div v-if="loading" class="w-1/2 h-1/2 border-2 border-primary/60 border-t-transparent rounded-full animate-spin" />
    <template v-else>
      <Image 
        v-if="iconUrl" 
        :src="iconUrl" 
        class="w-4/5 h-4/5 object-contain" 
      />
      <span 
        v-else 
        class="font-bold text-center px-1"
        :class="[
          size === 'xl' ? 'text-4xl' : 'text-[10px]',
          icon?.type === 'text' && icon.bgColor ? 'text-white' : 'text-foreground'
        ]"
      >{{ letters }}</span>
    </template>
  </div>
</template>
