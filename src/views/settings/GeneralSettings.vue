<script setup lang="ts">
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()

const { isUTools, isDark } = useAppState()

// 彩蛋开关的 computed（用于 v-model 双向绑定）
const easterEggEnabled = computed({
  get: () => settingsStore.easterEggEnabled,
  set: (val) => {
    settingsStore.setEasterEggEnabled(val)
  }
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
          <!-- Monochrome (Default) -->
          <div 
            class="flex flex-col items-center gap-2 cursor-pointer group"
            @click="themeStore.setTheme('default')"
          >
            <div 
              class="w-16 h-16 rounded-full border-2 flex overflow-hidden transition-all relative z-10"
              :class="themeStore.currentTheme === 'default' ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-border group-hover:border-primary/50'"
            >
              <div class="w-1/2 h-full bg-zinc-900"></div>
              <div class="w-1/2 h-full bg-white"></div>
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

        <!-- 背景模式选择 -->
        <div class="mt-6 pt-6 border-t border-border/50">
          <div class="flex items-center justify-between mb-4">
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium">背景显示</span>
              <span class="text-xs text-muted-foreground">选择深色模式下的背景样式</span>
            </div>
          </div>
          <div class="flex gap-3">
            <Button
              :variant="!settingsStore.useSolidBackground ? 'default' : 'outline'"
              class="flex-1 h-auto py-3 px-4 justify-start gap-3"
              @click="settingsStore.setUseSolidBackground(false)"
            >
              <div class="sky-preview shrink-0" aria-hidden="true">
                <span class="i-mdi-star-four-points sky-preview__main" />
                <span class="sky-preview__dot sky-preview__dot--1" />
                <span class="sky-preview__dot sky-preview__dot--2" />
                <span class="sky-preview__dot sky-preview__dot--3" />
              </div>
              <div class="text-left">
                <div class="text-sm font-medium">星空背景</div>
                <div class="text-xs text-muted-foreground">动态星空特效</div>
              </div>
            </Button>
            <Button
              :variant="settingsStore.useSolidBackground ? 'default' : 'outline'"
              class="flex-1 h-auto py-3 px-4 justify-start gap-3"
              @click="settingsStore.setUseSolidBackground(true)"
            >
              <div class="w-10 h-10 rounded-lg bg-[#2F3133] border border-white/10 shrink-0" />
              <div class="text-left">
                <div class="text-sm font-medium">纯色背景</div>
                <div class="text-xs text-muted-foreground">简洁纯色 #2F3133</div>
              </div>
            </Button>
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
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex items-center gap-2 shrink-0">
              <label class="text-sm text-muted-foreground shrink-0">每行数量</label>
              <Input
                type="number"
                min="2"
                max="5"
                step="1"
                class="h-9 w-16"
                :model-value="settingsStore.gridColumns"
                @update:model-value="handleGridColumnsChange"
              />
            </div>
            <div class="flex gap-1.5 shrink-0">
              <Button
                v-for="opt in gridColumnsOptions"
                :key="opt"
                size="sm"
                :variant="settingsStore.gridColumns === opt ? 'default' : 'outline'"
                class="h-8 w-10 px-0 shrink-0"
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
                  @update:model-value="(val: number[] | undefined) => {
                    if (val && val.length > 0) {
                      settingsStore.setWindowHeight(val[0])
                    }
                  }"
                />
                <span class="text-sm w-10 text-right">{{ settingsStore.windowHeight }}</span>
              </div>
            </div>
            
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <div class="text-sm font-medium">独立窗口自动关闭</div>
                <div class="text-xs text-muted-foreground">在独立窗口模式下，打开书签后自动关闭窗口</div>
              </div>
              <Button 
                :variant="settingsStore.autoCloseWindow ? 'default' : 'outline'"
                size="sm"
                @click="settingsStore.setAutoCloseWindow(!settingsStore.autoCloseWindow)"
              >
                {{ settingsStore.autoCloseWindow ? '已开启' : '点击开启' }}
              </Button>
            </div>
            
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <div class="text-sm font-medium">优先使用 uTools 内置浏览器</div>
                <div class="text-xs text-muted-foreground">不支持时将回退到系统默认浏览器</div>
              </div>
              <Button 
                :variant="settingsStore.preferUtoolsBrowser ? 'default' : 'outline'"
                size="sm"
                @click="settingsStore.setPreferUtoolsBrowser(!settingsStore.preferUtoolsBrowser)"
              >
                {{ settingsStore.preferUtoolsBrowser ? '已开启' : '点击开启' }}
              </Button>
            </div>
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
                :model-value="settingsStore.searchAutoExitSeconds"
                @update:model-value="(val) => settingsStore.setSearchAutoExitSeconds(Number(val))"
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
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <div class="text-sm font-medium">使用指定 AI 模型</div>
                <div class="text-xs text-muted-foreground">默认使用 deepseek-v3.2</div>
              </div>
              <Button 
                :variant="settingsStore.useCustomAiModel ? 'default' : 'outline'"
                size="sm"
                @click="settingsStore.setUseCustomAiModel(!settingsStore.useCustomAiModel)"
              >
                {{ settingsStore.useCustomAiModel ? '已开启' : '点击开启' }}
              </Button>
            </div>
            
            <div v-if="settingsStore.useCustomAiModel" class="flex items-center gap-3">
              <label class="text-sm text-muted-foreground shrink-0">模型</label>
              <Input
                class="h-9 flex-1"
                placeholder="例如 deepseek-v3.2 自定义模型名"
                :model-value="settingsStore.customAiModel"
                @update:model-value="(val) => settingsStore.setCustomAiModel(String(val))"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

  </div>
</template>

<style scoped>
.sky-preview {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.625rem;
  border: 1px solid rgb(255 255 255 / 0.12);
  overflow: hidden;
  background: #050505;
}

.sky-preview::after {
  content: '';
  position: absolute;
  inset: -40% auto auto -20%;
  width: 65%;
  height: 1px;
  background: linear-gradient(90deg, rgb(255 255 255 / 0), rgb(255 255 255 / 0.85), rgb(255 255 255 / 0));
  transform: rotate(-18deg);
  animation: sky-meteor 2.8s ease-in-out infinite;
}

.sky-preview__main {
  position: absolute;
  top: 7px;
  left: 9px;
  font-size: 16px;
  color: rgb(255 255 255 / 0.9);
  filter: drop-shadow(0 0 5px rgb(255 255 255 / 0.45));
  animation: sky-twinkle 1.8s ease-in-out infinite;
}

.sky-preview__dot {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.85);
  box-shadow: 0 0 6px rgb(255 255 255 / 0.45);
  animation: sky-dot 2.2s ease-in-out infinite;
}

.sky-preview__dot--1 {
  top: 9px;
  right: 8px;
  animation-delay: 0.2s;
}

.sky-preview__dot--2 {
  top: 19px;
  left: 7px;
  animation-delay: 0.6s;
}

.sky-preview__dot--3 {
  top: 22px;
  right: 12px;
  animation-delay: 1s;
}

@keyframes sky-twinkle {
  0%, 100% { opacity: 0.62; transform: scale(0.9) rotate(0deg); }
  50% { opacity: 1; transform: scale(1.08) rotate(8deg); }
}

@keyframes sky-dot {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 0.95; transform: scale(1.15); }
}

@keyframes sky-meteor {
  0%, 55%, 100% { opacity: 0; transform: translate(-18px, -8px) rotate(-18deg); }
  68% { opacity: 0.85; }
  82% { opacity: 0; transform: translate(28px, 20px) rotate(-18deg); }
}

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
