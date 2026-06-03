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
    class="context-menu fixed z-[10000] w-[224px] bg-popover border border-border rounded-[11px] shadow-lg p-[5px] flex flex-col animate-pop-in"
    :style="menuStyle"
    :class="{ 'pointer-events-none': !isPositioned }"
    @click.stop
    @contextmenu.prevent
  >
    <template v-if="!isTrash">
      <!-- 打开链接 -->
      <button class="menu-item" @click="handleAction('open')">
        <span class="i-ph-arrow-square-out menu-icon" />
        <span>打开链接</span>
      </button>

      <!-- uTools 浏览器打开（条件渲染） -->
      <button v-if="isUTools" class="menu-item" @click="handleAction('openInUtoolsBrowser')">
        <span class="i-ph-globe menu-icon" />
        <span>使用 uTools 浏览器打开</span>
      </button>

      <!-- 复制链接 -->
      <button class="menu-item" @click="handleAction('copy')">
        <span class="i-ph-copy menu-icon" />
        <span>复制链接</span>
      </button>

      <!-- 复制描述 -->
      <button
        class="menu-item"
        :disabled="!hasDescription"
        @click="handleAction('copyDescription')"
      >
        <span class="i-ph-article menu-icon" />
        <span>复制描述</span>
      </button>

      <template v-if="!readonly">
        <div class="menu-divider" />

        <!-- 编辑 -->
        <button class="menu-item" @click="handleAction('edit')">
          <span class="i-ph-pencil-simple menu-icon" />
          <span>编辑</span>
        </button>

        <!-- 置顶切换 -->
        <button class="menu-item" @click="handleAction('pin')">
          <span class="i-ph-push-pin menu-icon" />
          <span>置顶</span>
        </button>

        <!-- 在分组中定位 -->
        <button class="menu-item" @click="handleAction('locate')">
          <span class="i-ph-folder menu-icon" />
          <span>在分组中定位</span>
        </button>

        <div class="menu-divider" />

        <!-- 移到回收站（danger） -->
        <button class="menu-item menu-item--danger" @click="handleAction('remove')">
          <span class="i-ph-trash menu-icon" />
          <span>移到回收站</span>
        </button>
      </template>
    </template>

    <template v-else>
      <!-- 还原 -->
      <button class="menu-item" @click="handleAction('restore')">
        <span class="i-ph-arrow-bend-up-left menu-icon" />
        <span>还原</span>
      </button>

      <div class="menu-divider" />

      <!-- 彻底删除（danger） -->
      <button class="menu-item menu-item--danger" @click="handleAction('remove')">
        <span class="i-ph-trash menu-icon" />
        <span>彻底删除</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
@reference "../assets/index.css";

.menu-item {
  @apply flex items-center gap-[9px] h-[30px] px-[10px] rounded-[7px]
         text-[13px] text-foreground text-left w-full
         transition-colors cursor-default select-none
         hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed;
}

.menu-item--danger {
  @apply text-destructive hover:bg-destructive/10;
}

.menu-icon {
  @apply w-4 shrink-0 text-[14px] text-muted-foreground;
}

/* danger 项图标跟随文字颜色 */
.menu-item--danger .menu-icon {
  @apply text-destructive;
}

.menu-divider {
  @apply h-px bg-border my-[4px] mx-[6px];
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-pop-in {
  animation: pop-in 0.12s ease-out forwards;
}
</style>
