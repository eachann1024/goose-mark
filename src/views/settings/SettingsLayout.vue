<script setup lang="ts">
import GeneralSettings from './GeneralSettings.vue'
import CategoryManager from './CategoryManager.vue'
import ToolsSettings from './ToolsSettings.vue'
import DataSettings from './DataSettings.vue'
import LocalModeSettings from './LocalModeSettings.vue'
import AboutSettings from './AboutSettings.vue'

type SettingsTab = 'general' | 'categories' | 'tools' | 'data' | 'local-mode' | 'about'
const feedbackUrl = 'https://wj.qq.com/s2/25958391/c92b/'

const props = withDefaults(defineProps<{
  activeTab?: SettingsTab
}>(), {
  activeTab: 'general'
})

const emit = defineEmits<{
  (e: 'update:activeTab', value: SettingsTab): void
}>()

const currentTab = computed<SettingsTab>({
  get: () => props.activeTab,
  set: (value) => emit('update:activeTab', value)
})

const { localModeMenuDotVisible, markLocalModeSettingsVisited } = useFeatureNoticeCenter()

const tabs = [
  { value: 'general', label: '外观与使用', icon: 'i-mdi-cog-outline' },
  { value: 'categories', label: '分组管理', icon: 'i-mdi-folder-outline' },
  { value: 'tools', label: '常用工具', icon: 'i-mdi-wrench-outline' },
  { value: 'data', label: '导入与备份', icon: 'i-mdi-database-outline' },
  { value: 'local-mode', label: '浏览器拓展', icon: 'i-mdi-database-sync-outline' },
  { value: 'about', label: '帮助与统计', icon: 'i-mdi-information-outline' }
] as const

watch(() => currentTab.value, (value) => {
  if (value === 'local-mode') {
    markLocalModeSettingsVisited()
  }
}, { immediate: true })

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
  <div class="settings-layout flex h-full min-h-0 gap-2">
    <!-- 左侧导航 -->
    <nav class="settings-nav w-44 shrink-0 flex flex-col p-2 rounded-xl">
      <div class="flex-1 space-y-0.5">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="settings-nav-item w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-left"
          :class="[
            currentTab === tab.value
              ? 'settings-nav-item--active'
              : 'settings-nav-item--idle'
          ]"
          @click="currentTab = tab.value"
        >
          <span class="settings-nav-item__icon-wrap">
            <span :class="[tab.icon, 'text-lg settings-nav-item__icon']" />
          </span>
          <span class="min-w-0 flex items-center gap-2">
            <span class="truncate">{{ tab.label }}</span>
            <span
              v-if="tab.value === 'local-mode' && localModeMenuDotVisible"
              class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
            />
          </span>
        </button>
      </div>
      <button
        type="button"
        class="settings-feedback mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold"
        @click="openFeedback"
      >
        <span class="i-mdi-message-alert-outline text-lg" />
        <span>快速反馈</span>
      </button>
    </nav>

    <!-- 右侧内容区 -->
    <main class="flex-1 overflow-y-auto px-4 pb-6 pt-1 custom-scroll">
      <Transition
        mode="out-in"
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <GeneralSettings v-if="currentTab === 'general'" key="general" />
        <CategoryManager v-else-if="currentTab === 'categories'" key="categories" />
        <ToolsSettings v-else-if="currentTab === 'tools'" key="tools" />
        <DataSettings v-else-if="currentTab === 'data'" key="data" />
        <LocalModeSettings v-else-if="currentTab === 'local-mode'" key="local-mode" />
        <AboutSettings v-else-if="currentTab === 'about'" key="about" />
      </Transition>
    </main>
  </div>
</template>

<style scoped>
/* 左侧导航：白色背景，圆角 */
.settings-nav {
  background: #ffffff;
}

.dark .settings-nav {
  background: hsl(var(--card));
}

.settings-nav-item {
  border-radius: 10px;
  transition: background-color 120ms ease, color 120ms ease;
}

.settings-nav-item__icon-wrap {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.settings-nav-item--idle {
  color: hsl(var(--muted-foreground));
}

.settings-nav-item--idle:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 0.6);
}

.settings-nav-item--active {
  color: hsl(var(--background));
  background: hsl(var(--foreground));
  box-shadow: 0 2px 8px hsl(var(--foreground) / 0.10);
}

.dark .settings-nav-item--active {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  box-shadow: 0 2px 10px hsl(var(--primary) / 0.16);
}

.settings-feedback {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.5);
  transition: color 120ms ease, background-color 120ms ease;
}

.settings-feedback:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 0.8);
}

.settings-feedback:active {
  opacity: 0.8;
}

.custom-scroll::-webkit-scrollbar {
  width: 4px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: var(--radius-sm);
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>

<!-- 全局注入 settings-block 色块，让所有子设置页面共享 -->
<style>
.settings-block {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.125rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dark .settings-block {
  background: hsl(var(--card));
}

.settings-block__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 0.25rem;
}

.settings-block__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: hsl(var(--foreground));
  line-height: 1.4;
}

.settings-block__desc {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
}
</style>
