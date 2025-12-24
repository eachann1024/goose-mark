<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Image } from '@/components/ui/image'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import VuePictureCropper, { cropper } from 'vue-picture-cropper'
import type { IconSource } from '@/types/bookmark'

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
  return 'image'
}

const activeTab = ref<'image' | 'text'>(getInitialTab())
const imageColor = ref<string | undefined>(props.modelValue?.bgColor)
const textColor = ref<string | undefined>(props.modelValue?.bgColor)
const localColor = ref<string | undefined>(props.modelValue?.bgColor)
const customText = ref(props.modelValue?.type === 'text' ? props.modelValue.value || '' : '')

const localImageSrc = ref<string | null>(
  props.modelValue && (props.modelValue.type === 'file' || props.modelValue.type === 'remote') 
    ? (props.modelValue.type === 'file' ? props.modelValue.path : props.modelValue.src) 
    : null
)

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

const applyColor = (c: string | undefined) => {
  localColor.value = c
  if (activeTab.value === 'image') {
    imageColor.value = c
  } else {
    textColor.value = c
  }
  emitChange() // 颜色改变不需要确认，实时生效预览
}

const selectColor = (c: string) => applyColor(c)
const clearColor = () => applyColor(undefined)

const emitChange = () => {
  // 仅更新内部状态给父组件预览（如果有 need），实际确认靠 confirm
  // 但目前逻辑是实时 update:modelValue
  
  if (activeTab.value === 'text') {
    emit('update:modelValue', {
      type: 'text',
      value: letters.value,
      bgColor: localColor.value
    })
  } else {
    if (localImageSrc.value) {
      if (localImageSrc.value.startsWith('http') || localImageSrc.value.startsWith('data:')) {
        emit('update:modelValue', {
          type: 'remote',
          src: localImageSrc.value,
          bgColor: localColor.value
        })
      } else if (localImageSrc.value.startsWith('file://')) {
        emit('update:modelValue', {
          type: 'file',
          path: localImageSrc.value.replace('file://', ''),
          bgColor: localColor.value
        })
      } else {
        emit('update:modelValue', {
          type: 'file',
          path: localImageSrc.value,
          bgColor: localColor.value
        })
      }
    } else {
      emit('update:modelValue', null)
    }
  }
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

const handleCropConfirm = async () => {
  if (!cropper) return
  const data = await cropper.getDataURL()
  localImageSrc.value = data
  activeTab.value = 'image'
  showCropper.value = false
  emitChange()
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
  emitChange()
}, { immediate: true })

watch(
  () => props.modelValue,
  (val) => {
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
    class="relative p-5 bg-popover rounded-xl border border-border w-[420px] shadow-xl outline-none" 
    tabindex="0"
  >
     <!-- Tabs -->
     <div class="flex gap-3 border-b border-border pb-3 mb-5">
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
              <div 
               class="w-32 h-32 rounded-xl flex items-center justify-center shadow-lg overflow-hidden border border-border/50 bg-background transition-all"
                :style="localColor ? { backgroundColor: localColor } : {}"
              >
                 <span v-if="activeTab === 'text'" class="font-bold text-4xl" :class="localColor ? 'text-white' : 'text-foreground'">{{ letters }}</span>
                 <Image v-else-if="previewImageUrl" :src="previewImageUrl" class="w-full h-full object-contain" />
                 <span v-else class="i-mdi-image-outline text-4xl text-muted-foreground/50" />
              </div>

              <!-- Hover Overlay Actions -->
              <div class="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                 <template v-if="activeTab === 'image'">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          class="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-muted-foreground hover:text-primary shadow-sm"
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
                      class="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-muted-foreground hover:text-primary shadow-sm"
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
                @input="emitChange"
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
     <div class="flex justify-end gap-2 mt-2 pt-4 border-t border-border">
         <Button variant="ghost" size="sm" @click="$emit('close')">取消</Button>
         <Button size="sm" @click="emitChange(); $emit('confirm')">确定</Button>
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
          <Button @click="handleCropConfirm">确认裁剪</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </div>
</template>

<style scoped>
</style>
