<script setup lang="ts">
const props = defineProps<{
  open: boolean
  targetGroupName: string
  sourceGroupName: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'action', action: 'merge' | 'new'): void
}>()

const handleAction = (action: 'merge' | 'new') => {
  emit('action', action)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px] p-0 gap-0 bg-card border-border">
      <DialogHeader class="px-6 py-4 border-b border-border bg-muted/20">
        <DialogTitle class="text-lg font-medium flex items-center gap-2">
          <span class="i-mdi-folder-multiple text-blue-500 text-xl" />
          同名分组冲突
        </DialogTitle>
        <DialogDescription>
          本地已存在同名的分组，但来源不同
        </DialogDescription>
      </DialogHeader>

      <div class="p-6 space-y-4">
        <div class="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div class="flex items-start gap-3">
            <span class="i-mdi-information-outline text-blue-500 text-lg mt-0.5" />
            <div class="text-sm">
              <p class="font-medium text-foreground mb-1">本地分组：{{ targetGroupName }}</p>
              <p class="font-medium text-foreground mb-1">导入分组：{{ sourceGroupName }}</p>
              <p class="text-muted-foreground">选择如何处理：</p>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <Button
            variant="default"
            class="w-full justify-start gap-3 h-auto py-3"
            @click="handleAction('merge')"
          >
            <span class="i-mdi-merge text-lg" />
            <div class="text-left">
              <div class="font-medium">合并到现有分组</div>
              <div class="text-xs text-primary-foreground/70">将子分组添加到本地分组中</div>
            </div>
          </Button>

          <Button
            variant="outline"
            class="w-full justify-start gap-3 h-auto py-3"
            @click="handleAction('new')"
          >
            <span class="i-mdi-plus-circle-outline text-lg" />
            <div class="text-left">
              <div class="font-medium">创建新分组</div>
              <div class="text-xs text-muted-foreground">保留现有分组，创建带后缀的新分组</div>
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
