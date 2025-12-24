<script setup lang="ts">
import { useTextOverflow } from '@/composables/useTextOverflow'

const props = defineProps<{
  show: boolean
  activeSubGroups: Array<{ id: string; name: string; shareId?: string; sourceShareId?: string; lastSyncedAt?: number }>
  activeSubGroupId: string
  activeGroupId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'drop', bookmarkId: string, toSubId: string): void
}>()

const { checkForUpdate, getShareData } = useShare()
const store = useBookmarkStore()
const { showToast } = useToast()

// 更新检测状态
const updatesMap = ref<Record<string, boolean>>({})
const checkingMap = ref<Record<string, boolean>>({})
const updatingMap = ref<Record<string, boolean>>({})

// 自动更新单个子分组
const autoUpdateSubGroup = async (subGroupId: string, sourceShareId: string, groupId: string) => {
  if (updatingMap.value[subGroupId]) return
  updatingMap.value[subGroupId] = true
  try {
    const result = await getShareData(sourceShareId)
    if (result?.data) {
      // 将 ShareData 转换为 updateSubGroupFromShare 需要的格式
      const shareData = result.data.data
      
      // 验证数据有效性
      if (!shareData.subGroups || shareData.subGroups.length === 0) {
        showToast({ 
          title: '自动更新失败', 
          description: '分享数据为空',
          variant: 'error' 
        })
        return
      }
      
      const groups = shareData.group 
        ? [{ 
            id: shareData.group.id, 
            name: shareData.group.name, 
            children: shareData.subGroups 
          }]
        : [{ 
            id: 'shared', 
            name: '分享内容', 
            children: shareData.subGroups 
          }]
      
      const dataToUpdate = { groups, bookmarks: shareData.bookmarks || [] }
      // 使用新方法：只更新单个子分组，保留其他子分组
      const updateResult = store.updateSubGroupFromShare(groupId, subGroupId, sourceShareId, dataToUpdate)
      
      if (updateResult && typeof updateResult === 'object') {
        // 等待下一个 tick，让 Pinia 的 persist 插件有机会保存
        await nextTick()
        // 立即刷新存储，确保在 uTools 环境下数据被保存
        utoolsStorage.flushItem('bookmark')
        
        // 构建详细的变更描述
        const logs: string[] = []
        if (updateResult.added > 0) {
          logs.push(`新增\n${updateResult.addedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}`)
        }
        if (updateResult.removed > 0) {
          logs.push(`移除了\n${updateResult.removedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}`)
        }
        
        const description = logs.length > 0 ? logs.join('\n\n') : undefined
        
        showToast({ 
          title: '已自动同步更新', 
          description,
          variant: 'success',
          position: 'bottom-right'
        })
        // 清除更新标记
        updatesMap.value[subGroupId] = false
      } else {
        showToast({ 
          title: '自动更新失败', 
          description: '更新数据失败',
          variant: 'error' 
        })
      }
    } else {
      showToast({ 
        title: '自动更新失败', 
        description: result?.error || '未知错误',
        variant: 'error' 
      })
    }
  } catch (e: unknown) {
    showToast({ 
      title: '自动更新失败', 
      description: e instanceof Error ? e.message : '网络错误',
      variant: 'error' 
    })
  } finally {
    updatingMap.value[subGroupId] = false
  }
}

const checkSingleUpdate = async (subGroupId: string, sourceShareId: string, lastSyncedAt: number | undefined, groupId: string) => {
  if (checkingMap.value[subGroupId]) return
  
  // 如果 lastSyncedAt 不存在或为 0，说明是首次导入，不进行自动更新检查
  if (!lastSyncedAt || lastSyncedAt === 0) return
  
  checkingMap.value[subGroupId] = true
  try {
    const has = await checkForUpdate(sourceShareId, lastSyncedAt)
    if (has) {
      updatesMap.value[subGroupId] = true
      // 自动更新
      await autoUpdateSubGroup(subGroupId, sourceShareId, groupId)
    }
  } catch {
    // 背景检查失败不应中断或抛出未处理错误
  } finally {
    checkingMap.value[subGroupId] = false
  }
}

// 只检查当前活动的子分组
const checkCurrentSubGroupUpdate = () => {
  const sub = props.activeSubGroups.find(s => s.id === props.activeSubGroupId)
  if (sub?.sourceShareId && sub.lastSyncedAt) {
    checkSingleUpdate(sub.id, sub.sourceShareId, sub.lastSyncedAt, props.activeGroupId)
  }
}

// 监听分组变化，重置状态并只检查当前子分组
watch(() => props.activeGroupId, () => {
  updatesMap.value = {}
  checkCurrentSubGroupUpdate()
})

// 监听子分组切换，自动检查并更新
watch(() => props.activeSubGroupId, async (newSubGroupId, oldSubGroupId) => {
  if (newSubGroupId === oldSubGroupId) return

  const sub = props.activeSubGroups.find(s => s.id === newSubGroupId)
  if (!sub?.sourceShareId) return

  // 如果 lastSyncedAt 不存在或为 0，说明是首次导入，跳过
  if (!sub.lastSyncedAt || sub.lastSyncedAt === 0) return

  // 自动检查并更新
  await checkSingleUpdate(newSubGroupId, sub.sourceShareId, sub.lastSyncedAt, props.activeGroupId)
})

onMounted(() => {
  // 只检查当前活动的子分组，而不是所有子分组
  checkCurrentSubGroupUpdate()
})

const hasUpdate = (subId: string) => !!updatesMap.value[subId]

// 溢出检测
const { overflowMap, updateOverflow } = useTextOverflow()

// 鼠标进入时检查溢出
const handleMouseEnter = (e: MouseEvent, key: string) => {
  const target = (e.currentTarget as HTMLElement).querySelector('.sub-name') as HTMLElement
  updateOverflow(key, target)
}

// 拖拽相关状态
const dragOverSubId = ref<string | null>(null)

const handleDragOver = (e: DragEvent, subId: string, isReadonly: boolean) => {
  // 只读子分组不接受拖放
  if (isReadonly) return
  // 不能拖到当前激活的子分组
  if (subId === props.activeSubGroupId) return
  
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dragOverSubId.value = subId
}

const handleDragLeave = (e: DragEvent) => {
  // 检查是否真的离开了元素（而不是进入子元素）
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) {
    return
  }
  dragOverSubId.value = null
}

const handleDrop = (e: DragEvent, toSubId: string, isReadonly: boolean) => {
  e.preventDefault()
  dragOverSubId.value = null
  
  if (isReadonly) {
    console.log('[SubGroupSidebar] Drop rejected: readonly')
    return
  }
  if (toSubId === props.activeSubGroupId) {
    console.log('[SubGroupSidebar] Drop rejected: same subgroup')
    return
  }
  
  const bookmarkId = e.dataTransfer?.getData('text/bookmark-id')
  console.log('[SubGroupSidebar] Drop received:', { bookmarkId, toSubId })
  
  if (bookmarkId) {
    emit('drop', bookmarkId, toSubId)
  } else {
    console.warn('[SubGroupSidebar] No bookmark ID in dataTransfer')
  }
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
            'border border-dashed border-green-500/50': sub.sourceShareId,
            'ring-2 ring-primary ring-offset-1 bg-primary/10': dragOverSubId === sub.id
          }"
          @click="emit('select', sub.id)"
          @mouseenter="handleMouseEnter($event, sub.id)"
          @dragover="handleDragOver($event, sub.id, !!sub.sourceShareId)"
          @dragleave="handleDragLeave"
          @drop="handleDrop($event, sub.id, !!sub.sourceShareId)"
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
