<script setup lang="ts">
const settingsStore = useSettingsStore()
const store = useBookmarkStore()

// 显示条件：未关闭引导 且 书签数量少于 5 个
const showOnboarding = computed(() => 
  !settingsStore.onboardingDismissed && store.bookmarks.length < 5
)

const fileInputRef = ref<HTMLInputElement | null>(null)
const emit = defineEmits<{
  'import': [file: File]
}>()

const triggerImport = async () => {
  // uTools 环境优先使用原生文件选择器
  if (window.utools?.showOpenDialog) {
    const paths = await window.utools.showOpenDialog({
      title: '选择书签文件',
      filters: [{ name: '书签文件', extensions: ['html', 'htm', 'json'] }],
      properties: ['openFile']
    })
    if (paths?.[0]) {
      // uTools 读取文件内容
      const content = window.utools.readFileSync?.(paths[0], 'utf-8')
      if (content) {
        // 构造一个 File 对象传给父组件，保持接口一致
        const fileName = paths[0].split('/').pop() || 'bookmarks.html'
        const file = new File([content], fileName, { type: 'text/html' })
        emit('import', file)
      }
    }
    return
  }
  // Web 环境回退到 input
  fileInputRef.value?.click()
}

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('import', file)
  }
  input.value = ''
}

const dismiss = () => {
  settingsStore.dismissOnboarding()
}
</script>

<template>
  <Transition name="fade">
    <div 
      v-if="showOnboarding"
      class="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-5 mb-4"
    >
      <div class="flex items-start gap-4">
        <div class="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <span class="i-mdi-bookmark-plus text-2xl text-primary" />
        </div>
        
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-foreground mb-1">
            👋 欢迎使用书签管理
          </h3>
          <p class="text-sm text-muted-foreground mb-3">
            你可以从浏览器导入已有书签，快速开始整理。支持 Chrome、Edge、Firefox 导出的 HTML 文件。
          </p>
          
          <div class="flex items-center gap-2">
            <Button size="sm" @click="triggerImport">
              <span class="i-mdi-import mr-1.5" />
              导入浏览器书签
            </Button>
            <Button variant="ghost" size="sm" @click="dismiss">
              以后再说
            </Button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".html,.htm,.json"
              class="hidden"
              @change="handleFileSelect"
            />
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          class="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
          @click="dismiss"
        >
          <span class="i-mdi-close" />
        </Button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
