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
        'rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground shadow-sm',
        props.class
      )
    "
  >
    <div class="mb-1.5 flex items-center gap-2 font-medium text-foreground">
      <span :class="cn('shrink-0 text-lg text-primary', iconClass)" />
      <span>{{ title }}</span>
    </div>
    <p class="leading-relaxed">{{ description }}</p>
  </div>
</template>

