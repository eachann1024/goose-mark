<script setup lang="ts">
const settingsStore = useSettingsStore()

const gridColumnsOptions = [2, 3, 4, 5]

const handleGridColumnsChange = (value: string | number) => {
  const next = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(next)) {
    settingsStore.setGridColumns(next)
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">卡片网格</h3>
        <p class="settings-block__desc">这些设置只影响卡片模式下每行展示的密度和排布</p>
      </div>
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2 shrink-0">
          <label class="text-sm text-muted-foreground shrink-0">每行卡片</label>
          <Input
            type="number"
            min="2"
            max="5"
            step="1"
            class="h-9 w-16"
            :model-value="settingsStore.gridColumns"
            @update:model-value="handleGridColumnsChange"
          />
        </div>
        <div class="flex gap-1.5 shrink-0">
          <Button
            v-for="opt in gridColumnsOptions"
            :key="opt"
            size="sm"
            :variant="settingsStore.gridColumns === opt ? 'default' : 'ghost'"
            class="h-8 w-10 px-0 shrink-0"
            @click="settingsStore.setGridColumns(opt)"
          >
            {{ opt }}
          </Button>
        </div>
      </div>
      <p class="text-xs text-muted-foreground mt-2">主页卡片模式和搜索结果卡片模式都会共用这个列数。</p>
    </div>
  </div>
</template>
