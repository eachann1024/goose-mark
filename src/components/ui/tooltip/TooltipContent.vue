<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { ref, nextTick } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { TooltipContent, TooltipPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/lib/utils"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<TooltipContentProps & { class?: HTMLAttributes["class"] }>(), {
  sideOffset: 4,
  collisionPadding: 20,
})

const emits = defineEmits<TooltipContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const { isTooltipEnabled } = useUIManager()

const forwarded = useForwardPropsEmits(delegatedProps, emits)

// Manual Boundary Check (Ultimate Fallback)
const contentRef = ref<InstanceType<typeof TooltipContent> | null>(null)

const fixPosition = () => {
  nextTick(() => {
    const el = contentRef.value?.$el
    if (!el || !(el instanceof HTMLElement)) return
    
    const rect = el.getBoundingClientRect()
    // If top is cut off (allowing 4px buffer)
    if (rect.top < 4) {
      const offset = Math.abs(rect.top) + 12
      // Apply correction. Note: Radix might be using translate3d in style.
      // We append a translateY correction.
      // However, modifying style directly might be overwritten by the library on subsequent updates.
      // But for a static tooltip hover, this usually works for the initial show.
      el.style.transform = `${el.style.transform || ''} translateY(${offset}px)`
    }
  })
}
</script>

<template>
  <TooltipPortal>
    <TooltipContent 
      ref="contentRef"
      v-if="isTooltipEnabled" 
      v-bind="{ ...forwarded, ...$attrs }" 
      :class="cn('z-[100] overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', props.class)"
      @vue:mounted="fixPosition"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
