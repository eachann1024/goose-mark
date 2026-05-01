<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { CSSProperties } from 'vue'

const props = defineProps<{
  x: number
  y: number
  isTrash?: boolean
  readonly?: boolean
  isUTools?: boolean
  hasDescription?: boolean
}>()

const emit = defineEmits<{
  close: []
  action: [string]
}>()

const menu = ref<HTMLElement | null>(null)
const isPositioned = ref(false)
const menuStyle = ref<CSSProperties>({
  top: '0px',
  left: '0px',
  visibility: 'hidden'
})

const EDGE_GAP = 8

const updatePosition = async () => {
  isPositioned.value = false
  await nextTick()

  const el = menu.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  const viewWidth = window.innerWidth
  const viewHeight = window.innerHeight

  let left = props.x
  let top = props.y

  if (left + rect.width > viewWidth - EDGE_GAP) {
    left = viewWidth - rect.width - EDGE_GAP
  }
  if (top + rect.height > viewHeight - EDGE_GAP) {
    top = props.y - rect.height
  }

  left = Math.max(EDGE_GAP, left)
  top = Math.max(EDGE_GAP, top)

  menuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    visibility: 'visible'
  }
  isPositioned.value = true
}

const handleClickOutside = (e: Event) => {
  if (menu.value && !menu.value.contains(e.target as Node)) {
    emit('close')
  }
}

const handleAction = (action: string) => {
  emit('action', action)
  emit('close')
}

onMounted(() => {
  void updatePosition()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleClickOutside)
  document.addEventListener('scroll', handleClickOutside, true)
  window.addEventListener('resize', updatePosition)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleClickOutside)
  document.removeEventListener('scroll', handleClickOutside, true)
  window.removeEventListener('resize', updatePosition)
})

watch(
  () => [props.x, props.y],
  () => {
    void updatePosition()
  }
)
</script>

<template>
  <div
    ref="menu"
    class="context-menu fixed z-[10000] min-w-[160px] bg-white/90 dark:bg-[#1a1c20]/90 backdrop-blur-md rounded-xl shadow-xl border border-white/10 p-1.5 flex flex-col gap-1 text-sm animate-fade-in"
    :style="menuStyle"
    :class="{ 'pointer-events-none': !isPositioned }"
    @click.stop
    @contextmenu.prevent
  >
    <template v-if="!isTrash">
      <Button variant="ghost" class="menu-item justify-start" @click="handleAction('open')">
        <span class="i-mdi-open-in-new text-muted" />
        <span>打开链接</span>
      </Button>

      <Button v-if="isUTools" variant="ghost" class="menu-item justify-start" @click="handleAction('openInUtoolsBrowser')">
        <span class="i-mdi-web text-muted" />
        <span>使用 uTools 浏览器打开</span>
      </Button>

      <Button variant="ghost" class="menu-item justify-start" @click="handleAction('copy')">
        <span class="i-mdi-content-copy text-muted" />
        <span>复制链接</span>
      </Button>

      <Button
        variant="ghost"
        class="menu-item justify-start"
        :disabled="!hasDescription"
        @click="handleAction('copyDescription')"
      >
        <span class="i-mdi-text-box-outline text-muted" />
        <span>复制描述</span>
      </Button>
  
      <template v-if="!readonly">
        <div class="h-px bg-white/10 mx-1" />

        <Button variant="ghost" class="menu-item justify-start" @click="handleAction('edit')">
          <span class="i-mdi-pencil-outline text-muted" />
          <span>编辑</span>
        </Button>

        <div class="h-px bg-white/10 mx-1" />
        
        <Button variant="ghost" class="menu-item justify-start text-red-500 hover:!text-red-600 hover:!bg-red-500/10" @click="handleAction('remove')">
          <span class="i-mdi-delete-outline" />
          <span>移除</span>
        </Button>
      </template>
    </template>

    <template v-else>
      <Button variant="ghost" class="menu-item justify-start text-primary" @click="handleAction('restore')">
        <span class="i-mdi-restore" />
        <span>还原</span>
      </Button>

      <div class="h-px bg-white/10 mx-1" />

      <Button variant="ghost" class="menu-item justify-start text-red-500 hover:!text-red-600 hover:!bg-red-500/10" @click="handleAction('remove')">
        <span class="i-mdi-delete-forever-outline" />
        <span>彻底删除</span>
      </Button>
    </template>
  </div>
</template>

<style scoped>
@reference "../assets/index.css";

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
