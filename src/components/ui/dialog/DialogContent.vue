<script setup lang="ts">
/**
 * Dialog 内容容器
 * 
 * 【动画锚点规范】
 * - 打开时自动检测触发元素 (document.activeElement)
 * - transform-origin 根据触发元素位置动态计算
 * - 动画从触发位置"生长"展开
 */
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { X } from "lucide-vue-next"
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"
import { ref, onMounted, computed } from "vue"
import { useUIManager } from "@/composables/useUIManager"

const props = defineProps<DialogContentProps & { class?: HTMLAttributes["class"]; descriptionId?: string }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class", "descriptionId")
const forwarded = useForwardPropsEmits(delegatedProps, emits)

// 动画原点
const originStyle = ref<{ '--dialog-origin-x': string; '--dialog-origin-y': string } | null>(null)

const { closeToast } = useUIManager()

onMounted(() => {
  // 弹窗打开时自动关闭 Toast（避免 UI 重叠）
  closeToast()
  
  // 捕获触发元素的位置
  const trigger = document.activeElement as HTMLElement | null
  if (trigger && trigger !== document.body && trigger.tagName !== 'HTML') {
    const rect = trigger.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    // 转换为视口百分比
    const originX = `${(centerX / window.innerWidth * 100).toFixed(1)}%`
    const originY = `${(centerY / window.innerHeight * 100).toFixed(1)}%`
    originStyle.value = {
      '--dialog-origin-x': originX,
      '--dialog-origin-y': originY
    }
  }
})
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-[3000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none"
    />
    <DialogContent
      v-bind="forwarded"
      :aria-describedby="props.descriptionId"
      :class="
        cn(
          'dialog-content fixed left-1/2 top-1/2 z-[3000] grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          props.class,
        )"
      :style="originStyle || undefined"
      @close-auto-focus.prevent
    >
      <slot />

      <DialogClose
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <X class="w-4 h-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
.dialog-content {
  /* 动画原点：如果有 CSS 变量则使用，否则默认中心 */
  transform-origin: var(--dialog-origin-x, 50%) var(--dialog-origin-y, 50%);
  
  /* 入场动画 */
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  transition: 
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);

  @starting-style {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
}

/* 退场动画通过 data-state 处理 */
.dialog-content[data-state="closed"] {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}
</style>
