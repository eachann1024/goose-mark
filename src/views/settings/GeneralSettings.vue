<script setup lang="ts">
import ShareImportDialog from '@/components/ShareImportDialog.vue'

const themeStore = useThemeStore()
const settingsStore = useSettingsStore()

const { isUTools, isDark } = useAppState()

const showShareImportDialog = ref(false)

// 彩蛋：默认黑白主题悬停状态
const isHoveringDefaultTheme = ref(false)

// 彩蛋开关的 computed（用于 v-model 双向绑定）
const easterEggEnabled = computed({
  get: () => settingsStore.easterEggEnabled,
  set: (val) => settingsStore.setEasterEggEnabled(val)
})

const gridColumnsOptions = [2, 3, 4, 5]
const groupLayoutOptions: Array<{ value: 'wrap' | 'scroll'; label: string }> = [
  { value: 'wrap', label: '换行' },
  { value: 'scroll', label: '横向滚动' }
]

const handleGridColumnsChange = (val: string | number) => {
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isFinite(num)) {
    settingsStore.setGridColumns(num)
  }
}


</script>

<template>
  <div class="grid gap-6">
    <!-- Theme Selection Card -->
    <Card>
      <CardHeader>
        <CardTitle>主题风格</CardTitle>
        <CardDescription>选择应用的主题色系</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex gap-6">
          <!-- Monochrome (Default) with Easter Egg -->
          <div 
            class="flex flex-col items-center gap-2 cursor-pointer group"
            @click="themeStore.setTheme('default')"
            @mouseenter="isHoveringDefaultTheme = true"
            @mouseleave="isHoveringDefaultTheme = false"
          >
            <!-- 波纹容器 + 开关（相对定位的父容器） -->
            <div class="relative">
              <!-- 波纹动画层（仅深色模式且选中时显示） -->
              <div 
                v-if="isDark && themeStore.currentTheme === 'default'"
                class="absolute inset-0 rounded-full theme-ripple"
                :class="{ 'paused': isHoveringDefaultTheme }"
              />
              
              <!-- 圆形图标 -->
              <div 
                class="w-16 h-16 rounded-full border-2 flex overflow-hidden transition-all relative z-10"
                :class="themeStore.currentTheme === 'default' ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-border group-hover:border-primary/50'"
              >
                <div class="w-1/2 h-full bg-zinc-900"></div>
                <div class="w-1/2 h-full bg-white"></div>
              </div>

              <!-- 彩蛋开关（深色模式悬停时显示，居中覆盖在圆形图标上） -->
              <Transition name="fade-center">
                <div 
                  v-if="isDark && isHoveringDefaultTheme"
                  class="absolute inset-0 flex items-center justify-center z-30"
                  @click.stop
                >
                <div 
                  class="bg-popover/95 backdrop-blur-sm rounded-full p-2 shadow-lg border border-border"
                  @click="console.log('[Easter Egg] 开关容器被点击')"
                >
                  <Switch v-model:checked="easterEggEnabled" @click="console.log('[Easter Egg] Switch 被点击')" />
                </div>
                </div>
              </Transition>
            </div>
            
            <span 
              class="text-sm font-medium transition-colors"
              :class="themeStore.currentTheme === 'default' ? 'text-primary' : 'text-muted-foreground'"
            >默认黑白</span>
          </div>

          <!-- Coffee -->
          <div 
            class="flex flex-col items-center gap-2 cursor-pointer group"
            @click="themeStore.setTheme('coffee')"
          >
            <div 
              class="w-16 h-16 rounded-full border-2 flex overflow-hidden transition-all"
              :class="themeStore.currentTheme === 'coffee' ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-border group-hover:border-primary/50'"
            >
              <div class="w-1/2 h-full bg-[#392623]"></div>
              <div class="w-1/2 h-full bg-[#FEE9DF]"></div>
            </div>
            <span 
              class="text-sm font-medium transition-colors"
              :class="themeStore.currentTheme === 'coffee' ? 'text-primary' : 'text-muted-foreground'"
            >醇香拿铁</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Share Card -->
    <Card>
      <CardHeader>
        <CardTitle>在线分享</CardTitle>
        <CardDescription>开启后可分享书签分组给他人，或导入他人的公开分享</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <label class="flex items-center justify-between cursor-pointer">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">开启分享功能</div>
              <div class="text-xs text-muted-foreground">在书签页显示分享与管理按钮</div>
            </div>
            <Switch 
              v-model="settingsStore.enableShare"
            />
          </label>
          
          <div v-if="settingsStore.enableShare" class="pt-2 animate-in fade-in slide-in-from-top-2">
            <Button variant="outline" class="w-full h-9 border-dashed border-primary/30 text-primary/80 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors" @click="showShareImportDialog = true">
              <span class="i-mdi-share-variant mr-2 text-lg" />
              导入分享链接
            </Button>
            <p class="text-xs text-muted-foreground mt-2 px-1">
              提示：已导入的分组（绿色边框）和正在分享的分组（蓝色边框）将不受此开关影响，仍会保留。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Layout & Window -->
    <div class="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>布局</CardTitle>
          <CardDescription>设置主界面每行卡片数量（2-5）</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-3 max-w-xs">
            <label class="text-sm text-muted-foreground shrink-0">每行数量</label>
            <Input
              type="number"
              min="2"
              max="5"
              step="1"
              class="h-9"
              :value="settingsStore.gridColumns"
              @input="handleGridColumnsChange(($event.target as HTMLInputElement).value)"
            />
            <div class="flex gap-2">
              <Button
                v-for="opt in gridColumnsOptions"
                :key="opt"
                size="sm"
                :variant="settingsStore.gridColumns === opt ? 'default' : 'outline'"
                class="h-8 px-3"
                @click="settingsStore.setGridColumns(opt)"
              >
                {{ opt }}
              </Button>
            </div>
          </div>

          <div class="flex items-center gap-3 max-w-md mt-4">
            <label class="text-sm text-muted-foreground shrink-0">主分类展示</label>
            <div class="flex gap-2">
              <Button
                v-for="opt in groupLayoutOptions"
                :key="opt.value"
                size="sm"
                :variant="settingsStore.groupTabsLayout === opt.value ? 'default' : 'outline'"
                class="h-8 px-3"
                @click="settingsStore.setGroupTabsLayout(opt.value)"
              >
                {{ opt.label }}
              </Button>
            </div>
          </div>
          <p class="text-xs text-muted-foreground mt-2">默认换行显示，分类过多时可切换为横向滚动。</p>
        </CardContent>
      </Card>

      <!-- Window Behavior Card (uTools only) -->
      <Card v-if="isUTools">
        <CardHeader>
          <CardTitle>窗口行为</CardTitle>
          <CardDescription>设置窗口的交互方式</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-3 justify-between">
              <label class="text-sm font-medium">窗口高度</label>
              <div class="flex items-center gap-2 flex-1 max-w-[200px]">
                <Slider
                  :model-value="[settingsStore.windowHeight]"
                  :min="600"
                  :max="1000"
                  :step="10"
                  class="flex-1"
                  @update:model-value="(val: number[]) => settingsStore.setWindowHeight(val[0])"
                />
                <span class="text-sm w-10 text-right">{{ settingsStore.windowHeight }}</span>
              </div>
            </div>
            
            <label class="flex items-center justify-between cursor-pointer">
              <div class="space-y-0.5">
                <div class="text-sm font-medium">独立窗口自动关闭</div>
                <div class="text-xs text-muted-foreground">在独立窗口模式下，打开书签后自动关闭窗口</div>
              </div>
              <Switch 
                v-model:checked="settingsStore.autoCloseWindow"
              />
            </label>
            
            <label class="flex items-center justify-between cursor-pointer">
              <div class="space-y-0.5">
                <div class="text-sm font-medium">优先使用 uTools 内置浏览器</div>
                <div class="text-xs text-muted-foreground">不支持时将回退到系统默认浏览器</div>
              </div>
              <Switch 
                v-model:checked="settingsStore.preferUtoolsBrowser"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>搜索体验</CardTitle>
          <CardDescription>控制搜索界面的自动退出行为与输入方式</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col gap-4 max-w-md">

            <div class="flex items-center gap-3">
              <label class="text-sm text-muted-foreground shrink-0">自动退出搜索（秒）</label>
              <Input
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                class="h-9 w-20"
                placeholder="15"
                :value="settingsStore.searchAutoExitSeconds"
                @change="settingsStore.setSearchAutoExitSeconds(Number(($event.target as HTMLInputElement).value))"
              />
            </div>
            <p class="text-xs text-muted-foreground">设为 0 表示不自动关闭。</p>
          </div>
        </CardContent>
      </Card>

      <!-- AI Settings Card (uTools only) -->
      <Card v-if="isUTools">
        <CardHeader>
          <CardTitle>AI 功能</CardTitle>
          <CardDescription>配置 AI 智能辅助功能（需在 uTools 中开启 AI）</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col gap-4">
            <label class="flex items-center justify-between cursor-pointer">
              <div class="space-y-0.5">
                <div class="text-sm font-medium">使用指定 AI 模型</div>
                <div class="text-xs text-muted-foreground">默认使用 deepseek-v3</div>
              </div>
              <Switch 
                v-model:checked="settingsStore.useCustomAiModel"
              />
            </label>

            <div v-if="settingsStore.useCustomAiModel" class="flex items-center gap-3">
              <label class="text-sm text-muted-foreground shrink-0">模型</label>
              <Input
                class="h-9 flex-1"
                placeholder="例如 deepseek-v3 自定义模型名"
                :value="settingsStore.customAiModel"
                @input="settingsStore.setCustomAiModel(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Share Import -->
    <ShareImportDialog v-model:open="showShareImportDialog" />
  </div>
</template>

<style scoped>
/* 波纹动画 */
@keyframes ripple {
  0% {
    box-shadow: 
      0 0 0 0 rgba(255, 255, 255, 0.4),
      0 0 0 0 rgba(255, 255, 255, 0.3),
      0 0 0 0 rgba(255, 255, 255, 0.2);
  }
  100% {
    box-shadow: 
      0 0 0 10px rgba(255, 255, 255, 0),
      0 0 0 20px rgba(255, 255, 255, 0),
      0 0 0 30px rgba(255, 255, 255, 0);
  }
}

.theme-ripple {
  animation: ripple 3s ease-out infinite;
}

.theme-ripple.paused {
  animation-play-state: paused;
}

/* Switch 淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-8px);
}

/* 居中开关缩放动画 */
.fade-center-enter-active,
.fade-center-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-center-enter-from,
.fade-center-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
