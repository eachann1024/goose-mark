<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Bookmark } from '@/types/bookmark'
import { iconToDisplayUrl } from '@/services/iconCache'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Image } from '@/components/ui/image'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{ bookmark: Bookmark; selected?: boolean }>()
const emit = defineEmits<{
  edit: [Bookmark]
  remove: [Bookmark]
  contextmenu: [MouseEvent]
}>()

const iconUrl = computed(() => iconToDisplayUrl(props.bookmark.icon))
const iconBgStyle = computed(() => {
  const icon = props.bookmark.icon
  if (icon?.bgColor) return { backgroundColor: icon.bgColor }
  return { backgroundColor: 'hsl(var(--muted) / 0.35)' }
})
const letters = computed(() => {
  if (props.bookmark.icon?.type === 'text') return props.bookmark.icon.value.slice(0, 4)
  const title = props.bookmark.title.trim()
  return (title || '•').slice(0, 4).toUpperCase()
})

const openLink = () => {
  if (window.utools) {
    window.utools.shellOpenExternal(props.bookmark.url)
  } else {
    window.open(props.bookmark.url, '_blank')
  }
}

const copyUrl = async () => {
  if (!navigator.clipboard) return
  await navigator.clipboard.writeText(props.bookmark.url)
}
const deletePopoverOpen = ref(false)
</script>

<template>
  <Card 
    class="relative group hover:shadow-lg transition-all dark:hover:border-primary/50 cursor-pointer overflow-hidden flex flex-col justify-center"
    :class="{ 'border-primary ring-1 ring-primary': selected }"
    @click="openLink"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <div class="px-4 py-3 flex gap-3 items-center">
       <!-- Icon -->
       <div class="shrink-0">
          <div 
            class="w-10 h-10 rounded-lg border border-border flex items-center justify-center overflow-hidden transition-colors"
            :class="{ 'bg-muted/30': !iconUrl && (!bookmark.icon?.bgColor) }"
            :style="iconBgStyle"
          >
             <Image 
               v-if="iconUrl" 
               :src="iconUrl" 
               class="w-4/5 h-4/5 object-contain" 
             />
             <span 
                v-else 
                class="text-xs font-bold"
                :class="bookmark.icon?.type === 'text' && bookmark.icon.bgColor ? 'text-white' : 'text-foreground'"
             >{{ letters }}</span>
          </div>
       </div>

       <div class="flex-1 min-w-0 flex flex-col gap-0.5 justify-center">
          <div class="flex items-center justify-between">
             <h3 class="font-medium text-sm truncate pr-2 text-foreground break-all" :title="bookmark.title">
                {{ bookmark.title }}
             </h3>
             <span v-if="bookmark.pinned" class="i-mdi-pin text-primary text-[10px] shrink-0" />
          </div>
          <p class="text-[10px] text-muted-foreground truncate min-h-[16px] leading-[1.2]">
            {{ bookmark.desc || ' ' }}
          </p>
       </div>
    </div>
    
    <!-- Action Buttons -->
    <div class="absolute right-1 bottom-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur rounded-lg p-0.5 border border-border shadow-sm z-10" @click.stop>
        <!-- Copy button removed as per requirement -->
        <!-- Edit Button -->
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" variant="ghost" class="h-7 w-7 rounded-lg hover:bg-muted" @click.stop="emit('edit', bookmark)">
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
          <PopoverContent class="w-48 p-2 bg-card border-border rounded-md shadow-md">
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
