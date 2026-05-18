<script setup lang="ts">
import { TRASH_GROUP_ID } from '@/stores/bookmark'

const store = useBookmarkStore()

const activeGroup = computed(() => store.groups.find(g => g.id === store.activeGroupId))
const subGroups = computed(() => activeGroup.value?.children ?? [])
const shouldShow = computed(() => subGroups.value.length > 1 && store.activeGroupId !== TRASH_GROUP_ID)

const isActive = (subId: string) => store.activeSubGroupId === subId
const bookmarkCount = (subId: string) => {
  const sub = subGroups.value.find(s => s.id === subId)
  return sub?.bookmarkIds?.length ?? 0
}
</script>

<template>
  <aside
    v-if="shouldShow"
    class="shrink-0 w-32 flex flex-col overflow-y-auto no-scrollbar py-2 px-2 gap-0.5"
  >
    <button
      v-for="sub in subGroups"
      :key="sub.id"
      class="subgroup-nav-item relative flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors duration-120"
      :class="{
        'subgroup-nav-item--active': isActive(sub.id),
        'subgroup-nav-item--idle': !isActive(sub.id),
      }"
      @click="store.selectSubGroup(sub.id)"
    >
      <span class="truncate flex-1">{{ sub.name }}</span>
      <span
        v-if="bookmarkCount(sub.id) > 0"
        class="shrink-0 text-[10px] text-muted-foreground/40 tabular-nums"
      >
        {{ bookmarkCount(sub.id) }}
      </span>
    </button>
  </aside>
</template>

<style scoped>
.subgroup-nav-item--idle {
  color: hsl(var(--muted-foreground));
}

.subgroup-nav-item--idle:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.4);
}

.dark .subgroup-nav-item--idle:hover {
  background-color: hsl(var(--muted) / 0.2);
}

.subgroup-nav-item--active {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.7);
  font-weight: 500;
}

.dark .subgroup-nav-item--active {
  background-color: hsl(var(--muted) / 0.4);
}

.subgroup-nav-item--active::before {
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
