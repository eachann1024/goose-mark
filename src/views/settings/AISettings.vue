<script setup lang="ts">
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import type { AIModelOption } from '@/lib/aiProvider'
import { fetchCustomAIModels, getDefaultBaseURL, getStoredAIModelOptions } from '@/lib/aiProvider'
import { getAvailableUToolsAiModels, isUToolsAiSupported } from '@/lib/utoolsAi'

type UToolsAiModel = {
  id: string
  label: string
  description?: string
  icon?: string
  cost?: string
}

const settingsStore = useSettingsStore()
const { isUTools } = useAppState()
const { showToast } = useUIManager()

const customBaseURL = ref(settingsStore.aiCustomBaseURL)
const customApiKey = ref(settingsStore.aiCustomApiKey)
const customSaveError = ref('')
const savingCustomConfig = ref(false)

const utoolsModels = ref<UToolsAiModel[]>([])
const loadingUToolsModels = ref(false)
const utoolsLoadError = ref('')
const utoolsFallbackNotice = ref('')
const isModelPopoverOpen = ref(false)

const usingCustomProvider = computed(() => settingsStore.aiUseCustomProvider)
const aiSupported = computed(() => isUTools.value && isUToolsAiSupported())
const customModels = computed(() => getStoredAIModelOptions(settingsStore.aiSettings))
const currentModels = computed(() => usingCustomProvider.value ? customModels.value : utoolsModels.value)
const currentModel = computed(() => currentModels.value.find((model: UToolsAiModel | AIModelOption) => model.id === settingsStore.aiSelectedModelId) ?? null)

const saveButtonReason = computed(() => {
  if (savingCustomConfig.value) return '正在保存并读取模型列表'
  if (!customApiKey.value.trim()) return '请先填写 API Key'
  return ''
})

const modelHint = computed(() => {
  if (!settingsStore.aiEnabled) return '先打开 AI 助手后再选择模型'
  if (usingCustomProvider.value) {
    if (savingCustomConfig.value) return '模型列表读取中，请稍候'
    if (customSaveError.value) return customSaveError.value
    if (!customModels.value.length) return '请先填写并保存自定义 AI 配置'
    return '选择后会用于书签的标题简介生成和分类推荐'
  }
  if (!isUTools.value) return '当前不在 uTools 环境，请切换到自定义 AI'
  if (!aiSupported.value) return '当前 uTools 版本未提供 AI 能力'
  if (loadingUToolsModels.value) return '正在读取 uTools AI 模型列表'
  if (utoolsLoadError.value) return utoolsLoadError.value
  if (utoolsFallbackNotice.value) return utoolsFallbackNotice.value
  if (!utoolsModels.value.length) return '当前未读取到可用模型，请先在 uTools 中配置 AI'
  return '选择后会用于书签的标题简介生成和分类推荐'
})

const canOpenModelSelector = computed(() => {
  if (!settingsStore.aiEnabled) return false
  if (usingCustomProvider.value) return customModels.value.length > 0 && !savingCustomConfig.value
  return aiSupported.value && utoolsModels.value.length > 0 && !loadingUToolsModels.value
})

const loadUToolsModels = async (force = false) => {
  if (!settingsStore.aiEnabled || usingCustomProvider.value || !isUTools.value || !aiSupported.value) {
    utoolsModels.value = []
    utoolsLoadError.value = !isUTools.value ? '' : aiSupported.value ? '' : '当前 uTools 版本未提供 AI 能力'
    return
  }
  if (!force && loadingUToolsModels.value) return

  loadingUToolsModels.value = true
  utoolsLoadError.value = ''
  utoolsFallbackNotice.value = ''

  try {
    const models = await getAvailableUToolsAiModels()
    utoolsModels.value = models

    if (!models.length) return

    const currentSelectedModelId = settingsStore.aiSelectedModelId?.trim()
    const hasSelectedModel = currentSelectedModelId && models.some(model => model.id === currentSelectedModelId)
    if (!hasSelectedModel) {
      settingsStore.setAiSelectedModelId(models[0].id)
      if (currentSelectedModelId) {
        utoolsFallbackNotice.value = `已保存模型 ${currentSelectedModelId} 不可用，已自动切换为 ${models[0].label}`
      }
    }
  } catch (error) {
    console.error('[AISettings] Load uTools models failed:', error)
    utoolsModels.value = []
    utoolsLoadError.value = error instanceof Error ? error.message : '模型列表读取失败，请稍后重试'
  } finally {
    loadingUToolsModels.value = false
  }
}

const handleSaveCustomConfig = async () => {
  if (saveButtonReason.value) {
    showToast({ title: saveButtonReason.value, variant: 'warning' })
    return
  }

  savingCustomConfig.value = true
  customSaveError.value = ''

  try {
    const modelOptions = await fetchCustomAIModels({
      baseURL: customBaseURL.value,
      apiKey: customApiKey.value
    })

    settingsStore.saveAiCustomConfig({
      baseURL: customBaseURL.value,
      apiKey: customApiKey.value,
      modelOptions
    })
    settingsStore.setAiSelectedModelId(modelOptions[0]?.id ?? settingsStore.aiSelectedModelId)
    showToast({ title: '自定义 AI 已保存', variant: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存自定义 AI 失败'
    customSaveError.value = message
    showToast({ title: message, variant: 'error' })
  } finally {
    savingCustomConfig.value = false
  }
}

const selectModel = (modelId: string) => {
  settingsStore.setAiSelectedModelId(modelId)
  isModelPopoverOpen.value = false
}

watch(() => settingsStore.aiCustomBaseURL, (value) => {
  customBaseURL.value = value
})

watch(() => settingsStore.aiCustomApiKey, (value) => {
  customApiKey.value = value
})

watch(
  () => [settingsStore.aiEnabled, settingsStore.aiUseCustomProvider, isUTools.value, aiSupported.value] as const,
  async () => {
    if (!settingsStore.aiEnabled) {
      isModelPopoverOpen.value = false
      return
    }
    if (!settingsStore.aiUseCustomProvider) {
      await loadUToolsModels()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">AI 助手</h3>
        <p class="settings-block__desc">控制书签 AI 入口与可用范围</p>
      </div>
      <div class="settings-row">
        <div class="space-y-0.5">
          <div class="text-sm font-medium">启用 AI 功能</div>
          <div class="text-xs text-muted-foreground">关闭后会隐藏书签里的 AI 生成与分类推荐入口</div>
        </div>
        <Switch
          :model-value="settingsStore.aiEnabled"
          aria-label="启用 AI 功能"
          @update:model-value="(checked: boolean) => settingsStore.setAiEnabled(checked)"
        />
      </div>
    </div>

    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">AI 来源</h3>
        <p class="settings-block__desc">默认使用 uTools AI，也可以切到自定义 OpenAI 兼容接口</p>
      </div>
      <div class="space-y-3">
        <div class="settings-row">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">使用自定义 OpenAI 兼容接口</div>
            <div class="text-xs text-muted-foreground">DeepSeek、Moonshot、智谱、本地 Ollama 等均走该协议</div>
          </div>
          <Switch
            :model-value="settingsStore.aiUseCustomProvider"
            aria-label="切换自定义 AI"
            @update:model-value="(checked: boolean) => settingsStore.setAiCustomProviderEnabled(checked)"
          />
        </div>

        <template v-if="usingCustomProvider">
          <div class="settings-field">
            <label class="settings-field__label">Base URL</label>
            <Input
              v-model="customBaseURL"
              :placeholder="getDefaultBaseURL()"
              class="h-9"
              autocomplete="off"
            />
          </div>

          <div class="settings-field">
            <label class="settings-field__label">API Key</label>
            <Input
              v-model="customApiKey"
              type="password"
              placeholder="输入后点击保存自动拉取模型"
              class="h-9"
              autocomplete="off"
            />
          </div>

          <div class="settings-row">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">保存配置</div>
              <div class="text-xs text-muted-foreground">
                {{ saveButtonReason || '保存后会读取可用模型列表' }}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              class="h-8 px-3"
              :disabled="!!saveButtonReason"
              @click="handleSaveCustomConfig"
            >
              {{ savingCustomConfig ? '保存中...' : '保存' }}
            </Button>
          </div>
        </template>

        <p v-else-if="!isUTools" class="text-xs text-muted-foreground">当前不在 uTools 环境，可切换到自定义 AI 使用。</p>
        <p v-else-if="!aiSupported" class="text-xs text-muted-foreground">当前 uTools 版本未提供 AI 能力，可切换到自定义 AI。</p>
      </div>
    </div>

    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">AI 模型</h3>
        <p class="settings-block__desc">选择书签 AI 默认使用的模型</p>
      </div>
      <div class="space-y-2">
        <div class="settings-row">
          <label class="text-sm font-medium">默认模型</label>
          <div class="flex items-center gap-2">
            <Button
              v-if="!usingCustomProvider && isUTools"
              variant="ghost"
              size="sm"
              class="h-8 px-2 text-xs text-muted-foreground"
              @click="loadUToolsModels(true)"
            >
              刷新
            </Button>
            <Button
              v-else-if="usingCustomProvider"
              variant="ghost"
              size="sm"
              class="h-8 px-2 text-xs text-muted-foreground"
              @click="handleSaveCustomConfig"
            >
              重新获取
            </Button>
            <Popover v-model:open="isModelPopoverOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  class="h-9 min-w-[220px] justify-between px-3 font-normal"
                  :disabled="!canOpenModelSelector"
                >
                  <span
                    class="truncate text-left"
                    :class="canOpenModelSelector ? 'text-foreground' : 'text-muted-foreground'"
                  >
                    {{ currentModel?.label || '请选择模型' }}
                  </span>
                  <span class="i-ph-caret-down-thin ml-2 shrink-0 opacity-50 text-sm" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[320px] p-1" align="end" side="bottom" :side-offset="8">
                <div class="max-h-72 overflow-y-auto space-y-1">
                  <button
                    v-for="model in currentModels"
                    :key="model.id"
                    type="button"
                    class="settings-list-item"
                    @click="selectModel(model.id)"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium text-foreground">{{ model.label }}</div>
                      <div class="mt-0.5 text-xs text-muted-foreground leading-5">
                        {{ model.description || model.id }}
                      </div>
                    </div>
                    <span
                      v-if="settingsStore.aiSelectedModelId === model.id"
                      class="i-ph-check-thin text-primary text-sm ml-2 shrink-0"
                    />
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">{{ modelHint }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-list-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  border-radius: 0.75rem;
  padding: 0.625rem 0.75rem;
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease;
}

.settings-list-item:hover {
  background: hsl(var(--muted) / 0.75);
}
</style>
