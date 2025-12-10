<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  x: number
  y: number
  isTrash?: boolean
}>()

const emit = defineEmits<{
  close: []
  action: [string]
}>()

const menu = ref<HTMLElement | null>(null)

const handleClickOutside = (e: MouseEvent) => {
  if (menu.value && !menu.value.contains(e.target as Node)) {
    emit('close')
  }
}

const handleAction = (action: string) => {
  emit('action', action)
  emit('close')
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleClickOutside)
  document.addEventListener('scroll', handleClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleClickOutside)
  document.removeEventListener('scroll', handleClickOutside, true)
})
</script>

<template>
  <div
    ref="menu"
    class="fixed z-[9999] min-w-[160px] bg-white/90 dark:bg-[#1a1c20]/90 backdrop-blur-md rounded-xl shadow-xl border border-white/10 p-1.5 flex flex-col gap-1 text-sm animate-fade-in"
    :style="{ top: `${y}px`, left: `${x}px` }"
    @click.stop
    @contextmenu.prevent
  >
    <template v-if="!isTrash">
      <button class="menu-item" @click="handleAction('open')">
        <span class="i-mdi-rocket-launch text-muted" />
        <span>网页快开</span>
      </button>
      
      <div class="h-px bg-white/10 my-0.5 mx-1" />
  
      <button class="menu-item" @click="handleAction('edit')">
        <span class="i-mdi-pencil-outline text-muted" />
        <span>编辑</span>
      </button>

      <div class="h-px bg-white/10 my-0.5 mx-1" />
      
      <button class="menu-item text-red-500 hover:!text-red-600 hover:!bg-red-500/10" @click="handleAction('remove')">
        <span class="i-mdi-delete-outline" />
        <span>移除</span>
      </button>
    </template>

    <template v-else>
      <button class="menu-item text-primary" @click="handleAction('restore')">
        <span class="i-mdi-restore" />
        <span>还原</span>
      </button>

      <div class="h-px bg-white/10 my-0.5 mx-1" />

      <button class="menu-item text-red-500 hover:!text-red-600 hover:!bg-red-500/10" @click="handleAction('remove')">
        <span class="i-mdi-delete-forever-outline" />
        <span>彻底删除</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.menu-item {
  @apply flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--fg)] transition-colors text-left w-full;
}
.animate-fade-in {
  animation: fadeIn 0.1s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
</style>
