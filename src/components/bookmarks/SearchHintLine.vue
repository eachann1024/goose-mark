<script setup lang="ts">
const props = defineProps<{
  enableSubInput: boolean
  searchAutoExitText: string
}>()

const hintText = computed(() => {
  const exitKey = 'Tab'
  return `按 ${exitKey} 退出；按 ↑ ↓ 选择，回车打开；${props.searchAutoExitText}`
})
</script>

<template>
  <div class="flex items-center gap-2 justify-center">
    <span class="i-ph-info-thin" />
    <span>{{ hintText }}</span>
  </div>
</template>
