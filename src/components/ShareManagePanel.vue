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
}>()

const store = useBookmarkStore()
const { createShare, cancelShare, copyShareLink, buildShareUrl, isSharing, shareError } = useShare()

// 当前子分组信息
const currentSubGroup = computed(() => {
  const group = store.groups.find(g => g.id === props.groupId)
  return group?.children.find(c => c.id === props.subGroupId)
})

const existingShareId = computed(() => currentSubGroup.value?.shareId)
const isAlreadyShared = computed(() => !!existingShareId.value)
const shareUrl = computed(() => existingShareId.value ? buildShareUrl(existingShareId.value) : '')

// UI 状态
const hasCopied = ref(false)
const isCanceling = ref(false)

// 创建分享
const handleCreateShare = async () => {
  const url = await createShare('subGroup', props.groupId, props.subGroupId)
  if (url) {
    const shareId = store.getShareId('subGroup', props.groupId, props.subGroupId)
    if (shareId) {
      emit('shared', shareId)
    }
  }
}

// 复制链接
const handleCopy = async () => {
  if (existingShareId.value) {
    const success = await copyShareLink(existingShareId.value)
    if (success) {
      hasCopied.value = true
      setTimeout(() => hasCopied.value = false, 2000)
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
    const success = await cancelShare(existingShareId.value, 'subGroup', props.groupId, props.subGroupId)
    if (success) {
      emit('update:open', false)
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
    <DialogContent class="sm:max-w-[450px] p-0 gap-0 bg-card border-border">
      <DialogHeader class="px-6 py-4 border-b border-border bg-muted/20">
        <DialogTitle class="text-lg font-medium flex items-center gap-2">
          <span class="i-mdi-share-variant text-primary text-xl" />
          分享管理
        </DialogTitle>
        <DialogDescription>
          {{ currentSubGroup?.name || '子分组' }}
        </DialogDescription>
      </DialogHeader>

      <div class="p-6 space-y-4">
        <!-- 未分享状态 -->
        <div v-if="!isAlreadyShared" class="space-y-4">
          <div class="p-4 rounded-lg bg-muted/30 border border-border">
            <div class="flex items-start gap-3">
              <span class="i-mdi-information-outline text-primary text-lg shrink-0 mt-0.5" />
              <div class="text-sm text-muted-foreground">
                <p>分享后，其他用户可以通过链接查看此子分组的书签。</p>
                <p class="mt-1">当前版本为<span class="text-primary font-medium">只读分享</span>，接收方无法编辑。</p>
              </div>
            </div>
          </div>

          <Button 
            class="w-full" 
            :disabled="isSharing" 
            @click="handleCreateShare"
          >
            <Loader2 v-if="isSharing" class="w-4 h-4 mr-2 animate-spin" />
            <span v-else class="i-mdi-link-variant text-lg mr-2" />
            生成分享链接
          </Button>

          <p v-if="shareError" class="text-sm text-destructive">{{ shareError }}</p>
        </div>

        <!-- 已分享状态 -->
        <div v-else class="space-y-4">
          <div class="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div class="flex items-center gap-2 mb-3">
              <span class="i-mdi-check-circle text-primary" />
              <span class="text-sm font-medium">已生成分享链接</span>
            </div>
            <div class="flex items-center gap-2">
              <Input 
                readonly 
                :model-value="shareUrl" 
                class="font-mono text-xs h-9 bg-background flex-1" 
              />
              <Button size="icon" variant="outline" class="h-9 w-9 shrink-0" @click="handleCopy">
                <Check v-if="hasCopied" class="w-4 h-4 text-green-500" />
                <Copy v-else class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <Button variant="outline" class="gap-2" @click="handleOpen">
              <ExternalLink class="w-4 h-4" />
              打开网址
            </Button>
            <Button variant="outline" class="gap-2" @click="handleCopy">
              <Copy class="w-4 h-4" />
              复制链接
            </Button>
          </div>

          <div class="pt-2 border-t border-border">
            <Button 
              variant="ghost" 
              class="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
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

      <DialogFooter class="px-6 py-4 bg-muted/20 border-t border-border sm:justify-center">
        <Button variant="outline" class="w-full sm:w-32" @click="handleClose">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
