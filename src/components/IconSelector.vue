<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'
import VuePictureCropper, { cropper } from 'vue-picture-cropper'
import type { IconSource } from '@/types/bookmark'
import BookmarkIcon from '@/components/BookmarkIcon.vue'

const props = defineProps<{
  modelValue?: IconSource
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: IconSource | null): void
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const rootEl = ref<HTMLElement | null>(null)

onMounted(() => {
  nextTick(() => {
    // 聚焦以支持粘贴快捷键，但在 web 环境可能会有 outline 问题，所以仅尝试聚焦
    rootEl.value?.focus()
  })
})

const getInitialTab = () => {
  if (!props.modelValue) return 'text'
  if (props.modelValue.type === 'text') return 'text'
  // custom、file、remote 都使用 image 标签
  return 'image'
}

const activeTab = ref<'image' | 'text'>(getInitialTab())
const imageColor = ref<string | undefined>(props.modelValue?.bgColor)
const textColor = ref<string | undefined>(props.modelValue?.bgColor)
const localColor = ref<string | undefined>(props.modelValue?.bgColor)
const customText = ref(props.modelValue?.type === 'text' ? props.modelValue.value || '' : '')

const resolveImageSrc = (icon?: IconSource | null) => {
  if (!icon) return null
  if (icon.type === 'file') return icon.path
  if (icon.type === 'remote') return icon.src
  if (icon.type === 'custom') return icon.data
  return null
}

const localImageSrc = ref<string | null>(resolveImageSrc(props.modelValue))

// Cropper State
const showCropper = ref(false)
const cropperImg = ref('')

const colors = [
  '#000000', '#FFFFFF', '#EF4444', '#F59E0B', '#22C55E',
  '#0EA5E9', '#6366F1', '#F472B6'
]

const letters = computed(() => {
  if (customText.value) return customText.value.slice(0, 4).toUpperCase()
  return (props.title || '').slice(0, 4).toUpperCase()
})

const previewImageUrl = computed(() => {
  if (activeTab.value === 'text') return null
  // 如果正在裁剪，优先显示裁剪结果(这里暂不需实时，确认后再更新 localImageSrc)
  return localImageSrc.value
})

const previewIconObject = computed<IconSource | null>(() => {
  if (activeTab.value === 'text') {
    return {
      type: 'text',
      value: letters.value,
      bgColor: localColor.value
    }
  } else {
    if (!previewImageUrl.value) return null
    return {
      type: 'remote', // 这里的 type 仅用于 BookmarkIcon 内部渲染逻辑，remote 足够通用
      src: previewImageUrl.value,
      bgColor: localColor.value
    }
  }
})

const applyColor = (c: string | undefined) => {
  localColor.value = c
  if (activeTab.value === 'image') {
    imageColor.value = c
  } else {
    textColor.value = c
  }
  // 颜色改变实时生效预览，但不发送到父组件
}

const selectColor = (c: string) => applyColor(c)
const clearColor = () => applyColor(undefined)

// 只有确认时才发送最终结果
const emitFinalChange = () => {
  if (activeTab.value === 'text') {
    emit('update:modelValue', {
      type: 'text',
      value: letters.value,
      bgColor: localColor.value
    })
  } else if (localImageSrc.value) {
    let iconData: IconSource
    if (localImageSrc.value.startsWith('data:')) {
      iconData = { type: 'custom', data: localImageSrc.value, bgColor: localColor.value }
    } else if (localImageSrc.value.startsWith('http')) {
      iconData = { type: 'remote', src: localImageSrc.value, bgColor: localColor.value }
    } else if (localImageSrc.value.startsWith('file://')) {
      iconData = { type: 'file', path: localImageSrc.value.replace('file://', ''), bgColor: localColor.value }
    } else {
      iconData = { type: 'file', path: localImageSrc.value, bgColor: localColor.value }
    }
    emit('update:modelValue', iconData)
  } else {
    emit('update:modelValue', null)
  }
}

// 实时预览更新（不发送到父组件）
const updatePreview = () => {
  // 这个函数现在只用于更新本地预览，不发送事件
}

// 粘贴处理
useEventListener(window, 'paste', (e: ClipboardEvent) => {
  // 如果当前组件未被销毁但不可见（例如被覆盖），虽然 Dialog 应该销毁组件，但保险起见
  // 在这里我们依赖 Dialog 的 v-if 特性。
  
  // 排除输入框
  const active = document.activeElement as HTMLElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    return
  }

  const items = e.clipboardData?.items
  if (!items) return
  
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      e.preventDefault() // 阻止默认粘贴行为
      e.stopPropagation() // 阻止冒泡

      const blob = item.getAsFile()
      if (blob) {
        const reader = new FileReader()
        reader.onload = (event) => {
          openCropper(event.target?.result as string)
        }
        reader.readAsDataURL(blob)
      }
      break
    }
  }
})

const clearIcon = () => {
  localImageSrc.value = null
  customText.value = ''
  emit('update:modelValue', null)
}

const colorInput = ref<HTMLInputElement | null>(null)
const triggerPickColor = () => {
  // 确保元素存在再点击
  if (colorInput.value) {
    colorInput.value.click()
  }
}
const handleColorPicked = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  applyColor(val)
}

const fileInput = ref<HTMLInputElement | null>(null)
const triggerFileSelect = () => {
  activeTab.value = 'image'
  if (fileInput.value) {
    fileInput.value.value = '' // reset
    fileInput.value.click()
  }
}

const handleFileSelect = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (event) => {
    openCropper(event.target?.result as string)
  }
  reader.readAsDataURL(file)
}

// 裁剪相关逻辑
const openCropper = (imgSrc: string) => {
  cropperImg.value = imgSrc
  showCropper.value = true
}

const handleCropConfirm = async (event?: Event) => {
  event?.stopPropagation()
  if (!cropper) return

  const data = await cropper.getDataURL()
  if (!data) return

  localImageSrc.value = data
  activeTab.value = 'image'
  showCropper.value = false

  await nextTick()
  emitFinalChange()
}

// 编辑现有图片
const handleEditImage = () => {
  if (localImageSrc.value) {
    openCropper(localImageSrc.value)
  }
}

watch(activeTab, (newTab) => {
  if (newTab === 'text') {
    localColor.value = textColor.value
  } else {
    localColor.value = imageColor.value
  }
  // 不再立即发送图标更新，只更新预览
}, { immediate: false })

watch(
  () => props.modelValue,
  (val) => {
    const nextSrc = resolveImageSrc(val)
    if (nextSrc !== localImageSrc.value) {
      localImageSrc.value = nextSrc
    }
    if (val?.type === 'text') {
      customText.value = val.value || ''
    } else if (val) {
      customText.value = ''
    }
    if (val?.bgColor) {
      localColor.value = val.bgColor
      imageColor.value = val.bgColor
      if (activeTab.value === 'text') {
        textColor.value = val.bgColor
      }
    }
  },
  { deep: true }
)
</script>

<template>
  <div 
    ref="rootEl"
    class="relative p-6 bg-popover rounded-2xl border-0 w-[420px] shadow-2xl outline-none" 
    tabindex="0"
  >
     <!-- Tabs -->
     <div class="flex gap-3 border-b border-border/30 pb-3 mb-5">
        <Button 
          variant="ghost"
          size="sm"
          class="relative rounded-full"
          :class="activeTab === 'image' ? 'text-primary bg-primary/10' : 'text-muted-foreground'"
          @click="activeTab = 'image'"
        >
           图片图标
        </Button>
        <Button 
          variant="ghost"
          size="sm"
          class="relative rounded-full"
          :class="activeTab === 'text' ? 'text-primary bg-primary/10' : 'text-muted-foreground'"
          @click="activeTab = 'text'"
        >
           文字图标
        </Button>
     </div>

    <!-- Main Content -->
    <div class="flex gap-5 mb-5 items-start">
        <!-- Preview / Action Area -->
        <div class="flex-1 flex justify-center">
           <div class="relative group">
              <BookmarkIcon 
                :icon="previewIconObject"
                :fallback-text="title"
                size="custom"
                custom-size-class="w-32 h-32 rounded-xl"
                class="shadow-lg border border-border/50 bg-background"
              />

              <!-- Hover Overlay Actions -->
              <div class="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                 <template v-if="activeTab === 'image'">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          class="h-8 w-8 rounded-full shadow-sm"
                          @click="triggerFileSelect"
                        >
                          <span class="i-mdi-upload text-sm" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>选择图片，或直接粘贴 (Ctrl+V)</p>
                      </TooltipContent>
                    </Tooltip>

                    <Button 
                      v-if="previewImageUrl"
                      size="icon" 
                      variant="secondary" 
                      class="h-8 w-8 rounded-full shadow-sm"
                      title="裁剪/编辑"
                      @click="handleEditImage"
                    >
                      <span class="i-mdi-crop text-sm" />
                    </Button>
                 </template>
              </div>

               <!-- Clear Button (Always visible if value exists) -->

               <Button 
                 v-if="(activeTab === 'image' && previewImageUrl) || (activeTab === 'text' && customText)"
                 size="icon"
                 variant="destructive"
                 class="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md z-10"
                 title="清除"
                 @click="clearIcon"
               >
                 <span class="i-mdi-close text-xs" />
               </Button>
           </div>
        </div>

        <!-- Right Configuration Panel -->
        <div class="w-48 flex flex-col gap-4">
           <!-- Text Input -->
           <div v-if="activeTab === 'text'" class="flex flex-col gap-2">
              <label class="text-xs text-muted-foreground">文字内容</label>
              <Input
                v-model="customText"
                placeholder="输入 1-4 个字符"
                maxlength="4"
                class="bg-muted/50"
              />
           </div>

           <!-- Color Picker -->
           <div class="flex flex-col gap-2">
              <label class="text-xs text-muted-foreground">背景颜色</label>
              <div class="grid grid-cols-4 gap-2">
                 <button 
                   v-for="c in colors" 
                   :key="c"
                   class="w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
                   :class="localColor === c ? 'ring-2 ring-primary ring-offset-1' : ''"
                   :style="{ backgroundColor: c }"
                   @click="selectColor(c)"
                 />
                 <!-- Clear BG -->
                 <button 
                   class="w-8 h-8 rounded-full border border-dashed border-border flex items-center justify-center hover:border-destructive hover:text-destructive text-muted-foreground transition-colors"
                   title="无背景"
                   :class="!localColor ? 'border-primary text-primary' : ''"
                   @click="clearColor"
                 >
                    <span class="i-mdi-format-color-highlight text-xs" />
                 </button>
                 <!-- Custom Color -->
                 <button 
                   class="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                   title="自定义颜色"
                   @click="triggerPickColor"
                 >
                   <span class="i-mdi-eyedropper-variant text-xs" />
                 </button>
              </div>
           </div>
        </div>
     </div>
     
     <!-- Footer -->
     <div class="flex justify-end gap-2 mt-2 pt-4 border-t border-border/30">
         <Button variant="ghost" size="sm" @click="$emit('close')">取消</Button>
         <Button size="sm" @click="emitFinalChange(); $emit('confirm')">确定</Button>
     </div>
     
     <!-- Hidden Inputs -->
     <input 
       ref="fileInput"
       type="file" 
       accept="image/*" 
       class="hidden"
       @change="handleFileSelect"
     />
    <input 
      ref="colorInput"
      type="color"
      class="absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
      @input="handleColorPicked"
    />

    <!-- Cropper Dialog -->
    <Dialog v-model:open="showCropper">
      <DialogContent class="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>编辑图片</DialogTitle>
        </DialogHeader>
        <div class="w-full h-[300px] mt-2 border rounded-md overflow-hidden bg-black/5">
          <VuePictureCropper
            :boxStyle="{ width: '100%', height: '100%', backgroundColor: '#f8f8f8', margin: 'auto' }"
            :img="cropperImg"
            :options="{
              viewMode: 1,
              dragMode: 'move',
              aspectRatio: 1,
            }"
          />
        </div>
        <DialogFooter class="mt-4">
          <Button variant="outline" @click="showCropper = false">取消</Button>
          <Button @click="handleCropConfirm($event)">确认裁剪</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </div>
</template>

<style scoped>
</style>
