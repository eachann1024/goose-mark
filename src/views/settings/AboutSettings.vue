<script setup lang="ts">
import FaqNotice from '@/components/FaqNotice.vue'
import ToolsSettings from './ToolsSettings.vue'

const store = useBookmarkStore()
const statsStore = useStatsStore()

const isMac = computed(() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform = (navigator as unknown as { platform?: string }).platform || ''
  return /mac/i.test(platform) || /macintosh/i.test(ua)
})

// 七天趋势数据
const weekTrend = computed(() => {
  const days: { date: string; label: string; clicks: number }[] = []
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六']

  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const label = weekLabels[d.getDay()]
    const clicks = statsStore.usageEvents.filter(
      e => e.type === 'click' && e.timestamp.startsWith(dateStr)
    ).length
    days.push({ date: dateStr, label, clicks })
  }
  return days
})

const maxClicks = computed(() => Math.max(...weekTrend.value.map(d => d.clicks), 1))
</script>

<template>
  <div class="flex flex-col gap-3">

    <FaqNotice
      title="使用技巧"
      :description="`· 直接输入即可搜索，无需点击搜索按钮
 · 按 ${isMac ? '⌘' : 'Ctrl'}+数字键 快速打开对应书签，按住 ${isMac ? 'Option' : 'Alt'} 显示序号，配合数字键快速打开书签
 · 拖拽书签到侧边栏可移动到其他子分组
 · 🚀 模板书签：URL 含 {query} 的书签可快捷搜索，开启万能匹配后可直接在主输入框里匹配`"
    />

    <!-- Dashboard Cards -->
    <div class="grid grid-cols-2 gap-3">
      <div class="settings-block" style="gap: 0.5rem; padding: 0.875rem 1rem;">
        <div class="flex items-center gap-2 text-muted-foreground">
          <span class="i-mdi-bookmark-multiple text-lg" />
          <span class="text-xs font-medium">书签总数</span>
        </div>
        <p class="text-2xl font-bold text-foreground">{{ store.bookmarks.length }}</p>
      </div>
      <div class="settings-block" style="gap: 0.5rem; padding: 0.875rem 1rem;">
        <div class="flex items-center gap-2 text-muted-foreground">
          <span class="i-mdi-folder-multiple text-lg" />
          <span class="text-xs font-medium">分组数量</span>
        </div>
        <p class="text-2xl font-bold text-foreground">{{ store.groups.length }}</p>
      </div>
    </div>

    <!-- 七天趋势 -->
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">七天使用趋势</h3>
      </div>
      <div class="flex items-end justify-between gap-2 h-32">
        <div
          v-for="day in weekTrend"
          :key="day.date"
          class="flex-1 flex flex-col items-center gap-1"
        >
          <span class="text-xs text-muted-foreground font-medium">{{ day.clicks }}</span>
          <div
            class="w-full rounded-t-md bg-foreground/18 transition-all duration-300"
            :style="{ height: `${Math.max((day.clicks / maxClicks) * 100, 4)}%` }"
            :class="day.date === new Date().toISOString().slice(0, 10) ? 'bg-foreground/55' : ''"
          ></div>
          <span class="text-xs text-muted-foreground">{{ day.label }}</span>
        </div>
      </div>
      <p v-if="maxClicks === 1 && weekTrend.every(d => d.clicks === 0)" class="text-sm text-muted-foreground text-center mt-2">
        暂无点击数据，开始使用书签后将记录统计
      </p>
    </div>

    <ToolsSettings />
  </div>
</template>
