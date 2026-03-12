<script setup lang="ts">
import FaqNotice from '@/components/FaqNotice.vue'

const store = useBookmarkStore()
const statsStore = useStatsStore()

const isMac = computed(() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform = (navigator as unknown as { platform?: string }).platform || ''
  return /mac/i.test(platform) || /macintosh/i.test(ua)
})

// 今日使用次数
const todayClicks = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return statsStore.usageEvents.filter(
    e => e.type === 'click' && e.timestamp.startsWith(today)
  ).length
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

// 热门书签 Top 5
const topBookmarks = computed(() => {
  const clickCount = new Map<string, number>()

  statsStore.usageEvents
    .filter(e => e.type === 'click' && e.bookmarkId)
    .forEach(e => {
      const count = clickCount.get(e.bookmarkId!) || 0
      clickCount.set(e.bookmarkId!, count + 1)
    })

  const sorted = [...clickCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const maxCount = sorted[0]?.[1] || 1

  return sorted.map(([id, count]) => {
    const bookmark = store.bookmarks.find(b => b.id === id)
    return {
      id,
      title: bookmark?.title || '已删除书签',
      url: bookmark?.url || '',
      count,
      percent: Math.round((count / maxCount) * 100)
    }
  })
})

// 最常用书签名称
const topBookmarkName = computed(() => topBookmarks.value[0]?.title || '-')
</script>

<template>
  <div class="flex flex-col gap-3">

    <FaqNotice
      title="使用技巧"
      :description="`· 直接输入即可搜索，无需点击搜索按钮
 · 按 ${isMac ? '⌘' : 'Ctrl'}+数字键 快速打开对应书签，按住 ${isMac ? 'Option' : 'Alt'} 显示序号，配合数字键快速打开书签
 · 拖拽书签到侧边栏可移动到其他子分组
 · 🚀 模板书签：URL 含 {query} 的书签可快捷搜索`"
    />

    <!-- Dashboard Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      <div class="settings-block" style="gap: 0.5rem; padding: 0.875rem 1rem;">
        <div class="flex items-center gap-2 text-muted-foreground">
          <span class="i-mdi-fire text-lg" />
          <span class="text-xs font-medium">今日使用</span>
        </div>
        <p class="text-2xl font-bold text-foreground">{{ todayClicks }}</p>
      </div>
      <div class="settings-block" style="gap: 0.5rem; padding: 0.875rem 1rem;">
        <div class="flex items-center gap-2 text-muted-foreground">
          <span class="i-mdi-star text-lg" />
          <span class="text-xs font-medium">最常用</span>
        </div>
        <p class="text-lg font-bold text-foreground truncate" :title="topBookmarkName">{{ topBookmarkName }}</p>
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

    <!-- 热门书签 -->
    <div v-if="topBookmarks.length > 0" class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">热门书签 TOP 5</h3>
      </div>
      <div class="space-y-2">
        <div
          v-for="(item, index) in topBookmarks"
          :key="item.id"
          class="flex items-center gap-3"
        >
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-muted text-muted-foreground"
          >
            {{ index + 1 }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-sm font-medium truncate" :title="item.title">{{ item.title }}</span>
              <span class="text-xs text-muted-foreground shrink-0">{{ item.count }}次</span>
            </div>
            <div class="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                class="h-full rounded-full bg-foreground/55 transition-all duration-300"
                :style="{ width: `${item.percent}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
