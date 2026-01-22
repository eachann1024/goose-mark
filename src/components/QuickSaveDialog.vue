<script setup lang="ts">
import { ref, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': [url: string]
}>()

const url = ref('')
const isSaving = ref(false)
const savingStatus = ref('')

const handleSave = async () => {
  if (!url.value.trim()) return

  isSaving.value = true
  savingStatus.value = '正在获取页面信息...'
  try {
    await emit('save', url.value.trim())
    url.value = ''
    emit('update:open', false)
  } finally {
    isSaving.value = false
    savingStatus.value = ''
  }
}

const handleCancel = () => {
  url.value = ''
  emit('update:open', false)
}

// 监听弹窗打开时自动聚焦输入框
watch(() => props.open, (open) => {
  if (open) {
    // 延迟一点时间让弹窗完全渲染后再聚焦
    setTimeout(() => {
      const input = document.querySelector('input[type="url"]') as HTMLInputElement
      if (input) {
        input.focus()
      }
    }, 100)
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>快速保存书签</DialogTitle>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <label for="url" class="text-sm font-medium">
            网址
          </label>
          <Input
            id="url"
            type="url"
            v-model="url"
            placeholder="输入网址，如 https://example.com"
            @keydown.enter="handleSave"
            :disabled="isSaving"
          />
          <p v-if="savingStatus" class="text-xs text-muted-foreground">
            {{ savingStatus }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel" :disabled="isSaving">
          取消
        </Button>
        <Button @click="handleSave" :disabled="!url.trim() || isSaving">
          <Loader2 v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>