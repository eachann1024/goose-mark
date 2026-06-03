<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'

const props = defineProps<{
  bookmark: Bookmark | null
  isTrashActive: boolean
  width?: number
}>()

const emit = defineEmits<{
  (e: 'open', bookmark: Bookmark): void
  (e: 'edit', bookmark: Bookmark): void
  (e: 'remove', bookmark: Bookmark): void
  (e: 'copy-url', bookmark: Bookmark): void
  (e: 'locate', bookmark: Bookmark): void
  (e: 'toggle-collapse'): void
  (e: 'update-desc', bookmark: Bookmark, desc: string): void
}>()

const store = useBookmarkStore()
const settingsStore = useSettingsStore()

const descEditing = ref(false)
const descDraft = ref('')

const getLocationLabel = (bookmark: Bookmark): string => {
  if (!bookmark.locations || bookmark.locations.length === 0) return ''
  const loc = bookmark.locations[0]
  const group = store.groups.find(g => g.id === loc.groupId)
  const sub = group?.children.find(c => c.id === loc.subGroupId)
  if (group && sub) {
    return `${group.name} / ${sub.name}`
  }
  return ''
}

const startEditDesc = () => {
  if (!props.bookmark) return
  descDraft.value = props.bookmark.desc || ''
  descEditing.value = true
}

const commitDesc = () => {
  if (!props.bookmark) return
  descEditing.value = false
  const trimmed = descDraft.value.trim()
  if (trimmed !== (props.bookmark.desc || '')) {
    emit('update-desc', props.bookmark, trimmed)
  }
}

const onDescKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitDesc()
  }
  if (e.key === 'Escape') {
    descEditing.value = false
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-x-4"
    enter-to-class="opacity-100 translate-x-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-x-0"
    leave-to-class="opacity-0 translate-x-4"
  >
    <!-- 外层容器：始终渲染，内部切换有/无选中态 -->
    <aside
      class="shrink-0 flex flex-col border-l border-border/50"
      :class="bookmark ? 'bg-card/30' : 'bg-card/20'"
      :style="{ width: (props.width ?? 256) + 'px' }"
    >
      <!-- 书签已选中态 -->
      <template v-if="bookmark">
      <!-- 头部：图标 + 标题 + URL -->
      <div class="shrink-0 px-4 pt-5 pb-4 flex flex-col items-center border-b border-border/30 relative" style="gap: 11px;">
        <!-- 收起按钮 -->
        <button
          class="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="收起详情"
          @click="emit('toggle-collapse')"
        >
          <span class="i-ph-caret-right-thin text-sm" />
        </button>

        <!-- 图标 Tile 56×56，圆角 14px -->
        <button
          class="rounded-[14px] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title="打开书签"
          @click="emit('open', bookmark)"
        >
          <BookmarkIcon
            :icon="bookmark.icon"
            :fallback-text="bookmark.title"
            size="custom"
            custom-size-class="w-14 h-14 rounded-[14px]"
          />
        </button>

        <!-- 标题 + URL -->
        <div class="text-center w-full px-1">
          <h3 class="bookmark-preview__title text-[15px] font-semibold text-foreground leading-tight" style="font-family: var(--font-serif);">
            {{ bookmark.title }}
          </h3>
          <a
            class="block text-[11.5px] text-primary font-mono truncate max-w-full mt-1 hover:underline cursor-pointer"
            :href="bookmark.url"
            target="_blank"
            rel="noopener noreferrer"
            @click.prevent="emit('open', bookmark)"
          >
            {{ bookmark.url }}
          </a>
        </div>
      </div>

      <!-- 操作按钮行 -->
      <div class="shrink-0 px-3 border-b border-border/30" style="padding-top: 16px; padding-bottom: 16px;">
        <div class="flex items-center" style="gap: 7px;">
          <!-- 打开：主按钮，flex-1，h-34px，珊瑚 -->
          <button
            class="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg transition-colors hover:bg-primary/90 active:scale-[0.98]"
            style="height: 34px;"
            @click="emit('open', bookmark)"
          >
            <span class="i-ph-arrow-square-out text-sm" />
            打开
          </button>

          <!-- 复制 URL：次级方按钮 34×34 -->
          <button
            class="inline-flex items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted rounded-lg transition-colors active:scale-[0.98]"
            style="width: 34px; height: 34px;"
            title="复制链接"
            @click="emit('copy-url', bookmark)"
          >
            <span class="i-ph-copy text-sm" />
          </button>

          <!-- 编辑：次级方按钮 34×34 -->
          <button
            class="inline-flex items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted rounded-lg transition-colors active:scale-[0.98]"
            style="width: 34px; height: 34px;"
            title="编辑书签"
            @click="emit('edit', bookmark)"
          >
            <span class="i-ph-pencil-simple text-sm" />
          </button>

          <!-- 删除：危险方按钮 34×34 -->
          <button
            class="inline-flex items-center justify-center border border-border bg-card text-destructive hover:bg-destructive/10 rounded-lg transition-colors active:scale-[0.98]"
            style="width: 34px; height: 34px;"
            title="删除书签"
            @click="emit('remove', bookmark)"
          >
            <span class="i-ph-trash text-sm" />
          </button>
        </div>
      </div>

      <!-- 详情内容 -->
      <div class="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-[18px]">

        <!-- 笔记区 -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-[10.5px] font-mono font-medium uppercase tracking-wider text-muted-foreground">笔记</label>
            <button
              class="text-[11px] text-primary hover:underline transition-colors"
              @click="descEditing ? commitDesc() : startEditDesc()"
            >
              {{ descEditing ? '完成' : '编辑' }}
            </button>
          </div>
          <textarea
            v-if="descEditing"
            v-model="descDraft"
            class="w-full text-[13px] text-foreground/80 leading-relaxed rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary/30 resize-none transition-colors"
            style="min-height: 96px;"
            placeholder="添加笔记…"
            @blur="commitDesc"
            @keydown="onDescKeydown"
          />
          <p
            v-else
            class="text-[13px] text-foreground/70 leading-relaxed cursor-text hover:bg-muted/30 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
            :class="{ 'text-muted-foreground/50 italic': !bookmark.desc }"
            @click="startEditDesc"
          >
            {{ bookmark.desc || '点击添加笔记…' }}
          </p>
        </div>

        <!-- 标签区 -->
        <div v-if="bookmark.tags && bookmark.tags.length > 0">
          <label class="text-[10.5px] font-mono font-medium uppercase tracking-wider text-muted-foreground block mb-1.5">标签</label>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in bookmark.tags"
              :key="tag"
              class="inline-flex items-center gap-1 px-[9px] py-[3px] rounded-md bg-muted text-muted-foreground text-[12px]"
            >
              <span class="i-ph-tag text-[10px]" />
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- 元数据/位置区 -->
        <div class="space-y-0">
          <!-- 位置 -->
          <div
            v-if="getLocationLabel(bookmark)"
            class="flex items-center justify-between py-[7px] border-b border-border/50"
          >
            <span class="text-[12px] text-muted-foreground">位置</span>
            <span class="text-[12.5px] text-foreground/80 truncate max-w-[55%] text-right">{{ getLocationLabel(bookmark) }}</span>
          </div>

          <!-- 链接（点击复制） -->
          <div class="flex items-center justify-between py-[7px] border-b border-border/50">
            <span class="text-[12px] text-muted-foreground">链接</span>
            <button
              class="inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline truncate max-w-[55%]"
              @click="emit('copy-url', bookmark)"
            >
              <span class="i-ph-link text-[11px] shrink-0" />
              <span class="truncate">复制链接</span>
            </button>
          </div>
        </div>

        <!-- 在分组中定位 -->
        <button
          v-if="getLocationLabel(bookmark)"
          class="w-full inline-flex items-center justify-center gap-2 h-8 rounded-lg border border-border bg-card text-muted-foreground text-[12px] hover:bg-muted hover:text-foreground transition-colors"
          @click="emit('locate', bookmark)"
        >
          <span class="i-ph-folder text-sm" />
          在分组中定位
        </button>
      </div>
      </template>

      <!-- 空态：未选中书签 -->
      <template v-else>
        <div class="flex-1 grid place-items-center text-center px-6">
          <div>
            <span class="i-ph-sidebar text-3xl text-muted-foreground/40 block mx-auto mb-3" />
            <p class="text-[13px] text-muted-foreground/60 leading-relaxed">选择一个书签<br>查看详情</p>
          </div>
        </div>
      </template>
    </aside>
  </Transition>
</template>
