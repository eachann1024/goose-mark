<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  visibleGroups: Array<{ id: string; name: string }>
  activeGroupId: string
  tab: 'bookmarks' | 'settings'
  isUTools: boolean
  search: string
  isTrashActive: boolean
}>()

const emit = defineEmits<{
  (e: 'update:tab', value: 'bookmarks' | 'settings'): void
  (e: 'select-group', id: string): void
  (e: 'select-trash'): void
  (e: 'update:search', value: string): void
  (e: 'toggle-dark'): void
}>()

const search = computed({
  get: () => props.search,
  set: (v: string) => emit('update:search', v)
})

const setTab = (value: 'bookmarks' | 'settings') => emit('update:tab', value)
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2 overflow-x-auto no-scrollbar mask-gradient-right">
      <Button
        v-for="group in visibleGroups"
        :key="group.id"
        variant="ghost"
        size="sm"
        class="rounded-full px-4 h-9 font-normal transition-all data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md"
        :data-active="activeGroupId === group.id ? 'true' : undefined"
        @click="emit('select-group', group.id)"
      >
        {{ group.name }}
      </Button>
    </div>

    <div class="flex items-center gap-2 shrink-0 ml-4">
      <Input
        v-if="!isUTools"
        class="w-64 h-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-input transition-all"
        v-model="search"
        placeholder="搜索..."
      />

      <div class="h-6 w-px bg-border mx-2"></div>

      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground hover:text-foreground"
        :class="{ 'bg-muted text-foreground': tab === 'bookmarks' }"
        @click="setTab('bookmarks')"
      >
        View
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground hover:text-foreground"
        :class="{ 'bg-muted text-foreground': tab === 'settings' }"
        @click="setTab('settings')"
      >
        Config
      </Button>

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

