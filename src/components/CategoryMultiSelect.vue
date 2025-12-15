<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  modelValue: BookmarkLocation[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BookmarkLocation[]]
  close: []
}>()

const store = useBookmarkStore()

// 当前展开的分组
const expandedGroupId = ref<string>(store.groups[0]?.id ?? '')

// 选中的位置
const selectedLocations = ref<BookmarkLocation[]>([...props.modelValue])

// 监控 props 变化同步到本地
watch(() => props.modelValue, (val) => {
  selectedLocations.value = [...val]
}, { deep: true })

// 当前展开分组的子分组列表
const currentSubGroups = computed(() => {
  const group = store.groups.find(g => g.id === expandedGroupId.value)
  return group?.children ?? []
})

// 判断某个位置是否被选中
const isSelected = (groupId: string, subGroupId: string) => {
  return selectedLocations.value.some(
    loc => loc.groupId === groupId && loc.subGroupId === subGroupId
  )
}

// 切换选中状态
const toggleLocation = (groupId: string, subGroupId: string) => {
  if (props.readonly) return
  const idx = selectedLocations.value.findIndex(
    loc => loc.groupId === groupId && loc.subGroupId === subGroupId
  )
  if (idx >= 0) {
    selectedLocations.value.splice(idx, 1)
  } else {
    selectedLocations.value.push({ groupId, subGroupId })
  }
  emit('update:modelValue', [...selectedLocations.value])
}

// 移除单个已选位置
const removeLocation = (loc: BookmarkLocation) => {
  if (props.readonly) return
  selectedLocations.value = selectedLocations.value.filter(
    l => !(l.groupId === loc.groupId && l.subGroupId === loc.subGroupId)
  )
  emit('update:modelValue', [...selectedLocations.value])
}

// 获取位置显示名称
const getLocationLabel = (loc: BookmarkLocation) => {
  const group = store.groups.find(g => g.id === loc.groupId)
  const sub = group?.children.find(c => c.id === loc.subGroupId)
  return group && sub ? `${group.name} / ${sub.name}` : ''
}
</script>

<template>
  <div class="w-[460px] rounded-xl border border-border bg-popover shadow-lg overflow-hidden" @click.stop>
    <!-- 主体：左右分栏 -->
    <div class="flex h-[280px]">
      <!-- 左侧：一级分组列表 -->
      <div class="w-1/2 border-r border-border overflow-y-auto p-2">
        <div
          v-for="group in store.groups.filter(g => g.id !== TRASH_GROUP_ID)"
          :key="group.id"
          class="flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors"
          :class="{
            'bg-muted': expandedGroupId === group.id,
            'hover:bg-muted/50': expandedGroupId !== group.id
          }"
          @mouseenter="expandedGroupId = group.id"
        >
          <div class="flex items-center gap-2">
            <span 
              v-if="selectedLocations.some(loc => loc.groupId === group.id)"
              class="w-2 h-2 rounded-full bg-primary shrink-0"
            />
            <span class="text-sm font-medium">{{ group.name }}</span>
          </div>
          <span class="i-mdi-chevron-right text-muted-foreground" />
        </div>
      </div>

      <!-- 右侧：二级子分组列表（多选） -->
      <div class="w-1/2 overflow-y-auto p-2">
        <div
          v-for="sub in currentSubGroups"
          :key="sub.id"
          class="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50 text-left"
          @click="toggleLocation(expandedGroupId, sub.id)"
        >
          <span 
            class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
            :class="{
              'bg-primary border-primary text-primary-foreground': isSelected(expandedGroupId, sub.id),
              'border-muted-foreground/50': !isSelected(expandedGroupId, sub.id)
            }"
          >
            <span v-if="isSelected(expandedGroupId, sub.id)" class="i-mdi-check text-xs" />
          </span>
          <span class="text-sm text-left">{{ sub.name }}</span>
        </div>
        <div v-if="currentSubGroups.length === 0" class="flex items-center justify-center h-full text-muted-foreground text-sm">
          暂无子分组
        </div>
      </div>
    </div>

    <!-- 底部：已选显示 + 操作 -->
    <div class="border-t border-border px-4 py-3 bg-muted/20">
      <div class="flex items-center gap-2 flex-wrap min-h-[32px]">
        <template v-if="selectedLocations.length > 0">
          <div
            v-for="loc in selectedLocations"
            :key="`${loc.groupId}-${loc.subGroupId}`"
            class="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs"
          >
            <span>{{ getLocationLabel(loc) }}</span>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-destructive"
              @click.stop="removeLocation(loc)"
            >
              <span class="i-mdi-close text-sm" />
            </Button>
          </div>
        </template>
        <span v-else class="text-muted-foreground text-sm">请选择分类...</span>
      </div>
      
      <div class="flex items-center justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" class="w-16" @click="emit('close')">取消</Button>
        <Button size="sm" class="w-16" @click="emit('close')">确定</Button>
      </div>
    </div>
  </div>
</template>
