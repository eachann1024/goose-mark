<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'
import { ExternalLink, Edit3, Trash2, Copy, MapPin } from 'lucide-vue-next'

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
    <aside
      v-if="bookmark"
      class="shrink-0 flex flex-col border-l border-border/50 bg-card/30"
      :style="{ width: (props.width ?? 256) + 'px' }"
    >
      <!-- Header -->
      <div class="shrink-0 p-4 flex flex-col items-center gap-3 border-b border-border/30 relative">
        <button
          class="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="收起详情"
          @click="emit('toggle-collapse')"
        >
          <span class="i-ph-caret-right-thin text-sm" />
        </button>
        <button
          class="rounded-2xl transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title="打开书签"
          @click="emit('open', bookmark)"
        >
          <BookmarkIcon
            :icon="bookmark.icon"
            :fallback-text="bookmark.title"
            size="custom"
            custom-size-class="w-14 h-14 rounded-2xl"
          />
        </button>
        <div class="text-center">
          <h3 class="text-sm font-semibold text-foreground leading-tight">
            {{ bookmark.title }}
          </h3>
          <p class="text-[11px] text-muted-foreground mt-0.5 font-mono truncate max-w-[200px]">
            {{ bookmark.url }}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="shrink-0 px-3 py-2 flex items-center justify-center gap-1 border-b border-border/30">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 text-xs gap-1.5"
          @click="emit('open', bookmark)"
        >
          <ExternalLink class="w-3.5 h-3.5" />
          打开
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 text-xs gap-1.5"
          @click="emit('edit', bookmark)"
        >
          <Edit3 class="w-3.5 h-3.5" />
          编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
          @click="emit('remove', bookmark)"
        >
          <Trash2 class="w-3.5 h-3.5" />
          删除
        </Button>
      </div>

      <!-- Details -->
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <!-- Description (editable) -->
        <div v-if="bookmark.desc || descEditing">
          <label class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">简介</label>
          <div
            v-if="descEditing"
            ref="descInputRef"
            class="mt-1 text-xs text-foreground/80 leading-relaxed min-h-[3em] p-2 rounded-md bg-muted/40 outline-none focus:ring-1 focus:ring-primary/30"
            contenteditable
            @blur="commitDesc"
            @keydown="onDescKeydown"
          >{{ descDraft }}</div>
          <p
            v-else
            class="text-xs text-foreground/80 mt-1 leading-relaxed cursor-text hover:bg-muted/30 rounded px-1 -mx-1 py-0.5 transition-colors"
            @click="startEditDesc"
          >{{ bookmark.desc }}</p>
        </div>

        <!-- Tags -->
        <div v-if="bookmark.tags && bookmark.tags.length > 0">
          <label class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">标签</label>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            <span
              v-for="tag in bookmark.tags"
              :key="tag"
              class="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 text-[11px] text-muted-foreground"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Location -->
        <div v-if="getLocationLabel(bookmark)">
          <label class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">位置</label>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <MapPin class="w-3 h-3" />
            <span>{{ getLocationLabel(bookmark) }}</span>
          </div>
        </div>

        <!-- URL Copy -->
        <div>
          <label class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">链接</label>
          <button
            class="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
            @click="emit('copy-url', bookmark)"
          >
            <Copy class="w-3 h-3 shrink-0" />
            <span class="truncate">{{ bookmark.url }}</span>
          </button>
        </div>
      </div>
    </aside>
  </Transition>
</template>
