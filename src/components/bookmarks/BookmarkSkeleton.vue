<script setup lang="ts">
const props = defineProps<{
  count?: number
  showHeaders?: boolean
}>()

const itemCount = computed(() => Math.max(1, Math.min(props.count || 6, 12)))
</script>

<template>
  <div class="flex flex-col gap-4 animate-pulse">
    <!-- Section header skeleton -->
    <template v-if="showHeaders">
      <div class="flex items-center gap-2 px-1 pt-2">
        <div class="h-5 w-24 rounded bg-muted/60" />
        <div class="flex-1 h-px bg-muted/40" />
      </div>
    </template>

    <!-- Bookmark item skeletons -->
    <div
      v-for="i in itemCount"
      :key="i"
      class="flex items-center gap-3 px-3 py-2.5 rounded-lg"
    >
      <!-- Icon skeleton -->
      <div class="shrink-0 w-8 h-8 rounded-lg bg-muted/60" />
      <!-- Text skeletons -->
      <div class="flex-1 flex flex-col gap-1.5 min-w-0">
        <div class="h-3.5 w-3/5 rounded bg-muted/60" />
        <div class="h-2.5 w-2/5 rounded bg-muted/40" />
      </div>
    </div>
  </div>
</template>
