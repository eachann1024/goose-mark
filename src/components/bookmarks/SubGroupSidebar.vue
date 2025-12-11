<script setup lang="ts">
const props = defineProps<{
  show: boolean
  activeSubGroups: Array<{ id: string; name: string }>
  activeSubGroupId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()
</script>

<template>
  <aside
    v-if="show"
    class="shrink-0 w-32 flex flex-col gap-1"
  >
    <button
      v-for="sub in activeSubGroups"
      :key="sub.id"
      class="text-left px-3 py-2 rounded-md text-sm transition-all"
      :class="{
        'text-primary font-medium border-l-2 border-primary bg-primary/5': activeSubGroupId === sub.id,
        'text-muted-foreground hover:text-foreground hover:bg-muted/50': activeSubGroupId !== sub.id
      }"
      @click="emit('select', sub.id)"
    >
      {{ sub.name }}
    </button>
  </aside>
</template>

