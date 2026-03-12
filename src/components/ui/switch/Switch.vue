<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  SwitchRoot,
  SwitchThumb,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes["class"] }>()

const emits = defineEmits<SwitchRootEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SwitchRoot
    v-bind="forwarded"
    :class="cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-start rounded-full border border-input p-0 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:justify-end data-[state=checked]:border-foreground/10 data-[state=checked]:bg-foreground/70 data-[state=unchecked]:bg-muted',
      props.class,
    )"
  >
    <SwitchThumb
      :class="cn('pointer-events-none m-0.5 block h-4 w-4 rounded-full bg-background shadow ring-0 transition-all')"
    >
      <slot name="thumb" />
    </SwitchThumb>
  </SwitchRoot>
</template>
