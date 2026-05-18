<script setup lang="ts">
import { computed } from 'vue'
import { useTextOverflow } from '@/composables/useTextOverflow'

interface SubGroup {
  id: string
  name: string
}

interface Group {
  id: string
  name: string
  children: SubGroup[]
}

const props = defineProps<{
  visibleGroups: Group[]
  activeGroupId: string
  tab: 'bookmarks' | 'settings'
  isUTools: boolean
  isTrashActive: boolean
  searching: boolean
  groupLayout?: 'wrap' | 'scroll'
}>()

const emit = defineEmits<{
  (e: 'update:tab', value: 'bookmarks' | 'settings'): void
  (e: 'select-group', id: string): void
  (e: 'select-trash'): void
  (e: 'toggle-dark'): void
  (e: 'open-search'): void
  (e: 'edit-group', id: string): void
}>()

const setTab = (value: 'bookmarks' | 'settings') => emit('update:tab', value)
const formatName = (name: string) => (name.length > 8 ? `${name.slice(0, 8)}…` : name)


const groupContainerClass = computed(() => {
  if (props.groupLayout === 'scroll') {
    return 'flex items-center gap-2 overflow-x-auto no-scrollbar mask-gradient-right whitespace-nowrap'
  }
  return 'flex items-center flex-wrap gap-2'
})

// 溢出检测：名称超过 8 个字符会被截断
const { overflowMap } = useTextOverflow()

// 鼠标进入时检查是否需要显示 tooltip（名称被截断时）
const handleGroupMouseEnter = (group: Group) => {
  // 名称超过 8 个字符会被 formatName 截断
  overflowMap.value[group.id] = group.name.length > 8
}
</script>

<template>
  <div class="flex items-center justify-between">
    <div :class="groupContainerClass">
      <Tooltip v-for="group in visibleGroups" :key="group.id" :disabled="!overflowMap[group.id]">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="main-group-tab group-tab-btn rounded-full px-4 h-9 font-normal transition-all border border-transparent"
            :data-active="activeGroupId === group.id ? 'true' : undefined"
            @click="emit('select-group', group.id)"
            @mouseenter="handleGroupMouseEnter(group)"
            @contextmenu.prevent="emit('edit-group', group.id)"
          >
            {{ formatName(group.name) }}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ group.name }}</p>
        </TooltipContent>
      </Tooltip>
    </div>

    <div class="flex items-center gap-2 shrink-0 ml-4">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            class="group-action-btn h-9 rounded-full px-3 flex items-center gap-1"
            :class="{ 'group-action-btn--searching': searching }"
            @click="emit('open-search')"
          >
            <span class="i-ph-magnifying-glass-thin text-lg" />
            <span class="text-xs">搜索</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p class="text-xs">直接输入字符即可搜索</p>
        </TooltipContent>
      </Tooltip>

      <div class="h-6 w-px bg-border mx-2"></div>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="w-8 h-8 text-muted-foreground hover:text-foreground"
            :class="{ 'bg-muted text-foreground': tab === 'settings' }"
            @click="setTab('settings')"
            aria-label="设置"
          >
            <span class="i-ph-gear-thin text-lg" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>设置</p></TooltipContent>
      </Tooltip>

      <div class="h-6 w-px bg-border mx-2"></div>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="w-7 h-7 text-muted-foreground hover:text-foreground"
            @click="emit('toggle-dark')"
          >
            <span class="i-ph-moon-stars-thin text-lg" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>切换深浅模式</p></TooltipContent>
      </Tooltip>

      <div class="h-6 w-px bg-border mx-2"></div>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="w-7 h-7 text-muted-foreground hover:text-destructive transition-colors"
            :class="{ 'group-action-btn--danger-active text-destructive': isTrashActive }"
            @click="emit('select-trash')"
          >
            <span class="i-ph-trash-thin text-lg" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>回收站</p></TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.group-tab-btn {
  color: hsl(var(--muted-foreground));
  background-color: transparent;
}

.group-tab-btn:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.8);
}

.group-tab-btn[data-active="true"] {
  color: hsl(var(--background));
  background-color: hsl(var(--foreground));
  border-color: hsl(var(--foreground));
  box-shadow: 0 2px 8px hsl(var(--foreground) / 0.10);
}

.dark .group-tab-btn:hover {
  color: hsl(var(--accent-foreground));
  background-color: hsl(var(--accent));
}

.dark .group-tab-btn[data-active="true"] {
  color: hsl(var(--primary-foreground));
  background-color: hsl(var(--primary));
  border-color: hsl(var(--primary));
  box-shadow: 0 2px 10px hsl(var(--primary) / 0.16);
}

.group-action-btn--searching {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.1);
}

.group-action-btn--danger-active {
  background-color: hsl(var(--destructive) / 0.1);
}
</style>
