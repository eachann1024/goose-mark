<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { Image } from '@/components/ui/image'
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
// 背景色：undefined 表示无背景色，保留用户原始选择
const localColor = ref<string | undefined>(
  props.modelValue?.type === 'text' ? props.modelValue.bgColor : undefined
)
const customText = ref(props.modelValue?.type === 'text' ? props.modelValue.value || '' : '')

// 图片相关状态
const localImageSrc = ref<string | null>(
  props.modelValue && (props.modelValue.type === 'file' || props.modelValue.type === 'remote') 
    ? (props.modelValue.type === 'file' ? props.modelValue.path : props.modelValue.src) 
    : null
)

// 随机颜色生成函数
const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)]

const colors = [
  '#F87171', '#FB923C', '#FACC15', '#A3E635', '#34D399', 
  '#22D3EE', '#3B82F6', '#818CF8', '#A78BFA', '#F472B6'
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

const selectColor = (c: string) => {
  localColor.value = c
  emitChange()
}

const clearColor = () => {
  localColor.value = undefined  // 清除背景色，设为无背景
  emitChange()
}

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
          src: localImageSrc.value
        })
      } else if (localImageSrc.value.startsWith('file://')) {
        emit('update:modelValue', {
          type: 'file',
          path: localImageSrc.value.replace('file://', '')
        })
      } else {
        // 本地路径
        emit('update:modelValue', {
          type: 'file',
          path: localImageSrc.value
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

// 触发文件选择
const fileInput = ref<HTMLInputElement | null>(null)
const triggerFileSelect = () => {
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
  // 用户手动切换到 text tab 时，如果当前无背景色，给一个随机背景色
  if (newTab === 'text' && oldTab === 'image' && !localColor.value) {
    localColor.value = getRandomColor()
  }
  emitChange()
})
</script>

<template>
  <div 
    ref="rootEl"
    class="p-5 bg-popover rounded-xl border border-border w-[420px] shadow-xl outline-none" 
    tabindex="0"
    @paste="handlePaste"
  >
     <!-- Tabs -->
     <div class="flex gap-6 border-b border-border pb-2 mb-5">
        <button 
          class="pb-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'image' ? 'text-primary' : 'text-muted-foreground'"
          @click="activeTab = 'image'"
        >
           图片图标
           <span v-if="activeTab === 'image'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
        </button>
        <button 
          class="pb-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'text' ? 'text-primary' : 'text-muted-foreground'"
          @click="activeTab = 'text'"
        >
           文字图标
           <span v-if="activeTab === 'text'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
        </button>
     </div>

     <!-- Main Content -->
     <div class="flex gap-5 mb-5">
        <!-- Preview Circle -->
        <div class="relative">
          <div 
            class="w-28 h-28 rounded-full flex items-center justify-center shrink-0 shadow-lg overflow-hidden border border-border/50"
            :class="{ 'bg-muted/30': activeTab === 'text' && !localColor }"
            :style="activeTab === 'text' && localColor ? { backgroundColor: localColor } : activeTab === 'image' ? { backgroundColor: '#1a1c20' } : {}"
          >
             <span v-if="activeTab === 'text'" class="font-bold text-3xl" :class="localColor ? 'text-white' : 'text-foreground'">{{ letters }}</span>
             <Image v-else-if="previewImageUrl" :src="previewImageUrl" class="w-full h-full object-cover" />
             <span v-else class="i-mdi-image-outline text-4xl text-muted-foreground" />
          </div>
          
          <!-- Tool buttons -->
          <div class="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
             <button 
               class="w-7 h-7 rounded-md bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
               title="编辑"
               @click="activeTab === 'image' ? triggerFileSelect() : undefined"
             >
               <span class="i-mdi-pencil-outline text-sm" />
             </button>
             <button 
               class="w-7 h-7 rounded-md bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
               title="清除"
               @click="clearIcon"
             >
               <span class="i-mdi-eraser text-sm" />
             </button>
          </div>
          
          
        </div>

        <!-- Right Panel -->
        <div class="flex-1 flex flex-col gap-3">
           <!-- Text input for text mode -->
           <div v-if="activeTab === 'text'" class="flex flex-col gap-2">
              <input 
                v-model="customText" 
                class="bg-muted/50 border border-input rounded-md px-3 py-2 text-sm w-full outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="输入文字..."
                @input="emitChange"
                maxlength="4"
              />
           </div>
           
           <!-- Image upload area for image mode -->
           <div 
             v-else 
             class="w-full h-20 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground text-xs gap-1 hover:bg-muted/20 cursor-pointer transition-colors"
             @click="triggerFileSelect"
           >
              <span class="i-mdi-plus text-lg" />
              <span>粘贴图片或链接</span>
           </div>
           
           <!-- Edit Icon Button -->
           <Button 
             variant="outline" 
             size="sm" 
             class="w-full"
             @click="triggerFileSelect"
           >
             选择文件
           </Button>
        </div>
     </div>

     <!-- Color Picker -->
     <div>
        <div class="text-xs text-muted-foreground mb-2">背景颜色</div>
        <div class="flex flex-wrap gap-2">
           <button 
             v-for="c in colors" 
             :key="c"
             class="w-8 h-8 rounded-lg border-2 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
             :class="localColor === c ? 'border-white shadow-md' : 'border-transparent'"
             :style="{ backgroundColor: c }"
             @click="selectColor(c)"
           />
           <button 
             class="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
             title="清除颜色"
             @click="clearColor"
           >
              <span class="i-mdi-close" />
           </button>
        </div>
     </div>
     
     <!-- Footer -->
     <div class="flex justify-end gap-2 mt-6">
         <Button variant="outline" size="sm" @click="$emit('close')">取消</Button>
         <Button size="sm" class="bg-primary hover:bg-primary/90" @click="emitChange(); $emit('confirm')">确定</Button>
     </div>
     
     <!-- Hidden file input -->
     <input 
       ref="fileInput"
       type="file" 
       accept="image/*" 
       class="hidden"
       @change="handleFileSelect"
     />
  </div>
</template>
