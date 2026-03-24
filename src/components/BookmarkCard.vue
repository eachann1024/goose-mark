<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'

const settingsStore = useSettingsStore()

const props = defineProps<{ 
  bookmark: Bookmark; 
  selected?: boolean; 
  showHint?: boolean; 
  hintKey?: string; 
  readonly?: boolean; 
  index?: number; 
  gridColumns?: number;
  showEdit?: boolean;
  showDelete?: boolean;
  showLocate?: boolean;
  highlighted?: boolean;
  selectionVariant?: 'default' | 'search';
}>()
const emit = defineEmits<{
  edit: [Bookmark, HTMLElement | undefined]
  remove: [Bookmark]
  contextmenu: [MouseEvent]
  open: [Bookmark]
  locate: [Bookmark]
}>()

const isEmptyDesc = computed(() => !props.bookmark.desc || props.bookmark.desc.trim().length === 0)

const cardEl = ref<InstanceType<typeof Card> | null>(null)
const titleEl = ref<HTMLElement | null>(null)
const descEl = ref<HTMLElement | null>(null)
const isDescTruncated = ref(false)
const isTitleTruncated = ref(false)
let fallbackToastEl: HTMLDivElement | null = null
let resizeObserver: ResizeObserver | null = null

const clearFallbackToast = () => {
  if (fallbackToastEl) {
    fallbackToastEl.style.opacity = '0'
    fallbackToastEl.style.transform = 'translateY(4px)'
    const el = fallbackToastEl
    fallbackToastEl = null
    window.setTimeout(() => el.remove(), 150)
  }
}

const showFallbackToast = (title: string, desc: string, anchor?: HTMLElement) => {
  if (fallbackToastEl) return 
  
  // 计算字数和位置
  const totalLen = (title?.length || 0) + (desc?.length || 0)
  const cols = props.gridColumns || 3
  const colIndex = props.index !== undefined ? props.index % cols : 0
  
  // 决定显示模式: 40字以内统一置顶; 长文本根据列数平分左右 (左侧优先)
  let mode: 'top' | 'right' | 'left' = 'top'
  if (totalLen >= 40) {
    // 3列: 0->右, 1,2->左 | 4列: 0,1->右, 2,3->左 | 5列: 0,1->右, 2,3,4->左
    mode = colIndex < Math.floor(cols / 2) ? 'right' : 'left'
  }
  
  const el = document.createElement('div')
  
  const getCssVar = (name: string, fallback: string) => {
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!val) return fallback
    if (/^\d+\.?\d*\s+\d+\.?\d*%\s+\d+\.?\d*%$/.test(val)) {
      return `hsl(${val})`
    }
    return val
  }
  
  const bg = getCssVar('--card', 'rgba(24,24,27,0.92)')
  const border = getCssVar('--border', 'rgba(255,255,255,0.08)')
  const fg = getCssVar('--foreground', '#e5e7eb')
  const primary = getCssVar('--primary', '#3b82f6')

  el.style.maxWidth = '420px'
  el.style.padding = '12px 16px'
  const radius = getCssVar('--radius-xl', '12px')
  el.style.borderRadius = radius
  el.style.background = bg
  el.style.color = fg
  el.style.fontSize = '13px'
  el.style.lineHeight = '1.5'
  el.style.boxShadow = '0 12px 36px rgba(0,0,0,0.32)'
  el.style.backdropFilter = 'blur(10px)'
  el.style.border = `1px solid ${border}`
  el.style.zIndex = '9999'
  el.style.pointerEvents = 'none'
  el.style.opacity = '0'
  // 根据显示方向设置初始偏移
  if (mode === 'top') {
    el.style.transform = 'translateY(8px)'
  } else if (mode === 'right') {
    el.style.transform = 'translateX(-8px)'
  } else {
    el.style.transform = 'translateX(8px)'
  }
  el.style.transition = 'opacity 120ms ease, transform 120ms ease'
  el.style.position = 'fixed'

  // 安全地构建内容
  if (title) {
    const titleDiv = document.createElement('div')
    titleDiv.style.fontWeight = '600'
    titleDiv.style.color = primary
    titleDiv.style.marginBottom = '4px'
    titleDiv.style.fontSize = '14px'
    titleDiv.textContent = title
    el.appendChild(titleDiv)
  }
  if (desc) {
    const descDiv = document.createElement('div')
    descDiv.style.opacity = '0.9'
    descDiv.style.whiteSpace = 'pre-wrap'
    descDiv.style.wordBreak = 'break-word'
    descDiv.textContent = desc
    el.appendChild(descDiv)
  }
  
  document.body.appendChild(el)

  const anchorRect = anchor?.getBoundingClientRect()
  const toastRect = el.getBoundingClientRect()
  const gap = 12 // tooltip 与书签之间的间距
  
  let left: number
  let top: number
  
  if (anchorRect) {
    if (mode === 'top') {
      // 顶部显示：居中对齐
      left = anchorRect.left + (anchorRect.width - toastRect.width) / 2
      top = anchorRect.top - toastRect.height - gap
    } else if (mode === 'right') {
      // 右侧显示：tooltip 左边缘在书签右边缘 + gap
      left = anchorRect.right + gap
      top = anchorRect.top + (anchorRect.height - toastRect.height) / 2
    } else {
      // 左侧显示：tooltip 右边缘在书签左边缘 - gap
      left = anchorRect.left - toastRect.width - gap
      top = anchorRect.top + (anchorRect.height - toastRect.height) / 2
    }
  } else {
    left = window.innerWidth - toastRect.width - 16
    top = window.innerHeight - toastRect.height - 16
  }
  
  // 边界保护：确保不超出屏幕
  const maxLeft = window.innerWidth - toastRect.width - 8
  const maxTop = window.innerHeight - toastRect.height - 8
  top = Math.max(8, Math.min(top, maxTop))
  left = Math.max(8, Math.min(left, maxLeft))
  
  el.style.top = `${top}px`
  el.style.left = `${left}px`
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = mode === 'top' ? 'translateY(0)' : 'translateX(0)'
  })
  fallbackToastEl = el
}

const onCardEnter = () => {
  checkTruncate()
  
  const showTitle = isTitleTruncated.value
  const showDesc = isDescTruncated.value && props.bookmark.desc
  
  // 只有在标题或描述被截断时才显示 tooltip
  if (!showTitle && !showDesc) return
  
  const anchor = (cardEl.value?.$el ?? cardEl.value) as HTMLElement | undefined
  showFallbackToast(
    showTitle ? props.bookmark.title : '',
    showDesc ? props.bookmark.desc || '' : '',
    anchor
  )
}

const hideDescToast = () => {
  clearFallbackToast()
}

const checkTruncate = () => {
  // Title check
  if (titleEl.value) {
    isTitleTruncated.value = titleEl.value.scrollWidth > titleEl.value.clientWidth + 1
  }

  // Desc check
  const el = descEl.value
  if (!el) {
    isDescTruncated.value = false
    return
  }
  const horizOverflow = el.scrollWidth - el.clientWidth > 1
  const vertOverflow = el.scrollHeight - el.clientHeight > 1
  const descLen = props.bookmark.desc?.length ?? 0
  const approxCharCap = Math.max(30, Math.floor(el.clientWidth / 7))
  const heuristicOverflow = descLen > approxCharCap
  isDescTruncated.value = horizOverflow || vertOverflow || heuristicOverflow
}

onMounted(() => nextTick(checkTruncate))
onMounted(() => {
  nextTick(() => {
    const targets = [descEl.value, titleEl.value].filter((t): t is HTMLElement => !!t)
    if (targets.length === 0) return
    resizeObserver = new ResizeObserver(() => checkTruncate())
    targets.forEach(t => resizeObserver?.observe(t))
  })
})

watch(
  () => [props.bookmark.title, props.bookmark.desc],
  () => nextTick(checkTruncate)
)

onBeforeUnmount(() => {
  clearFallbackToast()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

const openLink = () => {
  emit('open', props.bookmark)
}

const copyUrl = async () => {
  try {
    if (!navigator.clipboard) {
      notify('当前环境不支持剪贴板复制')
      return
    }
    await navigator.clipboard.writeText(props.bookmark.url)
    notify('已复制链接')
  } catch {
    notify('复制失败，请检查权限后重试')
  }
}

const canLocate = computed(() => props.showLocate ?? false)

const DAY_IN_MS = 24 * 60 * 60 * 1000

const ageVariant = computed(() => {
  const updatedAt = Number(props.bookmark.updatedAt)
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 'aged'

  const elapsed = Math.max(0, Date.now() - updatedAt)

  if (elapsed <= 3 * DAY_IN_MS) return 'fresh'
  if (elapsed <= 15 * DAY_IN_MS) return 'recent'
  if (elapsed <= 30 * DAY_IN_MS) return 'warm'
  return 'aged'
})

const ageCardClass = computed(() => {
  if (!settingsStore.agingCardEnabled) return ''
  return `bookmark-card--${ageVariant.value}`
})

const selectedCardClass = computed(() => {
  if (!props.selected) return ''
  if (props.selectionVariant === 'search') {
    return 'bookmark-card--selected-search'
  }
  return 'bookmark-card--selected'
})
</script>

<template>
  <Card
    ref="cardEl"
    class="bookmark-card relative group hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-center select-none"
    :class="[
      ageCardClass,
      selected ? selectedCardClass : 'bookmark-card--hoverable'
    ]"
    @click="openLink"
    @contextmenu.prevent="emit('contextmenu', $event)"
    @mouseenter="onCardEnter"
    @mouseleave="hideDescToast"
  >
    <!-- Snake Border Animation -->
    <Transition
      enter-active-class="transition-opacity duration-300 ease-in"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-500 ease-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="highlighted" class="absolute inset-0 pointer-events-none z-0">
        <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <rect
            width="100%"
            height="100%"
            rx="var(--radius-xl)"
            fill="none"
            stroke="hsl(var(--primary))"
            stroke-width="3"
            stroke-dasharray="250"
            stroke-dashoffset="0"
            class="animate-snake-border"
          />
        </svg>
      </div>
    </Transition>
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 scale-75"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-75"
    >
      <div
        v-if="showHint && hintKey"
        class="absolute top-1.5 right-1.5 z-20 h-6 min-w-[24px] px-2 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow"
      >
        {{ hintKey }}
      </div>
    </Transition>
    <div class="px-4 py-3 flex gap-3 items-center">
       <!-- Icon -->
       <div class="shrink-0">
          <BookmarkIcon 
            :icon="bookmark.icon"
            :fallback-text="bookmark.title"
            size="md"
          />
       </div>

      <div
        class="flex-1 min-w-0 flex flex-col justify-center"
        :class="isEmptyDesc ? 'items-start gap-0' : 'gap-0.5'"
      >
          <template v-if="isEmptyDesc">
            <h3
              ref="titleEl"
              class="font-semibold text-base leading-snug truncate text-foreground w-full max-w-full"
            >
              {{ bookmark.title }}
            </h3>
          </template>
          <template v-else>
            <div class="flex items-center justify-between">
            <h3 ref="titleEl" class="font-medium text-sm truncate pr-2 text-foreground break-all cursor-pointer">
                {{ bookmark.title }}
              </h3>
              <span v-if="bookmark.pinned" class="i-mdi-pin text-primary text-[10px] shrink-0" />
            </div>
            <p
              ref="descEl"
              class="text-[10px] text-muted-foreground truncate min-h-[16px] leading-[1.2] cursor-pointer"
            >
              {{ bookmark.desc || ' ' }}
            </p>
          </template>
       </div>
    </div>
    
    <!-- Action Buttons (只保留定位按钮，编辑/删除改用右键菜单) -->
    <div v-if="canLocate" class="absolute right-1 bottom-1 flex gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity bg-background/80 backdrop-blur rounded-lg p-0.5 border border-border shadow-sm z-10" @click.stop>
        <!-- Locate Button -->
        <Tooltip :disable-hoverable-content="true">
          <TooltipTrigger as-child>
            <Button size="icon" variant="ghost" class="bookmark-card__locate-btn h-7 w-7 rounded-lg group/locate-btn" @click.stop="emit('locate', bookmark)">
              <span class="i-mdi-target text-xs transition-colors group-hover/locate-btn:text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>定位到原分组</p></TooltipContent>
        </Tooltip>
    </div>
  </Card>
</template>

<style scoped>
.bookmark-card--fresh {
  border-color: hsl(var(--border));
  background: hsl(var(--card));
  box-shadow: none;
}

.bookmark-card--recent {
  border-color: hsl(220 11% 64% / 0.9);
  background: hsl(var(--card));
  box-shadow: none;
}

.bookmark-card--warm {
  border-color: hsl(42 52% 60% / 0.95);
  background: hsl(var(--card));
  box-shadow: none;
}

.bookmark-card--aged {
  border-color: hsl(20 46% 34% / 0.98);
  background: hsl(var(--card));
  box-shadow: none;
}

.bookmark-card--aged :deep(.text-foreground) {
  color: hsl(var(--foreground));
}

.bookmark-card--aged :deep(.text-muted-foreground) {
  color: hsl(var(--muted-foreground));
}

.bookmark-card--fresh.bookmark-card--hoverable:hover,
.bookmark-card--recent.bookmark-card--hoverable:hover,
.bookmark-card--warm.bookmark-card--hoverable:hover,
.bookmark-card--aged.bookmark-card--hoverable:hover {
  background-color: hsl(var(--card));
}

.bookmark-card--selected {
  border-color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.05);
  box-shadow:
    0 12px 24px hsl(var(--foreground) / 0.08),
    0 0 0 2px hsl(var(--primary) / 0.5);
}

.bookmark-card--selected-search {
  border-color: hsl(var(--primary) / 0.25);
  background-color: hsl(var(--card));
  box-shadow:
    0 12px 24px hsl(var(--foreground) / 0.08),
    0 0 0 2px hsl(var(--primary) / 0.3);
}

.dark .bookmark-card--hoverable:hover,
.bookmark-card--fresh.bookmark-card--hoverable:hover,
.bookmark-card--recent.bookmark-card--hoverable:hover,
.bookmark-card--warm.bookmark-card--hoverable:hover,
.bookmark-card--aged.bookmark-card--hoverable:hover {
  background-color: hsl(var(--card));
}

.bookmark-card__locate-btn:hover {
  background-color: hsl(var(--foreground) / 0.1) !important;
}
</style>

<style scoped>
@keyframes snake-border {
  0% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -1000;
  }
}

.animate-snake-border {
  animation: snake-border 3s linear infinite;
}
</style>
