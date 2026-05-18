<script setup lang="ts">
import type { BookmarkLocation } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'

const props = defineProps<{
  modelValue: BookmarkLocation[]
  readonly?: boolean
  inline?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BookmarkLocation[]]
  close: []
}>()

const store = useBookmarkStore()

// 选中的位置
const selectedLocations = ref<BookmarkLocation[]>([...props.modelValue])

// 监控 props 变化同步到本地
watch(() => props.modelValue, (val) => {
  selectedLocations.value = [...val]
}, { deep: true })

// 过滤掉回收站的父分组
const displayGroups = computed(() =>
  store.groups.filter(g => g.id !== TRASH_GROUP_ID)
)

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

// 获取位置显示名称（只显示子分组名）
const getLocationLabel = (loc: BookmarkLocation) => {
  const group = store.groups.find(g => g.id === loc.groupId)
  const sub = group?.children.find(c => c.id === loc.subGroupId)
  return sub?.name ?? ''
}
</script>

<template>
  <div
    :class="[
      'overflow-hidden',
      inline
        ? 'w-full rounded-2xl bg-background/60 p-3'
        : 'w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border-0 bg-popover shadow-2xl p-3'
    ]"
    @click.stop
  >
    <!-- 平铺子分组网格 -->
    <div
      :class="[
        inline ? '' : 'overflow-y-auto max-h-[300px]'
      ]"
    >
      <div class="flex flex-col gap-4">
        <div
          v-for="group in displayGroups"
          :key="group.id"
          class="flex flex-col gap-2"
        >
          <!-- 父分组小标题 -->
          <div class="flex items-center gap-1.5 px-1">
            <span class="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
            <span class="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              {{ group.name }}
            </span>
          </div>

          <!-- 子分组平铺网格 -->
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="sub in group.children"
              :key="sub.id"
              type="button"
              class="subgroup-chip flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-all"
              :class="{
                'subgroup-chip--selected': isSelected(group.id, sub.id),
                'subgroup-chip--idle': !isSelected(group.id, sub.id)
              }"
              @click="toggleLocation(group.id, sub.id)"
            >
              <span
                class="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors"
                :class="{
                  'bg-primary border-primary text-primary-foreground': isSelected(group.id, sub.id),
                  'border-muted-foreground/30': !isSelected(group.id, sub.id)
                }"
              >
                <span v-if="isSelected(group.id, sub.id)" class="i-ph-check-thin text-[10px]" />
              </span>
              <span class="truncate">{{ sub.name }}</span>
            </button>
          </div>
        </div>

        <div v-if="displayGroups.length === 0" class="flex items-center justify-center py-8 text-muted-foreground text-sm">
          暂无分组
        </div>
      </div>
    </div>

    <!-- 底部：已选显示（inline 模式也显示） -->
    <div
      v-if="selectedLocations.length > 0"
      class="px-1 pt-3 mt-2 border-t border-border/30"
    >
      <div class="flex items-center gap-1.5 flex-wrap">
        <div
          v-for="loc in selectedLocations"
          :key="`${loc.groupId}-${loc.subGroupId}`"
          class="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium shrink-0"
        >
          <span class="truncate">{{ getLocationLabel(loc) }}</span>
          <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-primary/60 hover:text-destructive"
            @click.stop="removeLocation(loc)"
          >
            <span class="i-ph-x-thin text-[10px]" />
          </Button>
        </div>
      </div>
    </div>

    <!-- 底部按钮（仅弹窗模式） -->
    <div
      v-if="!inline"
      class="border-t border-border/40 px-1 pt-2.5 mt-2"
    >
      <div class="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" class="w-16" @click="emit('close')">取消</Button>
        <Button size="sm" class="w-16" @click="emit('close')">确定</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.subgroup-chip {
  transition: all 0.15s ease;
}

.subgroup-chip--idle {
  background: hsl(var(--muted) / 0.3);
  color: hsl(var(--foreground));
  border: 1px solid transparent;
}

.subgroup-chip--idle:hover {
  background: hsl(var(--muted) / 0.6);
  border-color: hsl(var(--border));
}

.subgroup-chip--selected {
  background: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
  border: 1px solid hsl(var(--primary) / 0.25);
}

.dark .subgroup-chip--selected {
  background: hsl(var(--primary) / 0.15);
  border-color: hsl(var(--primary) / 0.3);
  box-shadow: 0 0 8px hsl(var(--primary) / 0.1);
}
</style>
