<script setup lang="ts">
import BookmarkIcon from '@/components/BookmarkIcon.vue'

// 直接使用 App.vue 中传递的 useBookmarkForm
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
  previewIconStyle,
  previewText,
  previewIconUrl,
  selectedLocationsLabel,
  isDraftTemplate,
  draftTemplateLabel,
  handleSave,
  askAI,
  undoTitle,
  undoDesc,
  hasAIGenerated,
  isUrlAccessible,
  isCheckingUrl,
  isGenerating,
  onTitleInput,
  onDescInput
} = useBookmarkForm()

const props = defineProps<{
  open: boolean
  isUTools: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// 同步外部 open 状态到 showAdd
watch(() => props.open, (v) => { showAdd.value = v })
watch(showAdd, (v) => { if (v !== props.open) emit('update:open', v) })

const onSave = async () => {
  await handleSave()
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent 
      class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 bg-card border-border"
    >
      <div class="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
        <DialogTitle class="text-lg font-medium flex items-center gap-2">
          <span class="i-mdi-card-text-outline text-primary text-xl" />
          {{ modalTitle }}
        </DialogTitle>
      </div>

      <div class="p-6 space-y-6">
        <!-- URL Input -->
        <div class="space-y-3">
          <div class="flex gap-2 items-center">
            <Input 
              v-model="draft.url" 
              placeholder="https://example.com 或含 {query} 的搜索模板" 
              class="h-12 bg-muted/30 font-mono text-base placeholder:text-muted-foreground/60 flex-1 px-4"
              auto-focus
            />
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-12 w-12 shrink-0 transition-all text-2xl"
                  :class="{ 
                    'opacity-50 cursor-not-allowed': !draft.url || !isUrlAccessible || isGenerating || !isUTools,
                    'text-primary border-primary bg-primary/5': draft.url && isUrlAccessible && !isGenerating && isUTools
                  }"
                  :disabled="!draft.url || !isUrlAccessible || isGenerating || !isUTools"
                  @click="(!draft.url || !isUrlAccessible || isGenerating || !isUTools) ? null : askAI()"
                >
                  <span v-if="isGenerating" class="i-mdi-loading animate-spin text-xl" />
                  <span v-else class="i-mdi-sparkles text-xl" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p v-if="!isUTools">AI 功能仅在 uTools 环境中可用</p>
                <p v-else-if="!draft.url">请输入网址以使用 AI</p>
                <p v-else-if="isCheckingUrl">正在检测网址连通性...</p>
                <p v-else-if="!isUrlAccessible">网址无法访问，AI 无法读取</p>
                <p v-else>点击使用 AI 优化标题和描述</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <!-- 模板书签提示 (uTools only) -->
        <Transition name="fade">
          <div v-if="isDraftTemplate && isUTools" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <span class="i-mdi-lightbulb-on-outline text-primary text-lg shrink-0 mt-0.5" />
            <div class="text-sm text-muted-foreground">
              <p class="font-medium text-foreground decoration-dashed decoration-primary underline underline-offset-2">🚀 快捷搜索书签</p>
              <p class="mt-1">
                保存后，在 uTools 主搜索输入「<span class="text-primary font-medium">{{ draft.title || '书签名' }}</span>」
                按 <kbd class="px-1.5 py-0.5 mx-0.5 rounded bg-muted border border-border text-xs font-mono">Tab</kbd> 
                输入「{{ draftTemplateLabel }}」即可快速打开
              </p>
            </div>
          </div>
        </Transition>

        <!-- Universal Search Option (uTools only) -->
        <div v-if="isDraftTemplate && isUTools">
          <Tooltip>
            <TooltipTrigger as-child>
              <div class="flex items-center gap-2 w-max">
                <Checkbox 
                  id="allowUniversal" 
                  :checked="draft.allowUniversal"
                  @update:checked="(v: boolean) => draft.allowUniversal = v"
                />
                <label for="allowUniversal" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 select-none cursor-pointer">
                  开启万能匹配（匹配主输入框任意文本）
                </label>
              </div>
            </TooltipTrigger>
            <TooltipContent class="max-w-xs">
              <p>勾选后，主输入框输入"任意内容"均可匹配此书签（通常用于聚合搜索）</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <!-- 错误提示 -->
        <p v-if="formError" class="text-sm text-red-500">{{ formError }}</p>

        <!-- Info Card -->
        <div class="flex gap-4 p-4 rounded-xl border border-border bg-muted/10">
          <!-- Icon -->
          <div class="shrink-0 flex flex-col items-center gap-1">
            <BookmarkIcon 
              :icon="previewIcon"
              :fallback-text="draft.title || draft.url"
              :loading="iconLoading"
              size="lg"
              class="cursor-pointer hover:ring-2 hover:ring-primary/50"
              @click="showIconSelector = true"
            />
            <p v-if="iconFetchFailed && !iconLoading && draft.url" class="text-[10px] text-muted-foreground text-center max-w-[80px] leading-tight">
              可复制网页图标后粘贴
            </p>
          </div>
          
          <div class="flex-1 space-y-3">
            <div class="relative flex items-center gap-2">
              <Input 
                v-model="draft.title" 
                placeholder="网站标题" 
                class="h-12 border-border rounded-md bg-background px-4 py-3 focus-visible:ring-2 focus-visible:ring-primary/30 shadow-none text-base font-semibold placeholder:text-muted-foreground/60 flex-1"
                @input="onTitleInput"
              />
              <Tooltip v-if="hasAIGenerated">
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    @click="undoTitle()"
                  >
                    <span class="i-mdi-undo text-base" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>撤回标题</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div class="relative">
              <Textarea 
                v-model="draft.desc" 
                placeholder="请输入网站简介" 
                :maxlength="maxDescLen"
                class="min-h-[80px] resize-none bg-background border border-border rounded-md px-4 py-3 focus-visible:ring-2 focus-visible:ring-primary/30 placeholder:text-muted-foreground/60 text-sm pr-10"
                @input="onDescInput"
              />
              <Tooltip v-if="hasAIGenerated">
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="absolute top-2 right-2 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    @click="undoDesc()"
                  >
                    <span class="i-mdi-undo text-sm" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>撤回描述</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <!-- Category Multi-Select -->
        <div class="space-y-3">
          <label class="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <span class="text-destructive">*</span> 所在分类
          </label>
          
          <Popover v-model:open="showCategorySelector">
            <PopoverTrigger as-child>
              <div 
                class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-muted/50"
              >
                <div v-if="selectedLocationsLabel" class="flex items-center gap-2 truncate text-primary font-medium">
                  {{ selectedLocationsLabel }}
                </div>
                <span v-else class="text-muted-foreground">选择分类...</span>
                <span class="i-mdi-chevron-down opacity-50 shrink-0" />
              </div>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0 bg-transparent border-0 shadow-none z-[9999]" align="start">
              <CategoryMultiSelect 
                v-model="draftLocations"
                @close="showCategorySelector = false"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <DialogFooter class="px-6 py-4 bg-muted/20 border-t border-border sm:justify-center">
        <Button variant="outline" class="w-32" @click="emit('update:open', false)">取消</Button>
        <Button class="w-32" :disabled="isSaving" @click="onSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="showIconSelector">
    <DialogContent class="w-auto p-0 bg-transparent border-0 shadow-none">
      <IconSelector 
        :modelValue="previewIcon ?? undefined"
        :title="draft.title"
        @update:modelValue="(val) => previewIcon = val"
        @close="showIconSelector = false"
        @confirm="showIconSelector = false"
      />
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
