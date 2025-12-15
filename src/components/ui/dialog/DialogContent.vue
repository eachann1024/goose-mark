<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props extends DialogContentProps {
  class?: HTMLAttributes['class']
  /** 动画起始点 X 坐标（视口百分比或 px） */
  originX?: string
  /** 动画起始点 Y 坐标（视口百分比或 px） */
  originY?: string
}

const props = defineProps<Props>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, originX: _ox, originY: _oy, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)

// 计算 transform-origin 样式
const originStyle = computed(() => {
  if (!props.originX && !props.originY) return {}
  // 计算相对于弹窗中心的偏移
  const x = props.originX || '50%'
  const y = props.originY || '50%'
  return {
    '--dialog-origin-x': x,
    '--dialog-origin-y': y,
  }
})
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-100"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          'dialog-animated',
          props.class,
        )
      "
      :style="originStyle"
    >
      <slot />

      <DialogClose
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <X class="h-4 w-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style>
/* Dialog 动画样式 - 需要非 scoped 以应用到 radix-vue 组件 */
.dialog-animated {
  --dialog-origin-x: 50%;
  --dialog-origin-y: 50%;
  transform-origin: var(--dialog-origin-x) var(--dialog-origin-y);
}

.dialog-animated[data-state='open'] {
  animation: dialog-scale-in 150ms ease-out;
}

.dialog-animated[data-state='closed'] {
  animation: dialog-scale-out 100ms ease-in;
}

@keyframes dialog-scale-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.92);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes dialog-scale-out {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.92);
  }
}
</style>

