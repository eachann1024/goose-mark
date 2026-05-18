<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core'

const settingsStore = useSettingsStore()

const previewWidthDraft = ref([settingsStore.previewPanelWidth])

watch(() => settingsStore.previewPanelWidth, (value) => {
  previewWidthDraft.value = [value]
})

const handlePreviewWidthPreview = useThrottleFn((value: number[] | undefined) => {
  if (!value?.length) return
  previewWidthDraft.value = value
}, 50)

const commitPreviewWidth = (value: number[]) => {
  if (!value.length) return
  settingsStore.setPreviewPanelWidth(value[0])
}

const handlePreviewWidthChange = (value: string | number) => {
  const next = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(next)) {
    settingsStore.setPreviewPanelWidth(next)
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">详情栏</h3>
        <p class="settings-block__desc">这些设置只影响列表模式下右侧详情栏的显示方式</p>
      </div>
      <div class="space-y-4">
        <div class="settings-row">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">默认收起详情栏</div>
            <div class="text-xs text-muted-foreground">开启后，列表项点击会直接打开书签，不再先展示右侧详情</div>
          </div>
          <Switch
            :model-value="settingsStore.previewPanelCollapsed"
            aria-label="默认收起详情栏"
            @update:model-value="(checked: boolean) => settingsStore.setPreviewPanelCollapsed(checked)"
          />
        </div>

        <div class="settings-row settings-row--top">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">详情栏宽度</div>
            <div class="text-xs text-muted-foreground">主页列表和搜索结果里的列表详情栏都会使用这个宽度</div>
          </div>
          <div class="flex w-full max-w-[260px] items-center gap-3">
            <Slider
              :model-value="previewWidthDraft"
              :min="200"
              :max="400"
              :step="4"
              class="flex-1"
              @update:model-value="handlePreviewWidthPreview"
              @value-commit="commitPreviewWidth"
            />
            <Input
              type="number"
              min="200"
              max="400"
              step="4"
              class="h-9 w-[72px] text-right"
              :model-value="settingsStore.previewPanelWidth"
              @update:model-value="handlePreviewWidthChange"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
