<script setup lang="ts">
/**
 * 全局结果反馈 Toast
 * 
 * 【动画锚点规范】
 * - 动画从触发位置"生长"出来 (使用 @starting-style + allow-discrete)
 * - transform-origin 通过 CSS 变量 --origin-x/--origin-y 传入
 * - 调用 showToast 时传入 anchor: { element } 可指定触发位置
 */
import { computed } from 'vue'
import type { AnimationOrigin } from '@/composables/useUIManager'

type Variant = 'success' | 'info' | 'warning' | 'error'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  variant?: Variant
  icon?: string
  actionLabel?: string
  origin?: AnimationOrigin
}>()

const emit = defineEmits<{
  close: []
  action: []
}>()

const iconClass = computed(() => {
  if (props.icon) return props.icon
  const v = props.variant ?? 'info'
  if (v === 'success') return 'i-mdi-check-circle-outline text-primary'
  if (v === 'warning') return 'i-mdi-alert-outline text-yellow-500'
  if (v === 'error') return 'i-mdi-close-circle-outline text-destructive'
  return 'i-mdi-information-outline text-muted-foreground'
})

const MAX_TITLE_LEN = 50
const MAX_DESC_LEN = 300

const sanitizedTitle = computed(() => {
  const t = props.title || ''
  return t.length > MAX_TITLE_LEN ? t.slice(0, MAX_TITLE_LEN) + '…' : t
})

const sanitizedDescription = computed(() => {
  const d = props.description || ''
  return d.length > MAX_DESC_LEN ? d.slice(0, MAX_DESC_LEN) + '…' : d
})

// 始终在右上角
const positionClass = 'top-20 right-4'

// 动画原点 CSS 变量
const originStyle = computed(() => {
  const o = props.origin
  if (!o) return {}
  return {
    '--origin-x': o.x,
    '--origin-y': o.y
  }
})
</script>

<template>
  <Teleport to="body">
    <!-- 使用 hidden 属性配合 allow-discrete 实现入场/退场动画 -->
    <div
      class="toast-container"
      :class="positionClass"
      :style="originStyle"
      :hidden="!open || undefined"
    >
      <div class="flex gap-3" :class="description ? 'items-start' : 'items-center'">
        <span :class="[iconClass, 'text-lg shrink-0', description ? 'mt-0.5' : '']" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-foreground leading-tight">{{ sanitizedTitle }}</p>
          <p v-if="sanitizedDescription" class="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{{ sanitizedDescription }}</p>
        </div>
        <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" title="关闭" @click="emit('close')">
          <span class="i-mdi-close text-sm text-muted-foreground" />
        </Button>
      </div>

      <div v-if="actionLabel || $slots.action" class="mt-3 flex items-center justify-end gap-2">
        <slot name="action" />
        <Button v-if="actionLabel" size="sm" variant="outline" class="h-7 px-3 text-xs" @click="emit('action')">
          {{ actionLabel }}
        </Button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  z-index: 20000;
  width: 320px;
  max-width: calc(100vw - 2rem);
  max-height: 200px;
  overflow-y: auto;
  border-radius: 0.5rem;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  backdrop-filter: blur(8px);
  padding: 1rem;
  pointer-events: auto;

  /* 动画属性 */
  opacity: 1;
  transform: scale(1);
  transform-origin: var(--origin-x, right) var(--origin-y, bottom);
  
  /* allow-discrete 让 display 属性也能过渡 */
  transition: 
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    display 220ms allow-discrete;

  /* 入场动画：首次渲染时的初始状态 */
  @starting-style {
    opacity: 0;
    transform: scale(0.92);
  }
}

/* 退场动画：hidden 状态 */
.toast-container[hidden] {
  display: block; /* 覆盖 hidden 默认的 display:none，让过渡生效 */
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
  
  /* 延迟 display 切换，等动画完成 */
  transition: 
    opacity 180ms ease-in,
    transform 180ms ease-in,
    display 180ms allow-discrete;
}
</style>
