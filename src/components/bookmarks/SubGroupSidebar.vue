<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTextOverflow } from '@/composables/useTextOverflow'
import { useSettingsStore } from '@/stores/settings'
import { useShare } from '@/composables/useShare'

const props = defineProps<{
  show: boolean
  activeSubGroups: Array<{ id: string; name: string; shareId?: string; sourceShareId?: string; lastSyncedAt?: number }>
  activeSubGroupId: string
  activeGroupId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'share'): void
  (e: 'openShareUrl', shareId: string): void
  (e: 'copyShareLink', shareId: string): void
  (e: 'deleteSubGroup', id: string): void
}>()

const settingsStore = useSettingsStore()
const { checkForUpdate } = useShare()

// 当前子分组是否已分享
const currentSubGroup = computed(() => 
  props.activeSubGroups.find(s => s.id === props.activeSubGroupId)
)
const isShared = computed(() => !!currentSubGroup.value?.shareId)
const isImported = computed(() => !!currentSubGroup.value?.sourceShareId)
const currentShareId = computed(() => currentSubGroup.value?.shareId)

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

// 分享状态
const isSharing = ref(false)
const showShareMenu = ref(false)

// 溢出检测
const { overflowMap, updateOverflow } = useTextOverflow()

const handleShare = () => {
  emit('share')
}

const handleOpenShareUrl = () => {
  if (currentShareId.value) {
    emit('openShareUrl', currentShareId.value)
    showShareMenu.value = false
  }
}

const handleCopyShareLink = () => {
  if (currentShareId.value) {
    emit('copyShareLink', currentShareId.value)
    showShareMenu.value = false
  }
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

    <!-- 分享按钮（仅在启用分享功能时显示） -->
    <div v-if="settingsStore.enableShare" class="mt-auto pt-3">
      <!-- 已分享状态：Popover 菜单 -->
      <Popover v-if="isShared || isImported" v-model:open="showShareMenu">
        <PopoverTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            class="w-full h-8 text-xs gap-1.5"
            :class="{
                'border-dashed border-blue-500/50 text-blue-600': isShared,
                'border-dashed border-green-500/50 text-green-600': isImported
            }"
            :disabled="isSharing"
          >
            <span :class="isImported ? 'i-mdi-cog' : 'i-mdi-share-variant'" class="text-sm" />
            <span>{{ isImported ? '管理' : '已分享' }}</span>
            <span v-if="hasUpdate(activeSubGroupId)" class="w-2 h-2 bg-red-500 rounded-full ml-1 animate-pulse" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-40 p-1" align="start" :side-offset="4">
          <div class="flex flex-col">
            <template v-if="isShared">
                <Button
                variant="ghost"
                size="sm"
                class="justify-start h-8 text-xs gap-2"
                @click="handleOpenShareUrl"
                >
                <span class="i-mdi-open-in-new text-sm" />
                打开网址
                </Button>
                <Button
                variant="ghost"
                size="sm"
                class="justify-start h-8 text-xs gap-2"
                @click="handleCopyShareLink"
                >
                <span class="i-mdi-content-copy text-sm" />
                复制链接
                </Button>
                <Button
                variant="ghost"
                size="sm"
                class="justify-start h-8 text-xs gap-2"
                @click="handleShare"
                >
                <span class="i-mdi-cog text-sm" />
                管理分享
                </Button>
            </template>
            <template v-else-if="isImported">
                 <Button
                  variant="ghost"
                  size="sm"
                  class="justify-start h-8 text-xs gap-2 text-green-600"
                  @click="handleShare"
                >
                  <span class="i-mdi-cloud-sync text-sm" />
                  检查更新
                  <span v-if="hasUpdate(activeSubGroupId)" class="w-2 h-2 bg-red-500 rounded-full ml-auto" />
                </Button>
                 <Button
                  variant="ghost"
                  size="sm"
                  class="justify-start h-8 text-xs gap-2 text-destructive"
                  @click="emit('deleteSubGroup', activeSubGroupId)"
                >
                  <span class="i-mdi-delete-outline text-sm" />
                  删除
                </Button>
            </template>
          </div>
        </PopoverContent>
      </Popover>

      <!-- 未分享状态：普通按钮 -->
      <Tooltip v-else>
        <TooltipTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            class="w-full h-8 text-xs gap-1.5 text-muted-foreground"
            :disabled="isSharing"
            @click="handleShare"
          >
            <span class="i-mdi-share-variant text-sm" />
            <span>在线分享</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>生成在线分享链接</p>
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

