<script setup lang="ts">
import { TRASH_GROUP_ID } from '@/stores/bookmark'

interface OutlineSubGroup {
  subGroupId: string
  subGroupName: string
  bookmarkCount: number
  anchorId: string
}

interface OutlineGroup {
  groupId: string
  groupName: string
  bookmarkCount: number
  children: OutlineSubGroup[]
}

const props = defineProps<{
  groups?: OutlineGroup[]
  activeAnchorId?: string
}>()

const emit = defineEmits<{
  (e: 'scroll-to', anchorId: string): void
  (e: 'edit-group', groupId: string): void
  (e: 'focus-search'): void
}>()

const store = useBookmarkStore()

// 如果没有传入 groups，从 store 计算（包含子分组）
const outlineGroups = computed<OutlineGroup[]>(() => {
  if (props.groups?.length) return props.groups

  return store.groups
    .filter(g => g.id !== TRASH_GROUP_ID)
    .map(group => {
      const children = group.children
        .filter(sub => (sub.bookmarkIds?.length || 0) > 0)
        .map(sub => ({
          subGroupId: sub.id,
          subGroupName: sub.name,
          bookmarkCount: sub.bookmarkIds?.length || 0,
          anchorId: `section-${group.id}-${sub.id}`,
        }))

      const bookmarkCount = children.reduce((sum, sub) => sum + sub.bookmarkCount, 0)

      return {
        groupId: group.id,
        groupName: group.name,
        bookmarkCount,
        children,
      }
    })
    .filter(g => g.bookmarkCount > 0)
})

const handleSubGroupClick = (anchorId: string) => {
  emit('scroll-to', anchorId)
  emit('focus-search')
}

const isSubGroupActive = (anchorId: string) => {
  if (!props.activeAnchorId) return false
  // 检查是否是当前激活 section 或其子 section
  return props.activeAnchorId === anchorId || anchorId.startsWith(`${props.activeAnchorId}-`)
}
</script>

<template>
  <aside class="shrink-0 w-36 flex flex-col overflow-y-auto no-scrollbar py-2 px-2 gap-1">
    <!-- Outline: Groups with SubGroups -->
    <div class="flex flex-col gap-2">
      <div
        v-for="group in outlineGroups"
        :key="group.groupId"
        class="flex flex-col gap-0.5"
      >
        <!-- Group Label -->
        <div class="px-2 py-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          {{ group.groupName }}
        </div>
        <!-- SubGroups -->
        <button
          v-for="sub in group.children"
          :key="sub.subGroupId"
          class="group-nav-item relative flex items-center gap-2 pl-5 pr-2 py-1 rounded-md text-left text-xs transition-colors duration-120"
          :class="{
            'group-nav-item--active': isSubGroupActive(sub.anchorId),
            'group-nav-item--idle': !isSubGroupActive(sub.anchorId),
          }"
          @click="handleSubGroupClick(sub.anchorId)"
        >
          <span class="truncate flex-1">{{ sub.subGroupName }}</span>
          <span
            v-if="sub.bookmarkCount > 0"
            class="shrink-0 text-[10px] text-muted-foreground/40 tabular-nums"
          >
            {{ sub.bookmarkCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- Trash -->
    <button
      class="mt-auto flex items-center gap-2 px-2 py-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
      :class="{ 'text-destructive bg-destructive/5': store.activeGroupId === TRASH_GROUP_ID }"
      @click="store.selectGroup(TRASH_GROUP_ID)"
    >
      <span class="i-ph-trash-thin text-sm" />
      <span>回收站</span>
    </button>
  </aside>
</template>

<style scoped>
.group-nav-item--idle {
  color: hsl(var(--muted-foreground));
}

.group-nav-item--idle:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.4);
}

.dark .group-nav-item--idle:hover {
  background-color: hsl(var(--muted) / 0.2);
}

.group-nav-item--active {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.7);
  font-weight: 500;
}

.dark .group-nav-item--active {
  background-color: hsl(var(--muted) / 0.4);
}

.group-nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 14px;
  border-radius: 0 2px 2px 0;
  background-color: hsl(var(--primary));
}

aside::-webkit-scrollbar {
  display: none;
}

aside {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
</style>
