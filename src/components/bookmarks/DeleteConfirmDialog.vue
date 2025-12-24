<script setup lang="ts">
const props = defineProps<{
  open: boolean
  isTrashActive: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const handleConfirm = () => {
  emit('confirm')
  emit('update:open', false)
}

const handleClose = () => emit('update:open', false)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[400px] p-4 bg-card border-border">
      <DialogHeader>
        <DialogTitle class="text-lg">确认删除</DialogTitle>
      </DialogHeader>
      <p class="py-2 text-sm">
        {{ isTrashActive ? '确定要彻底删除此书签吗？此操作不可撤销。' : '确定要将此书签移入回收站吗？' }}
      </p>
      <DialogFooter class="flex justify-end space-x-2">
        <Button variant="outline" @click="handleClose">取消</Button>
        <Button @click="handleConfirm">确认</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
