<script setup lang="ts">
import { ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTextOverflow } from '@/composables/useTextOverflow'

const props = defineProps<{
  show: boolean
  activeSubGroups: Array<{ id: string; name: string; shareId?: string }>
  activeSubGroupId: string
  activeGroupId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'share'): void
}>()

// 当前子分组是否已分享
const currentSubGroup = computed(() => 
  props.activeSubGroups.find(s => s.id === props.activeSubGroupId)
)
const isShared = computed(() => !!currentSubGroup.value?.shareId)

// 分享状态
const isSharing = ref(false)

// 溢出检测
const { overflowMap, updateOverflow } = useTextOverflow()

const handleShare = () => {
  emit('share')
}

// 鼠标进入时检查溢出
const handleMouseEnter = (e: MouseEvent, key: string) => {
  const target = (e.currentTarget as HTMLElement).querySelector('.sub-name') as HTMLElement
  updateOverflow(key, target)
}
</script>

<template>
  <aside
    v-if="show"
    class="shrink-0 w-32 flex flex-col gap-1 relative"
  >
    <Tooltip v-for="sub in activeSubGroups" :key="sub.id" :disabled="!overflowMap[sub.id]">
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          class="justify-start w-full px-3 py-2 rounded-md text-sm transition-all text-left"
          :class="{
            'text-primary font-medium border-l-2 border-primary bg-primary/5': activeSubGroupId === sub.id,
            'text-muted-foreground hover:text-foreground hover:bg-muted/50': activeSubGroupId !== sub.id,
            'border border-dashed border-primary/50': sub.shareId
          }"
          @click="emit('select', sub.id)"
          @mouseenter="handleMouseEnter($event, sub.id)"
        >
          <span class="sub-name">
            {{ sub.name }}
          </span>
          <span v-if="sub.shareId" class="i-mdi-link-variant text-xs text-primary/60 ml-auto shrink-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" :side-offset="8">
        <p>{{ sub.name }}</p>
      </TooltipContent>
    </Tooltip>

    <!-- 分享按钮 -->
    <div class="mt-auto pt-3">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            class="w-full h-8 text-xs gap-1.5"
            :class="isShared ? 'border-dashed border-primary/50 text-primary' : 'text-muted-foreground'"
            :disabled="isSharing"
            @click="handleShare"
          >
            <span :class="isShared ? 'i-mdi-link-variant' : 'i-mdi-share-variant'" class="text-sm" />
            <span>{{ isShared ? '已分享' : '在线分享' }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ isShared ? '点击管理分享' : '生成在线分享链接' }}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </aside>
</template>

<style scoped>
.sub-name {
  display: inline-block;
  width: 8em; /* 固定可视宽度，保证溢出被裁剪在标签内 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
