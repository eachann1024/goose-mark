<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  open: boolean
  shareName: string
  existingGroupName: string
  isSubGroupImport?: boolean
  existingSubGroupId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'action', action: 'update' | 'keep' | 'duplicate'): void
}>()

const title = computed(() => {
  return props.isSubGroupImport ? '检测到已导入的子分组' : '检测到已导入的分享'
})

const description = computed(() => {
  if (props.isSubGroupImport) {
    return `您已导入过「${props.shareName}」分享中的子分组`
  }
  return `您已导入过「${props.shareName}」分享内容`
})

const handleAction = (action: 'update' | 'keep' | 'duplicate') => {
  emit('action', action)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px] p-0 gap-0 bg-card border-border">
      <DialogHeader class="px-6 py-4 border-b border-border bg-muted/20">
        <DialogTitle class="text-lg font-medium flex items-center gap-2">
          <span class="i-mdi-sync-alert text-amber-500 text-xl" />
          {{ title }}
        </DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="p-6 space-y-4">
        <div class="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div class="flex items-start gap-3">
            <span class="i-mdi-information-outline text-amber-500 text-lg mt-0.5" />
            <div class="text-sm">
              <p class="font-medium text-foreground mb-1">本地分组：{{ existingGroupName }}</p>
              <p class="text-muted-foreground">选择如何处理此分享内容：</p>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <Button
            variant="default"
            class="w-full justify-start gap-3 h-auto py-3"
            @click="handleAction('update')"
          >
            <span class="i-mdi-refresh text-lg" />
            <div class="text-left">
              <div class="font-medium">更新本地分组</div>
              <div class="text-xs text-primary-foreground/70">用服务器最新内容覆盖本地修改</div>
            </div>
          </Button>

          <Button
            variant="outline"
            class="w-full justify-start gap-3 h-auto py-3"
            @click="handleAction('keep')"
          >
            <span class="i-mdi-shield-check text-lg" />
            <div class="text-left">
              <div class="font-medium">保留本地版本</div>
              <div class="text-xs text-muted-foreground">忽略此次更新，保持现有内容</div>
            </div>
          </Button>

          <Button
            variant="outline"
            class="w-full justify-start gap-3 h-auto py-3"
            @click="handleAction('duplicate')"
          >
            <span class="i-mdi-content-copy text-lg" />
            <div class="text-left">
              <div class="font-medium">创建新副本</div>
              <div class="text-xs text-muted-foreground">保留本地版本，同时创建新分组</div>
            </div>
          </Button>
        </div>
      </div>

      <DialogFooter class="px-6 py-4 bg-muted/20 border-t border-border sm:justify-center">
        <Button variant="ghost" class="w-full" @click="emit('update:open', false)">取消</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
