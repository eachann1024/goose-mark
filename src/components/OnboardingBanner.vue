<script setup lang="ts">
const settingsStore = useSettingsStore()
const store = useBookmarkStore()

// 显示条件：未手动关闭引导（永远显示直到用户点击关闭）
const showOnboarding = computed(() => !settingsStore.onboardingDismissed)

const fileInputRef = ref<HTMLInputElement | null>(null)
const emit = defineEmits<{
  'import': [file: File]
  'export': []
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

const handleExport = () => {
  emit('export')
}
</script>

<template>
  <Transition name="fade">
    <div 
      v-if="showOnboarding"
      class="onboarding-banner rounded-xl border p-5 mb-4"
    >
      <div class="flex items-start gap-4">
        <div class="onboarding-banner__icon shrink-0 w-12 h-12 rounded-xl flex items-center justify-center">
          <span class="i-mdi-bookmark-plus text-2xl text-primary" />
        </div>
        
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-foreground mb-1">
            欢迎使用《鹅的书签》✨
          </h3>
          <p class="text-sm text-muted-foreground mb-2">
            导入已有数据可以直接开始使用：支持浏览器导出的 HTML、鹅的书签备份 JSON、网址精灵导出的 data.json。
          </p>
          <p class="text-xs text-muted-foreground mb-3">
            导入浏览器 HTML，由于只支持两层文件夹结构，所以后续导入的书签会被合并到根文件夹下。
          </p>
          
          <div class="flex items-center gap-2">
            <Button size="sm" @click="triggerImport">
              <span class="i-mdi-import mr-1.5" />
              导入书签
            </Button>
            <Button size="sm" variant="outline" @click="handleExport">
              <span class="i-mdi-export mr-1.5" />
              导出书签
            </Button>
            <input
              ref="fileInputRef"
              type="file"
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
.onboarding-banner {
  border-color: hsl(var(--primary) / 0.2);
  background: linear-gradient(
    135deg,
    hsl(var(--primary) / 0.05),
    hsl(var(--primary) / 0.1)
  );
}

.onboarding-banner__icon {
  background-color: hsl(var(--primary) / 0.1);
}

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
