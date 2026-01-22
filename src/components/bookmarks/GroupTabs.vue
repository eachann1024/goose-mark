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
            class="rounded-full px-4 h-9 font-normal transition-all border border-transparent data-[active=true]:bg-accent data-[active=true]:text-accent-foreground data-[active=true]:shadow-md data-[active=true]:border-primary/30"
            :data-active="activeGroupId === group.id ? 'true' : undefined"
            @click="emit('select-group', group.id)"
            @mouseenter="handleGroupMouseEnter(group)"
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
            class="h-9 rounded-full px-3 flex items-center gap-1"
            :class="{ 'border-primary text-primary bg-primary/10': searching }"
            @click="emit('open-search')"
          >
            <span class="i-mdi-magnify text-lg" />
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
            <span class="i-mdi-cog-outline text-lg" />
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
            <span class="i-mdi-theme-light-dark text-lg" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>切换主题</p></TooltipContent>
      </Tooltip>

      <div class="h-6 w-px bg-border mx-2"></div>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="w-7 h-7 text-muted-foreground hover:text-destructive transition-colors"
            :class="{ 'bg-destructive/10 text-destructive': isTrashActive }"
            @click="emit('select-trash')"
          >
            <span class="i-mdi-trash-can-outline text-lg" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>回收站</p></TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>
