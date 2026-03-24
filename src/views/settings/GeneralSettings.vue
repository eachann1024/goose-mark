<script setup lang="ts">
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'

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

const aiModels = ref<UToolsAiModel[]>([])
const aiModelsLoading = ref(false)
const aiModelsError = ref('')
const aiModelFallbackNotice = ref('')
const isAiModelPopoverOpen = ref(false)

const selectedAiModelLabel = computed(() => {
  const savedModel = settingsStore.customAiModel.trim()
  const selectedModel = aiModels.value.find(model => model.id === savedModel)

  if (selectedModel) return selectedModel.label
  if (aiModelsLoading.value) return '正在加载模型...'
  if (savedModel) return savedModel
  return '模型'
})

const canSelectAiModel = computed(() => {
  return settingsStore.useCustomAiModel && !aiModelsLoading.value && aiModels.value.length > 0
})

const handleAiModelSelect = (modelId: string) => {
  settingsStore.setCustomAiModel(modelId)
  isAiModelPopoverOpen.value = false
}

const ensureCustomAiModel = () => {
  if (settingsStore.useCustomAiModel && !settingsStore.customAiModel.trim()) {
    settingsStore.setCustomAiModel(DEFAULT_AI_MODEL)
  }
}

const aiModelUnavailable = computed(() => {
  return !!settingsStore.customAiModel && aiModels.value.length > 0 && !aiModels.value.some(model => model.id === settingsStore.customAiModel)
})

const aiModelHint = computed(() => {
  if (aiModelFallbackNotice.value) return aiModelFallbackNotice.value
  if (!settingsStore.useCustomAiModel) return '关闭后将使用 uTools 当前默认模型'
  if (aiModelsLoading.value) return '正在读取 uTools AI 模型列表'
  if (aiModelsError.value) return aiModelsError.value
  if (aiModels.value.length === 0) {
    return settingsStore.customAiModel
      ? `当前已保存模型 ${settingsStore.customAiModel}，但本机暂无可用模型`
      : '当前未获取到可用模型，请先在 uTools 中配置 AI'
  }
  if (aiModelUnavailable.value) return '当前模型不可用'
  return '选择后将保存该模型 ID，并用于当前 AI 功能'
})

const loadAiModels = async () => {
  aiModelsLoading.value = true
  aiModelsError.value = ''
  aiModelFallbackNotice.value = ''

  try {
    const models = await window.utools?.allAiModels?.()
    aiModels.value = Array.isArray(models)
      ? models.filter(model => model?.id && model?.label)
      : []

    if (aiModels.value.length === 0) {
      return
    }

    const savedModel = settingsStore.customAiModel.trim()
    const hasSavedModel = aiModels.value.some(model => model.id === savedModel)

    if (!hasSavedModel) {
      settingsStore.setCustomAiModel(aiModels.value[0].id)
      if (savedModel) {
        aiModelFallbackNotice.value = `已保存模型 ${savedModel} 不可用，已自动切换为 ${aiModels.value[0].label}`
      }
    }
  } catch (error) {
    console.error('[GeneralSettings] Load AI models failed:', error)
    aiModels.value = []
    aiModelsError.value = '模型列表读取失败，请稍后重试'
  } finally {
    aiModelsLoading.value = false
  }
}

const handleGridColumnsChange = (val: string | number) => {
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isFinite(num)) {
    settingsStore.setGridColumns(num)
  }
}

watch(() => settingsStore.useCustomAiModel, ensureCustomAiModel, { immediate: true })
onMounted(async () => {
  ensureCustomAiModel()
  await loadAiModels()
})

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
            <span class="sky-preview__main" />
            <span class="sky-preview__dot sky-preview__dot--1" />
            <span class="sky-preview__dot sky-preview__dot--2" />
            <span class="sky-preview__dot sky-preview__dot--3" />
          </div>
          <div class="text-left">
            <div class="text-sm font-medium">星空背景</div>
            <div class="text-xs text-muted-foreground">旋转星点与随机流星</div>
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

      <div class="settings-row mt-4">
        <div class="space-y-0.5">
          <div class="text-sm font-medium">岁月卡片</div>
          <div class="text-xs text-muted-foreground">关闭时使用普通白色卡片，开启后仅按最近打开时间改变边框颜色</div>
        </div>
        <Switch
          :model-value="settingsStore.agingCardEnabled"
          aria-label="岁月卡片"
          @update:model-value="(checked: boolean) => settingsStore.setAgingCardEnabled(checked)"
        />
      </div>
      <p class="text-xs text-muted-foreground mt-2">规则：3 天内保持默认边框；15 天内显示灰色边框；30 天内显示黄色边框；超过 30 天显示褐色边框。</p>
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

    <!-- AI 功能（uTools only） -->
    <div v-if="isUTools" class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">AI 功能</h3>
        <p class="settings-block__desc">配置 AI 助手（需先在 uTools 中开启 AI）</p>
      </div>
      <div class="space-y-4">
        <div class="settings-row">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">指定 AI 模型</div>
            <div class="text-xs text-muted-foreground">开启后优先使用所选模型，关闭则跟随 uTools 默认模型</div>
          </div>
          <Switch
            :model-value="settingsStore.useCustomAiModel"
            aria-label="指定 AI 模型"
            @update:model-value="(checked: boolean) => settingsStore.setUseCustomAiModel(checked)"
          />
        </div>
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <label class="text-sm text-muted-foreground shrink-0">模型</label>
            <Popover v-model:open="isAiModelPopoverOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  class="h-9 flex-1 justify-between px-3 font-normal"
                  :disabled="!canSelectAiModel"
                >
                  <span
                    class="truncate text-left"
                    :class="canSelectAiModel ? 'text-foreground' : 'text-muted-foreground'"
                  >
                    {{ selectedAiModelLabel }}
                  </span>
                  <span class="i-mdi-chevron-down ml-2 shrink-0 opacity-50 text-sm" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[var(--reka-popover-trigger-width)] p-1" align="start" side="bottom" :side-offset="8">
                <div class="max-h-64 overflow-y-auto">
                  <button
                    v-for="model in aiModels"
                    :key="model.id"
                    type="button"
                    class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                    @click="handleAiModelSelect(model.id)"
                  >
                    <span class="truncate">{{ model.label }}</span>
                    <span
                      v-if="settingsStore.customAiModel === model.id"
                      class="i-mdi-check text-primary text-sm ml-2 shrink-0"
                    />
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p class="text-xs text-muted-foreground">{{ aiModelHint }}</p>
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
  overflow: hidden;
  background:
    radial-gradient(circle at 50% -5%, rgb(25 53 84 / 0.95), transparent 52%),
    linear-gradient(180deg, #08111c 0%, #020204 62%, #000000 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 10px 20px rgb(0 0 0 / 0.18);
}

.sky-preview::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 0%, rgb(148 201 255 / 0.18), transparent 48%);
}

.sky-preview::after {
  content: '';
  position: absolute;
  top: 5px;
  left: -10px;
  width: 32px;
  height: 1px;
  background: linear-gradient(90deg, rgb(255 255 255 / 0), rgb(255 255 255 / 0.92), rgb(255 255 255 / 0));
  transform: rotate(25deg);
  animation: sky-meteor 3.6s ease-in-out infinite;
}

.sky-preview__main {
  position: absolute;
  top: 8px;
  left: 9px;
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: rgb(226 238 255 / 0.92);
  box-shadow:
    0 0 8px rgb(173 216 255 / 0.65),
    0 0 14px rgb(173 216 255 / 0.3);
  animation: sky-twinkle 2.4s ease-in-out infinite;
}

.sky-preview__dot {
  position: absolute;
  width: 2.5px;
  height: 2.5px;
  border-radius: 9999px;
  background: rgb(225 235 255 / 0.82);
  box-shadow: 0 0 5px rgb(173 216 255 / 0.38);
  animation: sky-dot 2.8s ease-in-out infinite;
}

.sky-preview__dot--1 { top: 10px; right: 9px; animation-delay: 0.2s; }
.sky-preview__dot--2 { top: 18px; left: 8px; animation-delay: 0.7s; }
.sky-preview__dot--3 { top: 22px; right: 12px; animation-delay: 1.2s; }

@keyframes sky-twinkle {
  0%, 100% { opacity: 0.5; transform: scale(0.86); }
  50% { opacity: 1; transform: scale(1.18); }
}
@keyframes sky-dot {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 0.85; transform: scale(1.12); }
}
@keyframes sky-meteor {
  0%, 58%, 100% { opacity: 0; transform: translate(-10px, -6px) rotate(25deg); }
  70% { opacity: 0.9; }
  84% { opacity: 0; transform: translate(24px, 16px) rotate(25deg); }
}
</style>
