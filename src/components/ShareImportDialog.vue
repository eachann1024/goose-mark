<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import type { ShareData } from '@/composables/useShare'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const store = useBookmarkStore()
const { getShareData } = useShare()
const { showToast } = useToast()
const { tab } = useAppState()
// 状态
const shareInput = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const sharePreview = ref<{ name: string; subGroups: string[]; bookmarkCount: number } | null>(null)
const shareData = ref<ShareData | null>(null)
const shareId = ref<string | null>(null)

// 冲突处理
const conflictInfo = ref<{ group: any; sourceGroup: any } | null>(null)
const showConflictDialog = ref(false)

// 重置状态
const reset = () => {
  shareInput.value = ''
  isLoading.value = false
  errorMsg.value = ''
  sharePreview.value = null
  shareData.value = null
  shareId.value = null
  conflictInfo.value = null
  showConflictDialog.value = false
}

watch(() => props.open, (v) => {
  if (v) {
    reset()
  }
})

// 验证分享
const validateShare = async () => {
  errorMsg.value = ''
  sharePreview.value = null
  shareData.value = null
  
  const parsedId = parseShareIdFromUrl(shareInput.value)
  if (!parsedId) {
    errorMsg.value = '请输入有效的分享码或分享链接'
    return
  }
  
  shareId.value = parsedId
  isLoading.value = true
  
  try {
    const result = await getShareData(parsedId)
    
    if (!result) {
      errorMsg.value = '网络错误，请稍后重试'
      return
    }
    
    if (result.error) {
      errorMsg.value = result.error
      return
    }
    
    if (result.data) {
      const data = result.data.data
      shareData.value = data
      sharePreview.value = {
        name: data.group?.name || '来自分享',
        subGroups: data.subGroups.map(s => s.name),
        bookmarkCount: data.bookmarks.length
      }
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '验证失败'
  } finally {
    isLoading.value = false
  }
}

// 执行导入
const handleImport = () => {
  if (!shareData.value || !shareId.value) return
  
  const groups = shareData.value.group 
    ? [{ 
        id: shareData.value.group.id, 
        name: shareData.value.group.name, 
        children: shareData.value.subGroups,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }]
    : [{ 
        id: 'shared', 
        name: '来自分享', 
        children: shareData.value.subGroups,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }]
  
  const dataToImport = { groups, bookmarks: shareData.value.bookmarks }
  
  let importSuccess = false
  
  // 执行智能导入
  const result = store.importFromShareSmart(dataToImport, shareId.value, sharePreview.value?.name)
  
  if (result?.alreadyImported) {
    showToast({
      title: '无需重复导入',
      description: `「${result.group?.name}」已作为在线分组存在并保持同步`,
      variant: 'info'
    })
    emit('update:open', false)
    return
  }

  if (result?.conflict) {
    conflictInfo.value = { group: result.group, sourceGroup: result.sourceGroup }
    showConflictDialog.value = true
    return
  }

  if (result?.success) {
    const subGroupNames = shareData.value.subGroups.map(s => s.name).join('、')
    showToast({
      title: '导入成功',
      description: result.merged 
        ? `已将「${subGroupNames}」合并到「${result.group?.name}」`
        : `已创建分组「${result.group?.name}」`,
      variant: 'success'
    })
    emit('update:open', false)
    tab.value = 'bookmarks'
  }
}

// 强行同步（覆盖并转为在线）
const handleForceSync = () => {
  if (!conflictInfo.value || !shareData.value || !shareId.value) return
  
  const groups = [{ 
    id: shareData.value.group?.id || 'shared', 
    name: shareData.value.group?.name || '来自分享', 
    children: shareData.value.subGroups,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }]
  const dataToImport = { groups, bookmarks: shareData.value.bookmarks }
  
  const success = store.forceImportToGroup(conflictInfo.value.group.id, dataToImport, shareId.value)
  if (success) {
    showToast({
      title: '同步成功',
      description: `已将「${conflictInfo.value.group.name}」恢复为在线分组并覆盖内容`,
      variant: 'success'
    })
    emit('update:open', false)
    tab.value = 'bookmarks'
  }
  showConflictDialog.value = false
}

// 创建副本
const handleCreateCopy = () => {
  if (!shareData.value || !shareId.value) return
  
  // 使用 mergeFromShare 强制创建新分组，会自动处理重名后缀
  const groups = [{ 
    id: shareData.value.group?.id || 'shared', 
    name: shareData.value.group?.name || '来自分享', 
    children: shareData.value.subGroups,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }]
  const dataToImport = { groups, bookmarks: shareData.value.bookmarks }
  
  const newGroup = store.mergeFromShare(dataToImport, shareId.value)
  if (newGroup) {
    showToast({
      title: '创建成功',
      description: `已创建副本分组「${newGroup.name}」`,
      variant: 'success'
    })
    emit('update:open', false)
    tab.value = 'bookmarks'
  }
  showConflictDialog.value = false
}

const handleClose = () => {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[450px] p-0 gap-0 bg-card border-border">
      <DialogHeader class="px-6 py-4 border-b border-border bg-muted/20">
        <DialogTitle class="text-lg font-medium flex items-center gap-2">
          <span class="i-mdi-import text-primary text-xl" />
          导入分享
        </DialogTitle>
        <DialogDescription>
          输入分享码或分享链接导入书签
        </DialogDescription>
      </DialogHeader>

      <div class="p-6 space-y-4">
        <!-- 输入分享码 -->
        <div class="space-y-2">
          <label class="text-sm font-medium">分享码/链接</label>
          <div class="flex gap-2">
            <Input 
              v-model="shareInput" 
              placeholder="粘贴分享码或完整链接" 
              class="flex-1"
              @keydown.enter="validateShare"
            />
            <Button 
              variant="outline" 
              :disabled="!shareInput || isLoading"
              @click="validateShare"
            >
              <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
              <span v-else>验证</span>
            </Button>
          </div>
          <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
        </div>

        <!-- 预览 -->
        <Transition name="fade">
          <div v-if="sharePreview" class="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
            <div class="flex items-center gap-2">
              <span class="i-mdi-check-circle text-green-500" />
              <span class="font-medium">分享内容有效</span>
            </div>
            <div class="text-sm text-muted-foreground space-y-1">
              <p><span class="text-foreground font-medium">分组名：</span>{{ sharePreview.name }}</p>
              <p><span class="text-foreground font-medium">包含子分组：</span>{{ sharePreview.subGroups.join('、') }}</p>
              <p><span class="text-foreground font-medium">书签数量：</span>{{ sharePreview.bookmarkCount }} 个</p>
            </div>
          </div>
        </Transition>
      </div>

      <DialogFooter class="px-6 py-4 bg-muted/20 border-t border-border sm:justify-center">
        <Button variant="outline" class="w-32" @click="handleClose">取消</Button>
        <Button 
          class="w-32" 
          :disabled="!sharePreview"
          @click="handleImport"
        >
          导入
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 冲突处理对话框 -->
  <Dialog :open="showConflictDialog" @update:open="showConflictDialog = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>检测到命名冲突</DialogTitle>
        <DialogDescription>
          本地已存在名为「{{ conflictInfo?.group?.name }}」的分组，但它未关联到当前的分享。
        </DialogDescription>
      </DialogHeader>
      
      <div class="py-4 space-y-3">
        <Button variant="default" class="w-full justify-start h-auto py-3 px-4 flex flex-col items-start gap-1" @click="handleForceSync">
          <div class="flex items-center gap-2 font-semibold">
            <span class="i-mdi-sync text-lg" />
            覆盖并转为在线
          </div>
          <p class="text-xs opacity-80 font-normal">将该本地分组重新关联到该分享，并将内容覆盖为远程版本</p>
        </Button>

        <Button variant="outline" class="w-full justify-start h-auto py-3 px-4 flex flex-col items-start gap-1" @click="handleCreateCopy">
          <div class="flex items-center gap-2 font-semibold">
            <span class="i-mdi-content-copy text-lg" />
            创建副本
          </div>
          <p class="text-xs text-muted-foreground font-normal">保留现有分组，创建一个新的在线分组（带数字后缀）</p>
        </Button>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="showConflictDialog = false">取消</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
