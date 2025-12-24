<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { useBookmarkStore, parseShareIdFromUrl, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useShare, type ShareData } from '@/composables/useShare'
import { useToast } from '@/composables/useToast'
import { useAppState } from '@/composables/useAppState'

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

// 导入选项
const importMode = ref<'keep' | 'merge'>('keep')
const targetGroupId = ref('')
const showGroupSelect = ref(false)

// 可选的目标分组
const availableGroups = computed(() => 
  store.groups.filter(g => g.id !== TRASH_GROUP_ID)
)

const targetGroupName = computed(() => {
  const group = availableGroups.value.find(g => g.id === targetGroupId.value)
  return group?.name || '选择分组'
})

// 重置状态
const reset = () => {
  shareInput.value = ''
  isLoading.value = false
  errorMsg.value = ''
  sharePreview.value = null
  shareData.value = null
  shareId.value = null
  importMode.value = 'keep'
  targetGroupId.value = availableGroups.value[0]?.id || ''
  showGroupSelect.value = false
}

watch(() => props.open, (v) => {
  if (v) {
    reset()
    targetGroupId.value = availableGroups.value[0]?.id || ''
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
        children: shareData.value.subGroups 
      }]
    : [{ 
        id: 'shared', 
        name: '来自分享', 
        children: shareData.value.subGroups 
      }]
  
  const dataToImport = { groups, bookmarks: shareData.value.bookmarks }
  
  let importSuccess = false
  
  if (importMode.value === 'keep') {
    // 智能导入：自动检测同名分组并合并
    const result = store.importFromShareSmart(dataToImport, shareId.value, sharePreview.value?.name)
    if (result) {
      const subGroupNames = shareData.value.subGroups.map(s => s.name).join('、')
      showToast({
        title: '导入成功',
        description: result.merged 
          ? `已将「${subGroupNames}」合并到「${result.group.name}」`
          : `已创建分组「${result.group.name}」`,
        variant: 'success'
      })
      importSuccess = true
    }
  } else {
    // 合并到指定分组
    const success = store.importToExistingGroup(dataToImport, targetGroupId.value, shareId.value)
    if (success) {
      const targetGroup = store.groups.find(g => g.id === targetGroupId.value)
      showToast({
        title: '导入成功',
        description: `已添加到「${targetGroup?.name || '目标分组'}」`,
        variant: 'success'
      })
      importSuccess = true
    }
  }
  
  emit('update:open', false)
  
  // 导入成功后切换到书签视图
  if (importSuccess) {
    tab.value = 'bookmarks'
  }
}

const handleClose = () => {
  emit('update:open', false)
}

const selectGroup = (groupId: string) => {
  targetGroupId.value = groupId
  showGroupSelect.value = false
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

            <!-- 导入方式 -->
            <div class="pt-3 border-t border-border space-y-3">
              <label class="text-sm font-medium">导入方式</label>
              <div class="flex gap-2">
                <Button 
                  :variant="importMode === 'keep' ? 'default' : 'outline'" 
                  size="sm"
                  class="flex-1"
                  @click="importMode = 'keep'"
                >
                  <span class="i-mdi-folder-sync mr-1" />
                  智能合并
                </Button>
                <Button 
                  :variant="importMode === 'merge' ? 'default' : 'outline'" 
                  size="sm"
                  class="flex-1"
                  @click="importMode = 'merge'"
                >
                  <span class="i-mdi-folder-arrow-right mr-1" />
                  导入到指定
                </Button>
              </div>
              <p v-if="importMode === 'keep'" class="text-xs text-muted-foreground">
                同名主分组会自动合并，子分组追加到该分组下
              </p>

              <!-- 目标分组选择 -->
              <Transition name="fade">
                <div v-if="importMode === 'merge'">
                  <Popover v-model:open="showGroupSelect">
                    <PopoverTrigger as-child>
                      <Button variant="outline" class="w-full justify-between">
                        <span>{{ targetGroupName }}</span>
                        <span class="i-mdi-chevron-down" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[200px] p-2" align="start">
                      <div class="space-y-1">
                        <Button
                          v-for="group in availableGroups"
                          :key="group.id"
                          variant="ghost"
                          size="sm"
                          class="w-full justify-start"
                          :class="{ 'bg-muted': group.id === targetGroupId }"
                          @click="selectGroup(group.id)"
                        >
                          {{ group.name }}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </Transition>
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
