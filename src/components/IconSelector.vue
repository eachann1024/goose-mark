<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { Image } from '@/components/ui/image'
import { Input } from '@/components/ui/input'
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
    rootEl.value?.focus()
  })
})

// 根据传入的值判断初始 tab
const getInitialTab = () => {
  if (!props.modelValue) return 'text'
  if (props.modelValue.type === 'text') return 'text'
  return 'image'
}

const activeTab = ref<'image' | 'text'>(getInitialTab())
// 独立记住图片/文字模式的背景色
const imageColor = ref<string | undefined>(props.modelValue?.bgColor)
const textColor = ref<string | undefined>(props.modelValue?.bgColor)
const localColor = ref<string | undefined>(props.modelValue?.bgColor)
const customText = ref(props.modelValue?.type === 'text' ? props.modelValue.value || '' : '')

// 图片相关状态
const localImageSrc = ref<string | null>(
  props.modelValue && (props.modelValue.type === 'file' || props.modelValue.type === 'remote') 
    ? (props.modelValue.type === 'file' ? props.modelValue.path : props.modelValue.src) 
    : null
)

const colors = [
  '#000000', '#FFFFFF', '#EF4444', '#F59E0B', '#22C55E',
  '#0EA5E9', '#6366F1', '#F472B6'
]

const letters = computed(() => {
  if (customText.value) return customText.value.slice(0, 4).toUpperCase()
  return (props.title || '').slice(0, 4).toUpperCase()
})

// 当前预览的图标 URL
const previewImageUrl = computed(() => {
  if (activeTab.value === 'text') return null
  return localImageSrc.value
})

const applyColor = (c: string | undefined) => {
  localColor.value = c
  if (activeTab.value === 'image') {
    imageColor.value = c
  } else {
    textColor.value = c
  }
  emitChange()
}

const selectColor = (c: string) => applyColor(c)

const clearColor = () => applyColor(undefined)  // 清除背景色，设为无背景

const emitChange = () => {
  // 根据用户当前所在 tab 决定保存的图标类型
  if (activeTab.value === 'text') {
    emit('update:modelValue', {
      type: 'text',
      value: letters.value,
      bgColor: localColor.value  // undefined 表示无背景色
    })
  } else {
    // 图片模式
    if (localImageSrc.value) {
      // 判断图片类型：http/https/data: 开头用 remote，file:// 开头用 file
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
        // 本地路径
        emit('update:modelValue', {
          type: 'file',
          path: localImageSrc.value,
          bgColor: localColor.value
        })
      }
    } else {
      // 图片模式但没有图片，emit null 让外部使用默认 fallback
      emit('update:modelValue', null)
    }
  }
}

// 处理粘贴上传
const handlePaste = async (e: ClipboardEvent) => {
  activeTab.value = 'image' // Switch to image tab on paste
  const items = e.clipboardData?.items
  if (!items) return
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile()
      if (blob) {
        const reader = new FileReader()
        reader.onload = (event) => {
          localImageSrc.value = event.target?.result as string
          emitChange()
        }
        reader.readAsDataURL(blob)
      }
      break
    }
    // 已移除 text/plain URL 处理：历史遗留代码会将粘贴的 URL 错误设为图标源导致数据混乱
  }
}

// 清除图标
const clearIcon = () => {
  localImageSrc.value = null
  customText.value = ''
  emit('update:modelValue', null)
}

const colorInput = ref<HTMLInputElement | null>(null)
const triggerPickColor = () => colorInput.value?.click()
const handleColorPicked = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  applyColor(val)
}

// 触发文件选择
const fileInput = ref<HTMLInputElement | null>(null)
const triggerFileSelect = () => {
  activeTab.value = 'image'
  fileInput.value?.click()
}

const handleFileSelect = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (event) => {
    localImageSrc.value = event.target?.result as string
    emitChange()
  }
  reader.readAsDataURL(file)
}

// Tab 切换时同步状态
watch(activeTab, (newTab, oldTab) => {
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
    @paste="handlePaste"
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
    <div class="flex gap-5 mb-5">
        <!-- Preview Card -->
        <div class="relative">
          <div 
           class="w-28 h-28 rounded-xl flex items-center justify-center shrink-0 shadow-lg overflow-hidden border border-border/50 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
            :style="localColor ? { backgroundColor: localColor } : {}"
            title="点击更换图片"
            @click="triggerFileSelect"
          >
             <span v-if="activeTab === 'text'" class="font-bold text-2xl" :class="localColor ? 'text-white' : 'text-foreground'">{{ letters }}</span>
             <Image v-else-if="previewImageUrl" :src="previewImageUrl" class="w-20 h-20 object-contain" />
             <span v-else class="i-mdi-image-outline text-3xl text-muted-foreground" />
          </div>
          
          <!-- Tool buttons -->
          <div class="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
             <Button 
               size="icon"
               variant="secondary"
               class="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive"
               title="清除"
               @click="clearIcon"
             >
               <span class="i-mdi-eraser text-sm" />
             </Button>
          </div>
          
          
        </div>

        <!-- Right Panel -->
        <div class="flex-1 flex flex-col gap-3">
           <!-- Text input for text mode -->
           <div v-if="activeTab === 'text'" class="flex flex-col gap-2">
              <Input 
                v-model="customText" 
                placeholder="输入文字..."
                maxlength="4"
                class="bg-muted/50 border-input px-4 py-3"
                @input="emitChange"
              />
           </div>
           
           <!-- Image upload area for image mode -->
           <div 
             v-else 
             class="w-full h-28 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground text-xs gap-1 hover:bg-muted/20 cursor-pointer transition-colors"
             @click="triggerFileSelect"
           >
              <span class="i-mdi-plus text-lg" />
              <span>粘贴图片或链接</span>
           </div>
        </div>
     </div>

     <!-- Color Picker -->
     <div>
        <div class="text-xs text-muted-foreground mb-2">背景颜色</div>
        <div class="grid grid-cols-5 gap-2">
           <button 
             v-for="c in colors" 
             :key="c"
             class="w-8 h-8 rounded-lg ring-1 ring-border/50 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
             :class="localColor === c ? 'ring-2 ring-primary shadow-md' : ''"
             :style="{ backgroundColor: c }"
             @click="selectColor(c)"
           />
           <button 
             class="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
             title="清除背景"
             @click="clearColor"
           >
              <span class="i-mdi-close-thick" />
           </button>
           <button 
             class="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
             title="取色"
             @click="triggerPickColor"
           >
             <span class="i-mdi-eyedropper-variant" />
           </button>
        </div>
     </div>
     
     <!-- Footer -->
     <div class="flex justify-end gap-2 mt-6">
         <Button variant="outline" size="sm" @click="$emit('close')">取消</Button>
         <Button size="sm" class="bg-primary hover:bg-primary/90" @click="emitChange(); $emit('confirm')">确定</Button>
     </div>
     
     <!-- Hidden file input -->
     <Input 
       ref="fileInput"
       type="file" 
       accept="image/*" 
       class="hidden"
       @change="handleFileSelect"
     />
    <input 
      ref="colorInput"
      type="color"
      class="absolute left-1/2 top-1/2 w-0 h-0 opacity-0 pointer-events-none"
      @input="handleColorPicked"
    />
  </div>
</template>
