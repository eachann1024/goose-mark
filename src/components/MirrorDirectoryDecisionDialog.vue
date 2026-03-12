<script setup lang="ts">
const props = defineProps<{
  open: boolean
  directoryPath: string
  filePath: string
  canRead: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'read'): void
  (e: 'overwrite'): void
}>()
</script>

<template>
  <Dialog :open="props.open" @update:open="value => emit('update:open', value)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>发现已有快照文件</DialogTitle>
        <DialogDescription>
          当前文件夹里已经有 `snapshot.json`，请选择处理方式。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3 py-4">
        <div class="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p class="truncate" :title="props.directoryPath">文件夹：{{ props.directoryPath }}</p>
          <p class="truncate" :title="props.filePath">文件：{{ props.filePath }}</p>
        </div>

        <div class="rounded-lg bg-muted/30 p-3 text-xs leading-5 text-foreground/85">
          读取：保留现有文件并读入当前应用。
          <br>
          覆盖：先备份旧文件，再写入当前书签。
        </div>

        <p v-if="!props.canRead" class="text-xs text-destructive">
          当前 `snapshot.json` 无法读取，只能覆盖。
        </p>
      </div>

      <DialogFooter class="mt-2 gap-3 px-1 sm:gap-3 sm:px-2">
        <Button
          variant="ghost"
          class="px-4 text-muted-foreground hover:bg-transparent hover:text-foreground"
          :disabled="props.loading"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          variant="outline"
          class="min-w-32 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-200 dark:hover:bg-emerald-500/18"
          :disabled="props.loading || !props.canRead"
          @click="emit('read')"
        >
          读取现有文件
        </Button>
        <Button
          variant="destructive"
          class="min-w-32"
          :disabled="props.loading"
          @click="emit('overwrite')"
        >
          备份后覆盖
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
