<script setup lang="ts">
import { TRASH_GROUP_ID } from '@/stores/bookmark'

const props = defineProps<{
  /** 列表模式下当前滚动定位到的分组锚点 */
  activeAnchorId?: string
  isUTools?: boolean
  isSettings?: boolean
}>()

const emit = defineEmits<{
  (e: 'scroll-to', anchorId: string): void
  (e: 'edit-group', groupId: string): void
  (e: 'focus-search'): void
  (e: 'open-settings'): void
}>()

const store = useBookmarkStore()

// 展开状态：默认展开当前激活分组
const expanded = ref<Record<string, boolean>>({})
watchEffect(() => {
  if (store.activeGroupId && store.activeGroupId !== TRASH_GROUP_ID) {
    if (expanded.value[store.activeGroupId] === undefined) {
      expanded.value = { ...expanded.value, [store.activeGroupId]: true }
    }
  }
})

interface TreeSub {
  id: string
  name: string
  count: number
  anchorId: string
}
interface TreeGroup {
  id: string
  name: string
  count: number
  children: TreeSub[]
}

const tree = computed<TreeGroup[]>(() =>
  store.groups
    .filter(g => g.id !== TRASH_GROUP_ID && !g.isDeleted)
    .map(group => {
      const children = group.children
        .filter(sub => !sub.isDeleted)
        .map(sub => {
          const count = sub.bookmarkIds
            .map(id => store.bookmarks.find(b => b.id === id))
            .filter(b => b && !b.isDeleted).length
          return {
            id: sub.id,
            name: sub.name,
            count,
            anchorId: `section-${group.id}-${sub.id}`,
          }
        })
      const count = children.reduce((sum, c) => sum + c.count, 0)
      return { id: group.id, name: group.name, count, children }
    })
)

const totalCount = computed(() =>
  store.bookmarks.filter(b => !b.isDeleted && !store.isBookmarkInTrash(b)).length
)

const isTrashActive = computed(() => store.activeGroupId === TRASH_GROUP_ID)

const toggleGroup = (groupId: string) => {
  expanded.value = { ...expanded.value, [groupId]: !expanded.value[groupId] }
}

const selectGroup = (groupId: string) => {
  store.selectGroup(groupId)
  if (!expanded.value[groupId]) {
    expanded.value = { ...expanded.value, [groupId]: true }
  }
}

const selectSub = (groupId: string, subId: string, anchorId: string) => {
  store.selectGroup(groupId)
  store.selectSubGroup(subId)
  // 列表模式下同时滚动定位
  emit('scroll-to', anchorId)
}

const isGroupActive = (groupId: string) =>
  !props.isSettings && store.activeGroupId === groupId && !isTrashActive.value

const isSubActive = (groupId: string, subId: string) =>
  !props.isSettings &&
  store.activeGroupId === groupId &&
  store.activeSubGroupId === subId &&
  !isTrashActive.value
</script>

<template>
  <aside
    class="app-sidebar shrink-0 flex flex-col bg-card/40 border-r border-border/40"
    :class="isUTools ? 'w-[208px]' : 'w-[228px]'"
  >
    <!-- 品牌头部 -->
    <div class="shrink-0 px-3.5 pt-3.5 pb-2 flex items-center gap-2.5 select-none">
      <Image src="/logo.png" alt="logo" class="w-[26px] h-[26px] rounded-md shrink-0" />
      <div class="min-w-0 leading-tight">
        <div class="text-[13.5px] font-semibold text-foreground truncate">鹅的书签</div>
        <div class="text-[10px] font-mono tracking-wider text-muted-foreground/60 truncate">
          {{ isUTools ? 'uTools 插件' : 'GOOSE MARKS' }}
        </div>
      </div>
    </div>

    <!-- 搜索触发 -->
    <div class="shrink-0 px-3 pt-1 pb-2">
      <button
        class="w-full h-[34px] flex items-center gap-2 px-2.5 rounded-lg border border-border bg-background/60 text-muted-foreground hover:bg-muted/50 transition-colors"
        @click="emit('focus-search')"
      >
        <span class="i-ph-magnifying-glass text-[15px]" />
        <span class="text-[13px] flex-1 text-left truncate">
          {{ isUTools ? '在主输入框搜索' : '搜索书签…' }}
        </span>
        <kbd
          v-if="!isUTools"
          class="text-[10px] font-mono text-muted-foreground/60 bg-muted/60 rounded px-1 py-0.5"
        >⌘K</kbd>
      </button>
    </div>

    <!-- 分组树 -->
    <nav class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 pt-1 pb-2">
      <div class="px-2 pb-1 pt-1 text-[10.5px] font-mono font-semibold uppercase tracking-wider text-muted-foreground/50">
        分组
      </div>
      <template v-for="group in tree" :key="group.id">
        <!-- 一级分组 -->
        <button
          class="nav-item w-full flex items-center gap-2 px-2 h-8 rounded-md text-left transition-colors"
          :class="isGroupActive(group.id) ? 'nav-item--active' : 'nav-item--idle'"
          @click="selectGroup(group.id)"
        >
          <span class="i-ph-folder text-[15px] shrink-0 opacity-80" />
          <span class="flex-1 truncate text-[13px] font-medium">{{ group.name }}</span>
          <span v-if="group.count" class="text-[11px] font-mono text-muted-foreground/50 tabular-nums">{{ group.count }}</span>
          <span
            v-if="group.children.length"
            class="i-ph-caret-down text-[12px] shrink-0 transition-transform duration-200"
            :class="expanded[group.id] ? '' : '-rotate-90'"
            @click.stop="toggleGroup(group.id)"
          />
        </button>
        <!-- 二级子分组 -->
        <div
          v-if="expanded[group.id] && group.children.length"
          class="ml-[15px] pl-2.5 border-l border-border/50 my-0.5 flex flex-col gap-0.5"
        >
          <button
            v-for="sub in group.children"
            :key="sub.id"
            class="nav-item flex items-center gap-2 px-2 h-7 rounded-md text-left transition-colors"
            :class="isSubActive(group.id, sub.id) ? 'nav-item--active' : 'nav-item--idle'"
            @click="selectSub(group.id, sub.id, sub.anchorId)"
          >
            <span class="flex-1 truncate text-[12.5px]">{{ sub.name }}</span>
            <span v-if="sub.count" class="text-[10.5px] font-mono text-muted-foreground/45 tabular-nums">{{ sub.count }}</span>
          </button>
        </div>
      </template>

      <!-- 回收站 -->
      <button
        class="nav-item w-full flex items-center gap-2 px-2 h-8 rounded-md text-left transition-colors mt-2"
        :class="isTrashActive ? 'nav-item--trash-active' : 'nav-item--idle'"
        @click="store.selectGroup(TRASH_GROUP_ID)"
      >
        <span class="i-ph-trash text-[15px] shrink-0 opacity-80" />
        <span class="flex-1 truncate text-[13px]">回收站</span>
      </button>
    </nav>

    <!-- 底部栏：设置 + 计数 -->
    <div class="shrink-0 flex items-center gap-1 px-3 h-11 border-t border-border/40">
      <button
        class="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        :class="{ 'bg-muted/60 text-foreground': isSettings }"
        title="设置"
        @click="emit('open-settings')"
      >
        <span class="i-ph-gear text-[16px]" />
      </button>
      <div class="flex-1" />
      <span class="text-[11px] font-mono text-muted-foreground/50 tabular-nums">{{ totalCount }} 个书签</span>
    </div>
  </aside>
</template>

<style scoped>
.nav-item--idle {
  color: hsl(var(--muted-foreground));
}
.nav-item--idle:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.5);
}
.dark .nav-item--idle:hover {
  background-color: hsl(var(--muted) / 0.3);
}
.nav-item--active {
  color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.1);
  font-weight: 500;
}
.nav-item--trash-active {
  color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.08);
}
.app-sidebar::-webkit-scrollbar,
.app-sidebar nav::-webkit-scrollbar {
  display: none;
}
</style>
