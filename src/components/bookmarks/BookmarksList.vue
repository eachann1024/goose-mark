<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'
import BookmarkSkeleton from './BookmarkSkeleton.vue'
import { Copy, Edit3, ExternalLink, Trash2 } from 'lucide-vue-next'

interface BookmarkSection {
  groupId: string
  groupName: string
  subGroupId: string
  subGroupName: string
  bookmarks: Bookmark[]
  anchorId: string
}

const props = defineProps<{
  bookmarks: Bookmark[]
  selectedIndex: number
  isTrashActive: boolean
  showCommandHints?: boolean
  hintKeyById?: Record<string, string>
  highlightedId?: string | null
  readonly?: boolean
  clickableIcon?: boolean
  sections?: BookmarkSection[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', bookmark: Bookmark): void
  (e: 'edit', bookmark: Bookmark, el?: HTMLElement): void
  (e: 'open', bookmark: Bookmark): void
  (e: 'contextmenu', event: MouseEvent, bookmark: Bookmark): void
  (e: 'locate', bookmark: Bookmark): void
  (e: 'reorder', payload: { fromId: string; toId: string }): void
  (e: 'select', index: number): void
  (e: 'icon-click', bookmark: Bookmark): void
  (e: 'scroll-to-section', anchorId: string): void
}>()

const listRef = ref<HTMLElement | null>(null)

// desc 现在是纯文本;旧数据残留的 HTML 标签剥离,实体解码
const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
}
const renderDesc = (desc?: string): string => {
  if (!desc) return ''
  return desc
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => HTML_ENTITY_MAP[m] ?? m)
}

// 提取域名
const getDomain = (url: string): string => {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// 拖拽排序
let dragStartIndex = -1

const handleDragStart = (e: DragEvent, index: number) => {
  if (props.readonly) return
  dragStartIndex = index
  const bookmark = props.bookmarks[index]
  if (bookmark && e.dataTransfer) {
    e.dataTransfer.setData('text/bookmark-id', bookmark.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

const handleDragOver = (e: DragEvent, index: number) => {
  if (props.readonly) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

const handleDrop = (e: DragEvent, index: number) => {
  if (props.readonly) return
  e.preventDefault()
  if (dragStartIndex === -1 || dragStartIndex === index) {
    dragStartIndex = -1
    return
  }
  const fromId = props.bookmarks[dragStartIndex]?.id
  const toId = props.bookmarks[index]?.id
  if (fromId && toId) {
    emit('reorder', { fromId, toId })
  }
  dragStartIndex = -1
}

// 键盘选择
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = Math.min(props.selectedIndex + 1, props.bookmarks.length - 1)
    emit('select', next)
    scrollToIndex(next)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = Math.max(props.selectedIndex - 1, 0)
    emit('select', prev)
    scrollToIndex(prev)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const bookmark = props.bookmarks[props.selectedIndex]
    if (bookmark) emit('open', bookmark)
  }
}

const handleIconClick = (e: MouseEvent, bookmark: Bookmark) => {
  if (!props.clickableIcon) return
  e.stopPropagation()
  emit('icon-click', bookmark)
}

const DURATION = 300

const animateScroll = (target: number) => {
  const el = listRef.value
  if (!el) return
  const start = el.scrollTop
  const delta = target - start
  if (Math.abs(delta) < 1) { el.scrollTop = target; return }
  const startTime = performance.now()
  const tick = (now: number) => {
    const t = Math.min((now - startTime) / DURATION, 1)
    const ease = 1 - Math.pow(1 - t, 3) // easeOutCubic
    el.scrollTop = start + delta * ease
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const scrollItemToCenter = (item: Element) => {
  const el = listRef.value
  if (!el) return
  const top = (item as HTMLElement).offsetTop - el.clientHeight / 2 + (item as HTMLElement).clientHeight / 2
  animateScroll(Math.max(0, top))
}

const scrollToIndex = (index: number) => {
  nextTick(() => {
    const item = listRef.value?.querySelector(`[data-index="${index}"]`)
    if (item) scrollItemToCenter(item)
  })
}

watch(() => props.highlightedId, (id) => {
  if (!id) return
  nextTick(() => {
    const idx = props.bookmarks.findIndex(b => b.id === id)
    if (idx !== -1) {
      const item = listRef.value?.querySelector(`[data-index="${idx}"]`)
      item && scrollItemToCenter(item)
    }
  })
})

onMounted(() => {
  listRef.value?.focus()
})

// 计算全局索引映射，用于 sections 渲染时保持 data-index 一致
const getGlobalIndex = (sectionStartIndex: number, localIndex: number) => sectionStartIndex + localIndex

// 计算每个 section 的起始索引
const sectionStartIndices = computed(() => {
  if (!props.sections) return []
  const indices: number[] = []
  let offset = 0
  props.sections.forEach(section => {
    indices.push(offset)
    offset += section.bookmarks.length
  })
  return indices
})

const hasSections = computed(() => !!props.sections && props.sections.length > 0)
</script>

<template>
  <section
    ref="listRef"
    tabindex="0"
    class="flex-1 min-h-0 overflow-y-auto outline-none"
    @keydown="handleKeydown"
  >
    <!-- Skeleton loading state -->
    <template v-if="loading">
      <BookmarkSkeleton :count="6" show-headers />
      <BookmarkSkeleton :count="4" show-headers />
    </template>

    <!-- Sections mode (outline view) -->
    <template v-else-if="hasSections">
      <div class="flex flex-col pb-4">
        <div
          v-for="(section, sectionIdx) in sections"
          :key="section.anchorId"
          class="flex flex-col"
          :class="sections && sectionIdx < sections.length - 1 ? 'mb-[30px]' : ''"
        >
          <!-- Section Header -->
          <div
            :id="section.anchorId"
            class="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5"
          >
            <div class="w-1 h-3.5 rounded-full bg-primary/40 shrink-0" />
            <h3 class="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
              {{ section.groupName }}
            </h3>
            <span class="text-[10px] text-muted-foreground/30">·</span>
            <span class="text-[10px] text-muted-foreground/50">{{ section.subGroupName }}</span>
          </div>

          <!-- Section Bookmarks -->
          <ul class="flex flex-col">
            <li
              v-for="(bookmark, localIdx) in section.bookmarks"
              :key="bookmark.id + '-' + section.anchorId"
              :data-index="getGlobalIndex(sectionStartIndices[sectionIdx], localIdx)"
              :data-bookmark-id="bookmark.id"
              :data-active="selectedIndex === getGlobalIndex(sectionStartIndices[sectionIdx], localIdx)"
              :draggable="!hasSections"
              class="bookmark-list-item group relative flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none transition-colors duration-150"
              :class="{
                'is-selected': selectedIndex === getGlobalIndex(sectionStartIndices[sectionIdx], localIdx),
                'ring-1 ring-primary/30': highlightedId === bookmark.id,
              }"
              @click="emit('select', getGlobalIndex(sectionStartIndices[sectionIdx], localIdx))"
              @dblclick="emit('open', bookmark)"
              @contextmenu.prevent="emit('contextmenu', $event, bookmark)"
              @dragstart="handleDragStart($event, getGlobalIndex(sectionStartIndices[sectionIdx], localIdx))"
              @dragover="handleDragOver($event, getGlobalIndex(sectionStartIndices[sectionIdx], localIdx))"
              @drop="handleDrop($event, getGlobalIndex(sectionStartIndices[sectionIdx], localIdx))"
            >
              <!-- Command Hint -->
              <Transition
                enter-active-class="transition-all duration-150 ease-out"
                enter-from-class="opacity-0 scale-75"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition-all duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-75"
              >
                <span
                  v-if="showCommandHints && hintKeyById?.[bookmark.id]"
                  class="absolute -left-1 -top-1 z-10 h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow"
                >
                  {{ hintKeyById[bookmark.id] }}
                </span>
              </Transition>

              <!-- Icon -->
              <div
                class="shrink-0 mt-0.5"
                :class="{ 'cursor-pointer': props.clickableIcon }"
                @click="handleIconClick($event, bookmark)"
              >
                <BookmarkIcon
                  :icon="bookmark.icon"
                  :fallback-text="bookmark.title"
                  size="md"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm font-medium text-foreground truncate">
                      {{ bookmark.title }}
                    </span>
                    <span v-if="bookmark.pinned" class="i-ph-push-pin-thin text-primary text-[10px] shrink-0" />
                  </div>
                  <!-- Hover Actions (moved into content area for alignment) -->
                  <div
                    class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    @click.stop
                  >
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-7 w-7 text-muted-foreground hover:text-foreground"
                          @click.stop="emit('open', bookmark)"
                        >
                          <ExternalLink class="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>打开</p></TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-7 w-7 text-muted-foreground hover:text-foreground"
                          @click.stop="emit('edit', bookmark)"
                        >
                          <Edit3 class="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>编辑</p></TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-7 w-7 text-muted-foreground hover:text-destructive"
                          @click.stop="emit('remove', bookmark)"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>删除</p></TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div class="text-xs text-muted-foreground/70 font-mono truncate">
                  {{ getDomain(bookmark.url) }}
                </div>
                <div
                  v-if="bookmark.desc"
                  class="bookmark-desc-rendered text-[12px] text-muted-foreground/80 leading-relaxed mt-0.5 whitespace-pre-wrap"
                >{{ renderDesc(bookmark.desc) }}</div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <!-- Flat list mode (search overlay / legacy) -->
    <template v-else>
      <ul class="flex flex-col py-1">
        <li
          v-for="(bookmark, index) in bookmarks"
          :key="bookmark.id"
          :data-index="index"
          :data-bookmark-id="bookmark.id"
          :data-active="selectedIndex === index"
          draggable="true"
          class="bookmark-list-item group relative flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none transition-colors duration-150 border-b border-border/5 last:border-b-0"
          :class="{
            'is-selected': selectedIndex === index,
            'ring-1 ring-primary/30': highlightedId === bookmark.id,
          }"
          @click="emit('select', index)"
          @dblclick="emit('open', bookmark)"
          @contextmenu.prevent="emit('contextmenu', $event, bookmark)"
          @dragstart="handleDragStart($event, index)"
          @dragover="handleDragOver($event, index)"
          @drop="handleDrop($event, index)"
        >
          <!-- Command Hint -->
          <Transition
            enter-active-class="transition-all duration-150 ease-out"
            enter-from-class="opacity-0 scale-75"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition-all duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-75"
          >
            <span
              v-if="showCommandHints && hintKeyById?.[bookmark.id]"
              class="absolute -left-1 -top-1 z-10 h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow"
            >
              {{ hintKeyById[bookmark.id] }}
            </span>
          </Transition>

          <!-- Icon -->
          <div
            class="shrink-0 mt-0.5"
            :class="{ 'cursor-pointer': props.clickableIcon }"
            @click="handleIconClick($event, bookmark)"
          >
            <BookmarkIcon
              :icon="bookmark.icon"
              :fallback-text="bookmark.title"
              size="md"
            />
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm font-medium text-foreground truncate">
                  {{ bookmark.title }}
                </span>
                <span v-if="bookmark.pinned" class="i-ph-push-pin-thin text-primary text-[10px] shrink-0" />
              </div>
              <!-- Hover Actions -->
              <div
                class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                @click.stop
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 text-muted-foreground hover:text-foreground"
                      @click.stop="emit('open', bookmark)"
                    >
                      <ExternalLink class="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>打开</p></TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 text-muted-foreground hover:text-foreground"
                      @click.stop="emit('edit', bookmark)"
                    >
                      <Edit3 class="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>编辑</p></TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 text-muted-foreground hover:text-destructive"
                      @click.stop="emit('remove', bookmark)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>删除</p></TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div class="text-xs text-muted-foreground/70 font-mono truncate">
              {{ getDomain(bookmark.url) }}
            </div>
            <div
              v-if="bookmark.desc"
              class="bookmark-desc-rendered text-[12px] text-muted-foreground/80 leading-relaxed mt-0.5"
              v-html="renderDesc(bookmark.desc)"
            />
          </div>
        </li>
      </ul>
    </template>

    <!-- Empty State -->
    <div v-if="!loading && bookmarks.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground/40 mb-3">
        <span class="i-ph-bookmark-simple-thin text-2xl" />
      </div>
      <p class="text-sm text-muted-foreground">
        {{ isTrashActive ? '回收站是空的' : '还没有书签' }}
      </p>
      <p v-if="!isTrashActive" class="text-xs text-muted-foreground/60 mt-1">
        点击 + 按钮或粘贴链接添加
      </p>
    </div>
  </section>
</template>

<style scoped>
.bookmark-list-item:hover {
  background-color: hsl(var(--muted) / 0.5);
}

.dark .bookmark-list-item:hover {
  background-color: hsl(var(--muted) / 0.3);
}

.bookmark-list-item.is-selected {
  background-color: hsl(var(--primary) / 0.08);
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.22);
}

.dark .bookmark-list-item.is-selected {
  background-color: hsl(var(--primary) / 0.12);
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.30);
}

.bookmark-list-item.is-selected:hover {
  background-color: hsl(var(--primary) / 0.12);
}

.dark .bookmark-list-item.is-selected:hover {
  background-color: hsl(var(--primary) / 0.16);
}

.bookmark-desc-rendered :deep(p) {
  margin: 0.2em 0;
}

.bookmark-desc-rendered :deep(p:first-child) {
  margin-top: 0;
}

.bookmark-desc-rendered :deep(p:last-child) {
  margin-bottom: 0;
}

.bookmark-desc-rendered :deep(strong),
.bookmark-desc-rendered :deep(b) {
  font-weight: 600;
  color: hsl(var(--foreground) / 0.9);
}

.bookmark-desc-rendered :deep(em),
.bookmark-desc-rendered :deep(i) {
  font-style: italic;
}

.bookmark-desc-rendered :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bookmark-desc-rendered :deep(ul),
.bookmark-desc-rendered :deep(ol) {
  margin: 0.3em 0;
  padding-left: 1.2em;
}

.bookmark-desc-rendered :deep(li) {
  margin: 0.1em 0;
}

.bookmark-desc-rendered :deep(h1),
.bookmark-desc-rendered :deep(h2),
.bookmark-desc-rendered :deep(h3) {
  font-weight: 600;
  margin: 0.3em 0;
  color: hsl(var(--foreground) / 0.85);
}

.bookmark-desc-rendered :deep(h1) {
  font-size: 1.05em;
}

.bookmark-desc-rendered :deep(h2) {
  font-size: 1em;
}

.bookmark-desc-rendered :deep(h3) {
  font-size: 0.95em;
}

.bookmark-desc-rendered :deep(blockquote) {
  border-left: 2px solid hsl(var(--border));
  padding-left: 0.6em;
  margin: 0.3em 0;
  color: hsl(var(--muted-foreground));
}

.bookmark-desc-rendered :deep(code) {
  background: hsl(var(--muted));
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: ui-monospace, monospace;
}
</style>
