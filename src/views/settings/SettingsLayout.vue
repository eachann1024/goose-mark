<script setup lang="ts">
import GeneralSettings from './GeneralSettings.vue'
import CategoryManager from './CategoryManager.vue'
import ToolsSettings from './ToolsSettings.vue'
import DataSettings from './DataSettings.vue'
import LocalModeSettings from './LocalModeSettings.vue'
import AboutSettings from './AboutSettings.vue'

type SettingsTab = 'general' | 'categories' | 'tools' | 'data' | 'local-mode' | 'about'

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
</script>

<template>
  <div class="settings-layout flex h-full min-h-0 gap-5">
    <!-- 左侧导航 -->
    <nav class="settings-nav w-48 shrink-0 flex flex-col rounded-2xl p-3">
      <div class="settings-nav__head px-2 pb-2 mb-2 text-[13px] font-semibold text-muted-foreground">
        设置菜单
      </div>
      <div class="flex-1 space-y-1">
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
    </nav>

    <!-- 右侧内容区 -->
    <main class="flex-1 overflow-y-auto px-6 pb-6 pt-0 custom-scroll">
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
.settings-nav {
  background: hsl(var(--card) / 0.8);
  border: 1px solid hsl(var(--border) / 0.8);
}

.settings-nav__head {
  border-bottom: 1px dashed hsl(var(--border) / 0.8);
}

.settings-nav-item {
  border-radius: 12px;
  border: 1px solid transparent;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
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
  background: hsl(var(--muted) / 0.7);
  border-color: hsl(var(--border) / 0.9);
}

.settings-nav-item--active {
  color: hsl(var(--background));
  background: hsl(var(--foreground));
  border-color: hsl(var(--foreground));
  box-shadow: 0 2px 10px hsl(var(--foreground) / 0.12);
}

.dark .settings-nav-item--active {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.85);
  box-shadow: 0 2px 12px hsl(var(--primary) / 0.18);
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
