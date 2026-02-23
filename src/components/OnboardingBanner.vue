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
  const fallbackToInput = () => {
    fileInputRef.value?.click()
  }

  // uTools 环境优先使用原生文件选择器
  if (window.utools?.showOpenDialog) {
    try {
      const paths = await window.utools.showOpenDialog({
        title: '选择书签文件',
        filters: [{ name: '书签文件', extensions: ['html', 'htm', 'json'] }],
        properties: ['openFile']
      })

      const selectedPath = paths?.[0]
      if (!selectedPath) return

      const fileName = selectedPath.split(/[\\/]/).pop() || 'bookmarks.html'
      let content: string | undefined

      try {
        content = window.utools.readFileSync?.(selectedPath, 'utf-8')
      } catch (e) {
        console.warn('[Onboarding] uTools readFileSync failed:', e)
      }

      // 部分环境 uTools 不暴露 readFileSync，尝试回退到 Node fs
      if (typeof content !== 'string') {
        try {
          const fs = window.require?.('fs') as
            | { readFileSync?: (path: string, encoding: string) => unknown }
            | undefined
          const raw = fs?.readFileSync?.(selectedPath, 'utf-8')
          if (typeof raw === 'string') {
            content = raw
          } else if (raw && typeof (raw as { toString?: (encoding?: string) => string }).toString === 'function') {
            content = (raw as { toString: (encoding?: string) => string }).toString('utf-8')
          }
        } catch (e) {
          console.warn('[Onboarding] fs readFileSync fallback failed:', e)
        }
      }

      if (typeof content === 'string') {
        const file = new File([content], fileName, {
          type: fileName.toLowerCase().endsWith('.json') ? 'application/json' : 'text/html'
        })
        emit('import', file)
        return
      }

      window.utools?.showNotification?.('读取文件失败，请重新选择')
      fallbackToInput()
    } catch (e) {
      console.error('[Onboarding] triggerImport failed:', e)
      fallbackToInput()
    }
    return
  }

  // Web 环境回退到 input
  fallbackToInput()
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
