<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTextOverflow } from '@/composables/useTextOverflow'
import { useShare } from '@/composables/useShare'

const props = defineProps<{
  show: boolean
  activeSubGroups: Array<{ id: string; name: string; shareId?: string; sourceShareId?: string; lastSyncedAt?: number }>
  activeSubGroupId: string
  activeGroupId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { checkForUpdate } = useShare()

// 更新检测状态
const updatesMap = ref<Record<string, boolean>>({})
const checkingMap = ref<Record<string, boolean>>({})

const checkSingleUpdate = async (subGroupId: string, sourceShareId: string, lastSyncedAt = 0) => {
  if (checkingMap.value[subGroupId]) return
  checkingMap.value[subGroupId] = true
  try {
    const has = await checkForUpdate(sourceShareId, lastSyncedAt)
    if (has) {
       updatesMap.value[subGroupId] = true
    }
  } finally {
    checkingMap.value[subGroupId] = false
  }
}

const checkAllUpdates = () => {
    props.activeSubGroups.forEach(sub => {
        if (sub.sourceShareId) {
            checkSingleUpdate(sub.id, sub.sourceShareId, sub.lastSyncedAt)
        }
    })
}

// 监听分组变化自动检测
watch(() => props.activeGroupId, () => {
  updatesMap.value = {}
  checkAllUpdates()
})

onMounted(() => {
    checkAllUpdates()
})

const hasUpdate = (subId: string) => !!updatesMap.value[subId]

// 溢出检测
const { overflowMap, updateOverflow } = useTextOverflow()

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
          class="justify-start w-full px-3 py-2 rounded-md text-sm transition-all text-left relative"
          :class="{
            'text-primary font-medium border-l-2 border-primary bg-primary/5': activeSubGroupId === sub.id,
            'text-muted-foreground hover:text-foreground hover:bg-muted/50': activeSubGroupId !== sub.id,
            'border border-dashed border-blue-500/50': sub.shareId,
            'border border-dashed border-green-500/50': sub.sourceShareId
          }"
          @click="emit('select', sub.id)"
          @mouseenter="handleMouseEnter($event, sub.id)"
        >
          <span class="sub-name">
            {{ sub.name }}
          </span>
          <!-- 分享图标 -->
          <span v-if="sub.shareId" class="i-mdi-share-variant text-xs text-blue-500/60 ml-auto shrink-0" title="我分享的" />
          <!-- 导入来源图标 -->
          <div v-if="sub.sourceShareId" class="ml-auto shrink-0 relative flex items-center">
             <span class="i-mdi-cloud-download-outline text-xs text-green-500/60" title="已导入" />
             <span v-if="hasUpdate(sub.id)" class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" :side-offset="8">
        <p>{{ sub.name }}</p>
      </TooltipContent>
    </Tooltip>

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

