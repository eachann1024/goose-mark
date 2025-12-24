<script setup lang="ts">
import type { Bookmark } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'

const props = defineProps<{ bookmark: Bookmark; selected?: boolean; showHint?: boolean; hintKey?: string; readonly?: boolean }>()
const emit = defineEmits<{
  edit: [Bookmark, HTMLElement | undefined]
  remove: [Bookmark]
  contextmenu: [MouseEvent]
  open: [Bookmark]
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
  el.style.borderRadius = '12px'
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
  el.style.transform = 'translateY(4px)'
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
  let top = anchorRect ? anchorRect.top - toastRect.height - 10 : window.innerHeight - toastRect.height - 16
  let left = anchorRect ? anchorRect.left + anchorRect.width / 2 - toastRect.width / 2 : window.innerWidth - toastRect.width - 16
  const maxLeft = window.innerWidth - toastRect.width - 8
  top = Math.max(8, top)
  left = Math.max(8, Math.min(left, maxLeft))
  el.style.top = `${top}px`
  el.style.left = `${left}px`
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })
  fallbackToastEl = el
}

const onCardEnter = () => {
  checkTruncate()
  const showTitle = isTitleTruncated.value
  const showDesc = isDescTruncated.value && props.bookmark.desc
  
  if (!showTitle && !showDesc) return
  
  const anchor = (cardEl.value?.$el ?? cardEl.value) as HTMLElement | undefined
  showFallbackToast(
    showTitle ? props.bookmark.title : '',
    showDesc ? props.bookmark.desc : '',
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
const deletePopoverOpen = ref(false)
const editTooltipOpen = ref(false)

const handleEdit = () => {
  editTooltipOpen.value = false
  // 使用 nextTick 确保 tooltip 先关闭
  nextTick(() => {
    emit('edit', props.bookmark, (cardEl.value?.$el ?? cardEl.value) as HTMLElement | undefined)
  })
}
</script>

<template>
  <Card 
    ref="cardEl"
    class="relative group hover:shadow-lg transition-shadow dark:hover:border-primary/50 cursor-pointer overflow-hidden flex flex-col justify-center select-none"
    :class="{ 'border-primary ring-1 ring-primary': selected }"
    @click="openLink"
    @contextmenu.prevent="emit('contextmenu', $event)"
    @mouseenter="onCardEnter"
    @mouseleave="hideDescToast"
  >
    <div
      v-if="showHint && hintKey"
      class="absolute top-1.5 right-1.5 z-20 h-6 min-w-[24px] px-2 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow"
    >
      {{ hintKey }}
    </div>
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
              class="font-semibold text-base leading-snug truncate text-foreground"
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
    
    <!-- Action Buttons -->
    <div v-if="!readonly" class="absolute right-1 bottom-1 flex gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity bg-background/80 backdrop-blur rounded-lg p-0.5 border border-border shadow-sm z-10" @click.stop>
        <!-- Copy button removed as per requirement -->
        <!-- Edit Button -->
        <Tooltip v-model:open="editTooltipOpen" :disable-hoverable-content="true">
          <TooltipTrigger as-child>
            <Button size="icon" variant="ghost" class="h-7 w-7 rounded-lg hover:bg-muted" @click.stop="handleEdit">
              <span class="i-mdi-pencil text-xs" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>编辑</p></TooltipContent>
        </Tooltip>

        <!-- Delete Button -->
        <Popover v-model:open="deletePopoverOpen">
          <PopoverTrigger asChild>
             <div class="inline-block" @click.stop> <!-- 阻止点击事件冒泡到卡片 -->
               <Tooltip>
                 <TooltipTrigger as-child>
                    <Button size="icon" variant="ghost" class="h-7 w-7 rounded-lg hover:bg-muted hover:text-destructive">
                      <span class="i-mdi-delete-outline text-xs" />
                    </Button>
                 </TooltipTrigger>
                 <TooltipContent><p>删除</p></TooltipContent>
               </Tooltip>
             </div>
          </PopoverTrigger>
          <PopoverContent class="w-48 p-2 bg-card border-border rounded-md shadow-md" @keydown.enter.prevent="emit('remove', bookmark); deletePopoverOpen = false">
    <p class="text-sm mb-2">确认删除？</p>
    <div class="flex justify-end gap-2">
      <Button variant="outline" size="sm" @click.stop="deletePopoverOpen = false">取消</Button>
      <Button size="sm" @click.stop="emit('remove', bookmark); deletePopoverOpen = false">确认</Button>
    </div>
  </PopoverContent>
</Popover>
    </div>
  </Card>
</template>
