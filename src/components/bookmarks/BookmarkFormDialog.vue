<script setup lang="ts">
import BookmarkIcon from '@/components/BookmarkIcon.vue'

const {
  showAdd,
  modalTitle,
  draft,
  draftLocations,
  previewIcon,
  showCategorySelector,
  showIconSelector,
  formError,
  isSaving,
  iconLoading,
  iconFetchFailed,
  maxDescLen,
  selectedLocationsLabel,
  handleSave,
  askAI,
  aiEnabled,
  canUseAi,
  aiUnavailableReason,
  saveButtonLabel,
  aiBackgroundTooltip,
  undoTitle,
  undoDesc,
  hasAIGenerated,
  isUrlAccessible,
  isCheckingUrl,
  isGenerating,
  isSuggestingCategory,
  categorySuggestion,
  onTitleInput,
  onDescInput,
  askCategorySuggestion,
  applyCategorySuggestion,
  dismissCategorySuggestion,
  requestDelete,
  editingId
} = useBookmarkForm()

const emit = defineEmits<{
  close: []
}>()

const onSave = async () => {
  await handleSave()
}

const onAiBackgroundSave = async () => {
  await handleSave({ forceAi: true, background: true })
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <div class="bookmark-form-page flex flex-col h-full bg-background relative z-10">
    <!-- Header -->
    <header class="shrink-0 z-30 flex items-center gap-4 px-6 pt-5 pb-3">
      <Button variant="outline" size="icon" class="h-10 w-10 shrink-0 rounded-xl bg-background/80" @click="handleClose">
        <span class="i-ph-arrow-left-thin text-lg" />
      </Button>
      <div class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          <span class="i-ph-article-thin text-lg" />
        </span>
        <h1 class="text-xl font-semibold tracking-tight text-foreground">{{ modalTitle }}</h1>
      </div>
    </header>

    <!-- Form Content -->
    <div class="flex-1 min-h-0 overflow-y-auto custom-scroll">
      <div class="bookmark-form__canvas flex w-full flex-col gap-5 px-6 pb-28 pt-4">
        <!-- 1. URL Input with Inline AI Button -->
        <section class="bookmark-form__section bookmark-form__url-section">
          <label class="bookmark-form__label">链接 / 模板</label>
          <div class="relative group">
            <Input
              v-model="draft.url"
              placeholder="https://example.com 或 {query} 模板"
              class="bookmark-form__control bookmark-form__url-input h-14 font-mono text-base placeholder:text-muted-foreground/50 pr-14"
              auto-focus
            />
            <div class="absolute right-2 top-1/2 -translate-y-1/2">
              <Tooltip v-if="aiEnabled">
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="bookmark-form__ai-trigger h-10 w-10 rounded-xl text-primary transition-all"
                    :disabled="!draft.url || isGenerating"
                    @click="askAI()"
                  >
                    <span v-if="isGenerating" class="i-ph-spinner-thin animate-spin text-lg" />
                    <span v-else class="i-ph-star-thin text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p v-if="!draft.url">请输入网址以使用 AI</p>
                  <p v-else-if="!canUseAi">{{ aiUnavailableReason }}</p>
                  <p v-else-if="!isUrlAccessible">网址可能无法访问，仍可尝试 AI</p>
                  <p v-else>AI 只预填标题和描述，不会直接保存</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <p v-if="formError" class="mt-2 text-[11px] text-destructive">{{ formError }}</p>
        </section>

        <!-- 2. Icon + Title -->
        <section class="bookmark-form__section">
          <div class="flex items-center gap-4">
            <!-- Left: Icon Preview -->
            <div class="shrink-0 flex flex-col items-center gap-2">
              <div class="relative group cursor-pointer" @click="showIconSelector = !showIconSelector">
                <BookmarkIcon
                  :icon="previewIcon"
                  :fallback-text="draft.title || draft.url"
                  :loading="iconLoading"
                  size="custom"
                  custom-size-class="w-20 h-20 rounded-2xl"
                  class="bookmark-form__icon-preview transition-all"
                />
                <div class="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity">
                  <span class="i-ph-pencil-simple-thin text-white text-xl" />
                </div>
              </div>
              <span class="text-xs text-center leading-tight min-h-5 flex items-center" :class="iconLoading ? 'text-amber-500 font-medium animate-pulse' : iconFetchFailed ? 'text-muted-foreground' : 'text-muted-foreground font-medium'">
                {{ iconLoading ? '正在识别站点信息...' : iconFetchFailed ? '识别失败' : '修改图标' }}
              </span>
            </div>

            <!-- Right: Title -->
            <div class="flex-1 min-w-0">
              <div class="relative flex items-center gap-2">
                <Input
                  v-model="draft.title"
                  placeholder="网站标题"
                  class="bookmark-form__control h-12 px-4 text-base font-semibold flex-1"
                  @input="onTitleInput"
                />
                <Button
                  v-if="aiEnabled && hasAIGenerated"
                  variant="ghost"
                  size="icon"
                  class="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                  @click="undoTitle()"
                >
                  <span class="i-ph-arrow-counter-clockwise-thin text-sm" />
                </Button>
              </div>
            </div>
          </div>

          <!-- Inline Icon Editor (展开式，非弹窗) -->
          <Transition name="fade">
            <div v-if="showIconSelector" class="mt-5 pt-5 border-t border-border/30">
              <IconSelector
                inline
                :modelValue="previewIcon ?? undefined"
                :title="draft.title"
                @update:modelValue="(val) => previewIcon = val"
                @close="showIconSelector = false"
                @confirm="showIconSelector = false"
              />
            </div>
          </Transition>
        </section>

        <!-- 3. Description (独立全宽区块) -->
        <section class="bookmark-form__section">
          <div class="flex items-center justify-between mb-3">
            <label class="bookmark-form__label !mb-0">描述</label>
            <Button
              v-if="aiEnabled && hasAIGenerated"
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              @click="undoDesc()"
            >
              <span class="i-ph-arrow-counter-clockwise-thin text-sm" />
            </Button>
          </div>
          <Textarea
            :model-value="draft.desc"
            placeholder="请输入网站简介..."
            class="min-h-[120px] resize-y"
            @update:model-value="(value: string | number) => onDescInput(String(value))"
          />
        </section>

        <!-- 4. Category (独立全宽区块) -->
        <section class="bookmark-form__section">
          <div class="flex items-center justify-between">
            <label class="bookmark-form__label">分类</label>
            <Button
              v-if="aiEnabled"
              variant="ghost"
              size="sm"
              class="bookmark-form__suggest-trigger h-8 text-xs gap-1 px-3 rounded-xl text-primary hover:text-primary"
              :disabled="!draft.url || isSuggestingCategory"
              @click="askCategorySuggestion"
            >
              <span v-if="isSuggestingCategory" class="i-ph-spinner-thin animate-spin" />
              <span v-else class="i-ph-magic-wand-thin" />
              AI 推荐
            </Button>
          </div>

          <Transition name="fade">
            <div v-if="aiEnabled && categorySuggestion" class="bookmark-form__suggestion flex items-center gap-2 px-3 py-1.5 rounded-lg">
              <span class="i-ph-lightbulb-thin text-primary text-base shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-medium text-foreground truncate">
                  {{ categorySuggestion.groupName }} / {{ categorySuggestion.subGroupName }}
                </p>
              </div>
              <div class="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="applyCategorySuggestion">
                  <span class="i-ph-check-thin text-green-500 text-sm" />
                </Button>
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="dismissCategorySuggestion">
                  <span class="i-ph-x-thin text-muted-foreground text-sm" />
                </Button>
              </div>
            </div>
          </Transition>

          <!-- 平铺展示分类选择 -->
          <CategoryMultiSelect
            v-model="draftLocations"
            inline
          />
        </section>

        <!-- Footer Buttons (sticky at bottom) -->
        <div class="bookmark-form__footer sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl bg-background/90 px-4 py-3 backdrop-blur-sm">
          <div class="flex-1">
            <Button
              v-if="editingId"
              variant="ghost"
              size="sm"
              class="bookmark-form__delete-trigger text-destructive hover:text-destructive px-3 h-9 rounded-xl"
              @click="requestDelete"
            >
              <span class="i-ph-trash-thin mr-1 text-base" />
              删除
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" class="h-10 w-24 rounded-xl text-muted-foreground" @click="handleClose">取消</Button>
            <Tooltip v-if="aiEnabled && !editingId && canUseAi">
              <TooltipTrigger as-child>
                <Button variant="outline" size="sm" class="h-10 px-4 rounded-xl bg-background/80" :disabled="isSaving || !draft.url" @click="onAiBackgroundSave">
                  <span v-if="isSaving" class="i-ph-spinner-thin animate-spin mr-1" />
                  <span v-else class="i-ph-star-thin mr-1" />
                  AI 后台保存
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" class="max-w-[260px] text-xs leading-5">
                <p>{{ aiBackgroundTooltip }}</p>
              </TooltipContent>
            </Tooltip>
            <Button size="sm" class="h-10 w-28 rounded-xl" :disabled="isSaving" @click="onSave">
              <span v-if="isSaving" class="i-ph-spinner-thin animate-spin mr-1" />
              {{ saveButtonLabel }}
            </Button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.bookmark-form-page {
  --form-surface: hsl(var(--card) / 0.72);
  --form-control-border: hsl(var(--border) / 0.72);
}

.bookmark-form__canvas {
  max-width: none;
}

.bookmark-form__section {
  width: 100%;
  border-radius: 28px;
  background: var(--form-surface);
  padding: 1.5rem;
}

.bookmark-form__url-section {
  padding: 1.25rem 1.5rem;
}

.bookmark-form__label {
  display: inline-flex;
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: hsl(var(--muted-foreground));
}

.bookmark-form__control {
  border: 1px solid var(--form-control-border) !important;
  border-radius: 1rem !important;
  background: hsl(var(--background) / 0.72) !important;
  box-shadow: none !important;
  transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease;
}

.bookmark-form__control:hover {
  border-color: hsl(var(--muted-foreground) / 0.34) !important;
}

.bookmark-form__control:focus,
.bookmark-form__control:focus-visible {
  border-color: hsl(var(--primary) / 0.72) !important;
  box-shadow: 0 0 0 3px hsl(var(--primary) / 0.12) !important;
}

.bookmark-form__url-input {
  letter-spacing: -0.01em;
}

.bookmark-form__icon-preview {
  box-shadow: 0 14px 34px hsl(var(--foreground) / 0.06);
}

.bookmark-form__footer {
  box-shadow: 0 18px 48px hsl(var(--foreground) / 0.08);
}

.bookmark-form__ai-trigger:hover,
.bookmark-form__suggest-trigger:hover {
  background-color: hsl(var(--primary) / 0.1);
}

.bookmark-form__suggest-trigger:active {
  background-color: hsl(var(--primary) / 0.15);
}

.bookmark-form__suggestion {
  background-color: hsl(var(--primary) / 0.05);
}

.bookmark-form__delete-trigger:hover {
  background-color: hsl(var(--destructive) / 0.1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.custom-scroll::-webkit-scrollbar {
  width: 4px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: var(--radius-sm);
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>
