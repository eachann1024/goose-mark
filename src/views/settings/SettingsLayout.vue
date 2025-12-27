<script setup lang="ts">
import GeneralSettings from './GeneralSettings.vue'
import CategoryManager from './CategoryManager.vue'
import ToolsSettings from './ToolsSettings.vue'
import DataSettings from './DataSettings.vue'
import AboutSettings from './AboutSettings.vue'

const activeTab = ref('general')

const tabs = [
  { value: 'general', label: '通用设置', icon: 'i-mdi-cog-outline' },
  { value: 'categories', label: '分类管理', icon: 'i-mdi-folder-outline' },
  { value: 'tools', label: '工具', icon: 'i-mdi-wrench-outline' },
  { value: 'data', label: '数据管理', icon: 'i-mdi-database-outline' },
  { value: 'about', label: '关于', icon: 'i-mdi-information-outline' }
]
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- 左侧导航 -->
    <nav class="w-44 shrink-0 bg-card/30 flex flex-col rounded-l-2xl overflow-hidden">
      <div class="flex-1 py-2">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left"
          :class="[
            activeTab === tab.value
              ? 'bg-primary/10 text-primary border-r-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          ]"
          @click="activeTab = tab.value"
        >
          <span :class="[tab.icon, 'text-lg']" />
          {{ tab.label }}
        </button>
      </div>
    </nav>

    <!-- 右侧内容区 -->
    <main class="flex-1 overflow-y-auto p-6 custom-scroll">
      <Transition
        mode="out-in"
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <GeneralSettings v-if="activeTab === 'general'" key="general" />
        <CategoryManager v-else-if="activeTab === 'categories'" key="categories" />
        <ToolsSettings v-else-if="activeTab === 'tools'" key="tools" />
        <DataSettings v-else-if="activeTab === 'data'" key="data" />
        <AboutSettings v-else-if="activeTab === 'about'" key="about" />
      </Transition>
    </main>
  </div>
</template>

<style scoped>
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
