<script setup lang="ts">
import { DEFAULT_AI_MODEL } from '@/constants/ai'

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

const ensureCustomAiModel = () => {
  if (settingsStore.useCustomAiModel && !settingsStore.customAiModel.trim()) {
    settingsStore.setCustomAiModel(DEFAULT_AI_MODEL)
  }
}

const customAiModelValue = computed(() => settingsStore.customAiModel.trim() || DEFAULT_AI_MODEL)

const handleGridColumnsChange = (val: string | number) => {
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isFinite(num)) {
    settingsStore.setGridColumns(num)
  }
}

watch(() => settingsStore.useCustomAiModel, ensureCustomAiModel, { immediate: true })
onMounted(ensureCustomAiModel)

</script>

<template>
  <div class="flex flex-col gap-3">

    <!-- 外观 -->
    <div v-if="isDark" class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">外观</h3>
        <p class="settings-block__desc">控制深色模式下的背景显示效果</p>
      </div>
      <div class="flex gap-3">
        <Button
          :variant="!settingsStore.useSolidBackground ? 'default' : 'ghost'"
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
            <div class="text-xs text-muted-foreground">带动态效果</div>
          </div>
        </Button>
        <Button
          :variant="settingsStore.useSolidBackground ? 'default' : 'ghost'"
          class="flex-1 h-auto py-3 px-4 justify-start gap-3"
          @click="settingsStore.setUseSolidBackground(true)"
        >
          <div class="background-preview background-preview--dark shrink-0" aria-hidden="true">
            <span class="i-mdi-moon-waning-crescent text-lg text-white/85" />
          </div>
          <div class="text-left">
            <div class="text-sm font-medium">纯色背景</div>
            <div class="text-xs text-muted-foreground">沉浸纯净，更聚焦内容</div>
          </div>
        </Button>
      </div>
    </div>

    <!-- 布局 -->
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">布局</h3>
        <p class="settings-block__desc">设置主页每行显示多少张卡片（2-5）</p>
      </div>
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2 shrink-0">
          <label class="text-sm text-muted-foreground shrink-0">每行卡片</label>
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
            :variant="settingsStore.gridColumns === opt ? 'default' : 'ghost'"
            class="h-8 w-10 px-0 shrink-0"
            @click="settingsStore.setGridColumns(opt)"
          >
            {{ opt }}
          </Button>
        </div>
      </div>

      <div class="flex items-center gap-3 mt-3">
        <label class="text-sm text-muted-foreground shrink-0">主分组展示</label>
        <div class="flex gap-2">
          <Button
            v-for="opt in groupLayoutOptions"
            :key="opt.value"
            size="sm"
            :variant="settingsStore.groupTabsLayout === opt.value ? 'default' : 'ghost'"
            class="h-8 px-3"
            @click="settingsStore.setGroupTabsLayout(opt.value)"
          >
            {{ opt.label }}
          </Button>
        </div>
      </div>
      <p class="text-xs text-muted-foreground mt-2">默认自动换行，分组较多时可改为横向滚动。</p>
    </div>

    <!-- 窗口行为（uTools only） -->
    <div v-if="isUTools" class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">窗口行为</h3>
        <p class="settings-block__desc">控制窗口大小与打开方式</p>
      </div>
      <div class="space-y-4">
        <div class="settings-row">
          <label class="text-sm font-medium">窗口高度</label>
          <div class="flex items-center gap-3 flex-1 max-w-[220px]">
            <Slider
              :model-value="[settingsStore.windowHeight]"
              :min="460"
              :max="900"
              :step="10"
              class="flex-1"
              @update:model-value="(val: number[] | undefined) => {
                if (val && val.length > 0) {
                  settingsStore.setWindowHeight(val[0])
                }
              }"
            />
            <span class="text-sm w-10 text-right tabular-nums">{{ settingsStore.windowHeight }}</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">独立窗口自动关闭</div>
            <div class="text-xs text-muted-foreground">独立窗口打开书签后自动关闭当前窗口</div>
          </div>
          <Switch
            :model-value="settingsStore.autoCloseWindow"
            aria-label="独立窗口自动关闭"
            @update:model-value="(checked: boolean) => settingsStore.setAutoCloseWindow(checked)"
          />
        </div>
        <div class="settings-row">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">优先使用 uTools 内置浏览器</div>
            <div class="text-xs text-muted-foreground">不可用时会自动改用系统浏览器</div>
          </div>
          <Switch
            :model-value="settingsStore.preferUtoolsBrowser"
            aria-label="优先使用 uTools 内置浏览器"
            @update:model-value="(checked: boolean) => settingsStore.setPreferUtoolsBrowser(checked)"
          />
        </div>
      </div>
    </div>

    <!-- 搜索 -->
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">搜索</h3>
        <p class="settings-block__desc">控制搜索页在无操作时的自动关闭时间</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-sm text-muted-foreground shrink-0">无操作后自动关闭（秒）</label>
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
      <p class="text-xs text-muted-foreground mt-2">设为 0 表示保持常驻，不自动关闭。</p>
    </div>

    <!-- AI 功能（uTools only） -->
    <div v-if="isUTools" class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">AI 功能</h3>
        <p class="settings-block__desc">配置 AI 助手（需先在 uTools 中开启 AI）</p>
      </div>
      <div class="space-y-4">
        <div class="settings-row">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">使用自定义 AI 模型</div>
            <div class="text-xs text-muted-foreground">默认优先 deepseek-v3.2，不可用时自动回退</div>
          </div>
          <Switch
            :model-value="settingsStore.useCustomAiModel"
            aria-label="使用自定义 AI 模型"
            @update:model-value="(checked: boolean) => settingsStore.setUseCustomAiModel(checked)"
          />
        </div>
        <div v-if="settingsStore.useCustomAiModel" class="space-y-2">
          <div class="flex items-center gap-3">
            <label class="text-sm text-muted-foreground shrink-0">模型</label>
            <Input
              class="h-9 flex-1"
              :placeholder="DEFAULT_AI_MODEL"
              :model-value="customAiModelValue"
              @update:model-value="(val) => settingsStore.setCustomAiModel(String(val))"
            />
          </div>
          <p class="text-xs text-muted-foreground">
            默认已填 {{ DEFAULT_AI_MODEL }}。如果提示模型不可用，请检查模型名是否正确，或关闭自定义模型改用默认配置。
          </p>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.background-preview {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.background-preview--dark {
  background: linear-gradient(180deg, #3a3d41 0%, #2f3133 100%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
}

.background-preview--white {
  background: linear-gradient(180deg, #ffffff 0%, #f6f7f8 100%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.8);
}

.background-preview--soft {
  background: linear-gradient(180deg, #f4f4f4 0%, #ececec 100%);
}
</style>

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

.sky-preview__dot--1 { top: 9px; right: 8px; animation-delay: 0.2s; }
.sky-preview__dot--2 { top: 19px; left: 7px; animation-delay: 0.6s; }
.sky-preview__dot--3 { top: 22px; right: 12px; animation-delay: 1s; }

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
</style>
