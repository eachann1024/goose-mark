<script setup lang="ts">
import GeneralSettings from './GeneralSettings.vue'
import ListSettings from './ListSettings.vue'
import CardSettings from './CardSettings.vue'
import AISettings from './AISettings.vue'
import CategoryManager from './CategoryManager.vue'
import DataSettings from './DataSettings.vue'
import LocalModeSettings from './LocalModeSettings.vue'
import AboutSettings from './AboutSettings.vue'
import { trackEvent } from '@/services/analytics'

interface SettingsSection {
  id: string
  label: string
  icon: string
  component: typeof GeneralSettings
}

const { localModeMenuDotVisible, markLocalModeSettingsVisited } = useFeatureNoticeCenter()

const sections: SettingsSection[] = [
  { id: 'general', label: '通用设置', icon: 'i-mdi-cog-outline', component: GeneralSettings },
  { id: 'list', label: '列表设置', icon: 'i-mdi-format-list-bulleted', component: ListSettings },
  { id: 'card', label: '卡片设置', icon: 'i-mdi-view-grid-outline', component: CardSettings },
  { id: 'ai', label: 'AI 助手', icon: 'i-mdi-sparkles', component: AISettings },
  { id: 'categories', label: '分组管理', icon: 'i-mdi-folder-outline', component: CategoryManager },
  { id: 'data', label: '导入与备份', icon: 'i-mdi-database-outline', component: DataSettings },
  { id: 'local-mode', label: '浏览器拓展', icon: 'i-mdi-database-sync-outline', component: LocalModeSettings },
  { id: 'about', label: '帮助与统计', icon: 'i-mdi-information-outline', component: AboutSettings },
]

const activeSectionId = ref('general')
const isScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

const scrollToSection = (id: string) => {
  const el = document.getElementById(`settings-section-${id}`)
  if (!el) return
  isScrolling.value = true
  if (scrollTimeout) clearTimeout(scrollTimeout)
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  activeSectionId.value = id
  trackEvent('settings_section_scroll', { section: id })
  if (id === 'about') {
    trackEvent('stats_view', { source: 'settings_about' })
  }
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, 600)
}

// IntersectionObserver 监听当前可见的 section
const sectionRefs = ref<Record<string, HTMLElement>>({})

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (isScrolling.value) return
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('settings-section-', '')
          activeSectionId.value = id
          if (id === 'local-mode') {
            markLocalModeSettingsVisited()
          }
          break
        }
      }
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  )

  for (const section of sections) {
    const el = document.getElementById(`settings-section-${section.id}`)
    if (el) observer.observe(el)
  }

  onBeforeUnmount(() => observer.disconnect())
})

const feedbackUrl = 'https://wj.qq.com/s2/25958391/c92b/'

const openFeedback = () => {
  try {
    if (window.utools?.shellOpenExternal) {
      window.utools.shellOpenExternal(feedbackUrl)
      return
    }
  } catch (error) {
    console.warn('[SettingsLayout] 打开快速反馈失败，尝试浏览器打开', error)
  }
  window.open(feedbackUrl, '_blank')
}
</script>

<template>
  <div class="settings-layout flex h-full min-h-0">
    <!-- Sticky TOC Sidebar -->
    <nav class="settings-nav w-36 shrink-0 flex flex-col py-2 px-1.5">
      <div class="flex-1 space-y-0.5">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          class="settings-nav-item w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-left"
          :class="activeSectionId === section.id ? 'settings-nav-item--active' : 'settings-nav-item--idle'"
          @click="scrollToSection(section.id)"
        >
          <span :class="[section.icon, 'text-base settings-nav-item__icon']" />
          <span class="min-w-0 flex items-center gap-1.5">
            <span class="truncate">{{ section.label }}</span>
            <span
              v-if="section.id === 'local-mode' && localModeMenuDotVisible"
              class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
            />
          </span>
        </button>
      </div>
      <button
        type="button"
        class="settings-feedback mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold"
        @click="openFeedback"
      >
        <span class="i-mdi-message-alert-outline text-base" />
        <span>快速反馈</span>
      </button>
    </nav>

    <!-- Main Content: all sections laid out vertically -->
    <main class="flex-1 overflow-y-auto px-4 pb-8 pt-2 custom-scroll">
      <div class="max-w-[680px] space-y-6">
        <div
          v-for="section in sections"
          :id="`settings-section-${section.id}`"
          :key="section.id"
          class="settings-section"
        >
          <div class="mb-2 flex items-center gap-2 px-1">
            <span :class="[section.icon, 'text-base text-muted-foreground/60']" />
            <h2 class="text-sm font-semibold text-foreground">{{ section.label }}</h2>
          </div>
          <component :is="section.component" />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-nav {
  background: #ffffff;
  border-right: 1px solid hsl(var(--border) / 0.3);
}

.dark .settings-nav {
  background: hsl(var(--card) / 0.45);
  border-right-color: hsl(var(--border) / 0.15);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.settings-nav-item {
  border-radius: 8px;
  transition: background-color 120ms ease, color 120ms ease;
}

.settings-nav-item__icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-nav-item--idle {
  color: hsl(var(--muted-foreground));
}

.settings-nav-item--idle:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 0.5);
}

.settings-nav-item--active {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
}

.dark .settings-nav-item--active {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary) / 0.85);
  box-shadow: inset 3px 0 0 0 hsl(var(--primary-foreground) / 0.6);
}

.settings-feedback {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.5);
  transition: color 120ms ease, background-color 120ms ease;
}

.settings-feedback:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 0.75);
}

.custom-scroll {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
}

.custom-scroll::-webkit-scrollbar {
  width: 8px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.32);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.custom-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}

.settings-section {
  scroll-margin-top: 12px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.settings-row--top {
  align-items: flex-start;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.settings-field__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--foreground));
}
</style>

<style>
.settings-block {
  padding: 16px;
  border-radius: 14px;
  border: 1px solid hsl(var(--border) / 0.25);
  background: hsl(var(--card));
  box-shadow: 0 10px 24px hsl(var(--foreground) / 0.03);
}

.dark .settings-block {
  background: hsl(var(--card) / 0.55);
  border-color: hsl(var(--border) / 0.15);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
}

.settings-block__head {
  margin-bottom: 12px;
}

.settings-block__title {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.settings-block__desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}
</style>
