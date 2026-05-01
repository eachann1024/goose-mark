<script setup lang="ts">
import draggable from 'vuedraggable'
import SubGroupItem from './SubGroupItem.vue'
import { TRASH_GROUP_ID } from '@/stores/bookmark'

const props = defineProps<{
  show: boolean
  activeSubGroups: Array<{ id: string; name: string; shareId?: string; sourceShareId?: string; lastSyncedAt?: number; bookmarkIds?: string[] }>
  activeSubGroupId: string
  activeGroupId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'drop', bookmarkId: string, toSubId: string): void
  (e: 'edit-group', groupId: string): void
}>()

const store = useBookmarkStore()
const { showToast, isTooltipEnabled } = useUIManager()
const getShareData = async (_sourceShareId: string): Promise<any> => null
const checkForUpdate = async (_sourceShareId: string, _lastSyncedAt: number): Promise<boolean> => false

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
      const updateResult = (store as any).updateSubGroupFromShare?.(groupId, subGroupId, sourceShareId, dataToUpdate)
      
      if (updateResult && typeof updateResult === 'object') {
        // 等待下一个 tick，让 Pinia 的 persist 插件有机会保存
        await nextTick()
        // 立即刷新存储，确保在 uTools 环境下数据被保存
        utoolsStorage.flushItem('bookmark')
        
        // 构建详细的变更描述
        const logs: string[] = []
        if (updateResult.added > 0) {
          logs.push(`新增\n${updateResult.addedItems.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n')}`)
        }
        if (updateResult.removed > 0) {
          logs.push(`移除了\n${updateResult.removedItems.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n')}`)
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

// 拖拽相关状态
const dragOverSubId = ref<string | null>(null)

const handleDragOver = (e: DragEvent, subId: string, isReadonly: boolean) => {
  const types = e.dataTransfer?.types
  const isBookmarkDrag = !types || types.length === 0 || Array.from(types).includes('text/bookmark-id')
  if (!isBookmarkDrag) return
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
  const types = e.dataTransfer?.types
  const isBookmarkDrag = !types || types.length === 0 || Array.from(types).includes('text/bookmark-id')
  if (!isBookmarkDrag) return
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

const localSubGroups = computed({
  get: () => props.activeSubGroups,
  set: (val) => {
    if (!props.activeGroupId || props.activeGroupId === TRASH_GROUP_ID) return
    store.reorderSubGroups(props.activeGroupId, val as any)
  }
})

const checkSubMove = (evt: { draggedContext: { element: { shareId?: string; sourceShareId?: string } } }) => {
  const sub = evt.draggedContext.element
  return !(sub.shareId || sub.sourceShareId)
}
</script>

<template>
  <aside
    v-if="show"
    class="shrink-0 w-32 flex flex-col gap-1 relative overflow-y-auto no-scrollbar"
  >
    <draggable
      v-model="localSubGroups"
      item-key="id"
      :animation="150"
      :disabled="activeSubGroups.length <= 1"
      :move="checkSubMove"
      class="flex flex-col gap-1"
    >
      <template #item="{ element: sub }">
        <div class="subgroup-sort-item">
          <SubGroupItem
            :sub="sub"
            :is-active="activeSubGroupId === sub.id"
            :is-drag-over="dragOverSubId === sub.id"
            :has-update="hasUpdate(sub.id)"
            @select="emit('select', $event)"
            @edit-parent-group="emit('edit-group', activeGroupId)"
            @dragover="handleDragOver($event, sub.id, !!sub.sourceShareId)"
            @dragleave="handleDragLeave"
            @drop="handleDrop($event, sub.id, !!sub.sourceShareId)"
          />
        </div>
      </template>
    </draggable>
  </aside>
</template>

<style scoped>
/* 隐藏滚动条 */
aside::-webkit-scrollbar {
  display: none;
}
aside {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
</style>
