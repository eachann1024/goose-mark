<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useShare } from '@/composables/useShare'
import { useBookmarkStore } from '@/stores/bookmark'
import { Copy, Check, ExternalLink, Trash2, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  groupId: string
  subGroupId: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'shared', shareId: string): void
  (e: 'update-from-share', shareId: string, data: any): void
}>()

const store = useBookmarkStore()
const { createShare, cancelShare, copyShareLink, buildShareUrl, isSharing, shareError, checkForUpdate, getShareData } = useShare()

// 当前子分组信息
const currentSubGroup = computed(() => {
  const group = store.groups.find(g => g.id === props.groupId)
  return group?.children.find(c => c.id === props.subGroupId)
})

const existingShareId = computed(() => currentSubGroup.value?.shareId)
const isAlreadyShared = computed(() => !!existingShareId.value)
const isImported = computed(() => !!currentSubGroup.value?.sourceShareId)
const sourceShareId = computed(() => currentSubGroup.value?.sourceShareId)
const lastSyncedAt = computed(() => currentSubGroup.value?.lastSyncedAt)
const shareUrl = computed(() => existingShareId.value ? buildShareUrl(existingShareId.value) : '')

// UI 状态
const hasCopied = ref(false)
const isCanceling = ref(false)
const isChecking = ref(false)
const isUpdating = ref(false)
const updateAvailable = ref(false)

const checkUpdate = async () => {
    if (!sourceShareId.value) return
    isChecking.value = true
    try {
        updateAvailable.value = await checkForUpdate(sourceShareId.value, lastSyncedAt.value || 0, true)
        if (!updateAvailable.value) {
             showToast({ title: '当前已是最新版本', variant: 'success' })
        }
    } catch (e: any) {
        showToast({ 
            title: '检查更新失败', 
            description: e instanceof Error ? e.message : '网络错误',
            variant: 'error' 
        })
    } finally {
        isChecking.value = false
    }
}

const handleUpdate = async () => {
    if (!sourceShareId.value) return
    isUpdating.value = true
    try {
        const result = await getShareData(sourceShareId.value)
        if (result?.data) {
             emit('update-from-share', sourceShareId.value, result.data.data) 
             showToast({ title: '更新成功', variant: 'success' })
             updateAvailable.value = false
             emit('update:open', false)
        } else {
             showToast({ 
               title: '获取更新失败', 
               description: result?.error || '未知错误',
               variant: 'error' 
             })
        }
    } catch (e: unknown) {
         showToast({ 
            title: '更新失败', 
            description: e instanceof Error ? e.message : '网络错误',
            variant: 'error' 
        })
    } finally {
        isUpdating.value = false
    }
}

// 自动检测
watch(() => props.open, (v) => {
    if(v && isImported.value) {
        checkUpdate()
    }
})

import { useToast } from '@/composables/useToast'
// ...
const { showToast } = useToast()

// ...
const handleCreateShare = async () => {
  const url = await createShare('subGroup', props.groupId, props.subGroupId)
  if (url) {
    const shareId = store.getShareId('subGroup', props.groupId, props.subGroupId)
    if (shareId) {
      emit('shared', shareId)
    }
    showToast({
      title: '分享链接已生成',
      variant: 'success'
    })
  } else {
    showToast({
      title: '创建分享失败',
      description: shareError.value || '未知错误',
      variant: 'error'
    })
  }
}

// 复制链接
const handleCopy = async () => {
  if (existingShareId.value) {
    const success = await copyShareLink(existingShareId.value)
    if (success) {
      hasCopied.value = true
      setTimeout(() => hasCopied.value = false, 2000)
      showToast({
        title: '已复制到剪贴板',
        variant: 'success'
      })
    } else {
      showToast({
        title: '复制失败',
        description: '无法访问剪贴板',
        variant: 'error'
      })
    }
  }
}

// 打开链接
const handleOpen = () => {
  if (shareUrl.value) {
    window.open(shareUrl.value, '_blank')
  }
}

// 取消分享
const handleCancel = async () => {
  if (!existingShareId.value) return
  isCanceling.value = true
  try {
    const result = await cancelShare(existingShareId.value, 'subGroup', props.groupId, props.subGroupId)
    if (result.success) {
      showToast({ title: '已取消分享' })
      emit('update:open', false)
    } else {
      showToast({ 
        title: '取消分享失败', 
        description: result.error || '未知错误',
        variant: 'error' 
      })
    }
  } finally {
    isCanceling.value = false
  }
}

// 关闭弹窗
const handleClose = () => {
  emit('update:open', false)
}

// 重置 hasCopied 当弹窗关闭时
watch(() => props.open, (open) => {
  if (!open) {
    hasCopied.value = false
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md p-0 gap-0 overflow-hidden">
      <!-- 头部：渐变背景 -->
      <DialogHeader class="px-5 py-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/50">
        <DialogTitle class="text-base font-semibold flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <span class="i-mdi-share-variant text-primary text-sm" />
          </div>
          <div>
            <span>分享管理</span>
            <DialogDescription class="text-xs font-normal mt-0.5">
              {{ currentSubGroup?.name || '子分组' }}
            </DialogDescription>
          </div>
        </DialogTitle>
      </DialogHeader>

      <div class="p-5 space-y-4">
        <!-- 未分享状态 -->
        <div v-if="!isAlreadyShared" class="space-y-4">
          <div class="p-3.5 rounded-xl bg-muted/40 border border-border/60">
            <div class="flex items-start gap-3">
              <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span class="i-mdi-information-outline text-primary text-sm" />
              </div>
              <div class="text-sm text-muted-foreground leading-relaxed">
                <p>分享后，其他用户可以通过链接查看此子分组的书签。</p>
                <p class="mt-1.5">当前版本为<span class="text-primary font-medium mx-0.5">只读分享</span>，接收方无法编辑。</p>
              </div>
            </div>
          </div>

          <Button 
            class="w-full h-10 gap-2 font-medium" 
            :disabled="isSharing" 
            @click="handleCreateShare"
          >
            <Loader2 v-if="isSharing" class="w-4 h-4 animate-spin" />
            <span v-else class="i-mdi-link-variant text-lg" />
            生成分享链接
          </Button>

          <p v-if="shareError" class="text-sm text-destructive text-center">{{ shareError }}</p>
        </div>

        <!-- 导入状态 -->
        <div v-else-if="isImported" class="space-y-3">
          <div class="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20">
            <div class="flex items-center gap-2.5 mb-3">
              <div class="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <span class="i-mdi-cloud-download-outline text-emerald-600 text-sm" />
              </div>
              <span class="text-sm font-medium text-emerald-700 dark:text-emerald-400">已导入的分享</span>
            </div>
            <div class="space-y-1.5 text-xs text-emerald-700/70 dark:text-emerald-400/70 font-mono pl-9">
              <p>来源 ID: {{ sourceShareId }}</p>
              <p>上次同步: {{ new Date(lastSyncedAt || 0).toLocaleString() }}</p>
            </div>
          </div>

          <div v-if="updateAvailable" class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
            <span class="text-sm text-blue-700 dark:text-blue-400">检测到新版本</span>
            <Button size="sm" class="h-8" :disabled="isUpdating" @click="handleUpdate">
              <Loader2 v-if="isUpdating" class="w-3 h-3 mr-1.5 animate-spin" />
              立即更新
            </Button>
          </div>
          <div v-else class="flex justify-between items-center">
            <span class="text-xs text-muted-foreground">当前已是最新版本</span>
            <Button variant="ghost" size="sm" class="h-8 text-xs px-3" :disabled="isChecking" @click="checkUpdate">
              <Loader2 v-if="isChecking" class="w-3 h-3 mr-1.5 animate-spin" />
              检查更新
            </Button>
          </div>
        </div>

        <!-- 已分享状态 -->
        <div v-else class="space-y-4">
          <div class="p-4 rounded-xl bg-gradient-to-br from-primary/8 to-primary/3 border border-primary/15">
            <div class="flex items-center gap-2.5 mb-3">
              <div class="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <span class="i-mdi-check-circle text-primary text-sm" />
              </div>
              <span class="text-sm font-medium">已生成分享链接</span>
            </div>
            <div class="flex items-center gap-2">
              <Input 
                readonly 
                :model-value="shareUrl" 
                class="font-mono text-xs bg-background/60 backdrop-blur flex-1 border-border/60" 
              />
              <Button size="icon" variant="outline" class="shrink-0 border-border/60" @click="handleCopy">
                <Check v-if="hasCopied" class="w-4 h-4 text-emerald-500" />
                <Copy v-else class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <Button variant="outline" class="h-9 gap-2 text-sm border-border/60" @click="handleOpen">
              <ExternalLink class="w-3.5 h-3.5" />
              打开网址
            </Button>
            <Button variant="outline" class="h-9 gap-2 text-sm border-border/60" @click="handleCopy">
              <Copy class="w-3.5 h-3.5" />
              复制链接
            </Button>
          </div>

          <div class="pt-3 border-t border-border/50">
            <Button 
              variant="ghost" 
              class="w-full h-9 text-destructive/80 bg-transparent hover:text-destructive hover:bg-destructive/10 gap-2 transition-colors"
              :disabled="isCanceling"
              @click="handleCancel"
            >
              <Loader2 v-if="isCanceling" class="w-4 h-4 animate-spin" />
              <Trash2 v-else class="w-4 h-4" />
              取消分享
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter class="px-5 py-3.5 bg-muted/30 border-t border-border/50 sm:justify-center">
        <Button variant="outline" class="w-full sm:w-28 h-9 border-border/60" @click="handleClose">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
