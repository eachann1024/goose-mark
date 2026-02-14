<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description: string
  icon?: string
  class?: string
}>()

const iconClass = computed(() => props.icon ?? 'i-mdi-information-outline')
</script>

<template>
  <div
    :class="
      cn(
        'rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm dark:bg-[#3A3C3E] dark:border-[#505357]',
        props.class
      )
    "
  >
    <div class="mb-1.5 flex items-center gap-2 font-medium text-foreground">
      <span :class="cn('shrink-0 text-lg text-primary', iconClass)" />
      <span>{{ title }}</span>
    </div>
    <p class="leading-relaxed whitespace-pre-line">{{ description }}</p>
  </div>
</template>

