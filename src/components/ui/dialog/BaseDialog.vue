<script setup lang="ts">
/**
 * 统一的弹窗基础组件
 * 所有弹窗应基于此组件开发，以保证行为一致性：
 * - 弹窗关闭时自动隐藏所有 tooltip
 * - 统一的动画效果
 * - 统一的事件处理
 * 
 * 注意：弹窗打开时不能调用 hideAllTooltips，因为改变 TooltipProvider 的 key
 * 会导致组件树重新挂载，从而触发无限循环
 */
import type { DialogRootEmits, DialogRootProps } from "reka-ui"
import { DialogRoot, useForwardPropsEmits } from "reka-ui"

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()

const { onDialogClose } = useUIManager()

const forwarded = useForwardPropsEmits(props, emits)

// 追踪上一次的 open 状态
let wasOpen = false

// 只在弹窗关闭时清理 tooltip
watch(() => props.open, (open) => {
  if (!open && wasOpen) {
    // 弹窗关闭时隐藏所有 tooltip
    onDialogClose()
  }
  wasOpen = !!open
})
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
