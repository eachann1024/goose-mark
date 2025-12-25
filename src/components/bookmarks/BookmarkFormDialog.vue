<script setup lang="ts">
import BookmarkIcon from '@/components/BookmarkIcon.vue'
import DeleteConfirmDialog from '@/components/bookmarks/DeleteConfirmDialog.vue'

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
  isSuggestingCategory,
  categorySuggestion,
  onTitleInput,
  onDescInput,
  askCategorySuggestion,
  applyCategorySuggestion,
  dismissCategorySuggestion,
  requestDelete,
  confirmDelete,
  showDeleteConfirmLocal,
  editingId
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
      class="sm:max-w-[500px] max-h-[95vh] overflow-y-auto p-0 gap-0 bg-card border-border shadow-2xl"
    >
      <!-- Header -->
      <div class="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/20">
        <DialogTitle class="text-base font-semibold flex items-center gap-2">
          <span class="i-mdi-card-text-outline text-primary text-lg" />
          {{ modalTitle }}
        </DialogTitle>
      </div>

      <div class="p-5 space-y-5">
        <!-- 1. URL Input with Inline AI Button -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground ml-1">链接 / 模板</label>
          <div class="relative group">
            <Input 
              v-model="draft.url" 
              placeholder="https://example.com 或 {query} 模板" 
              class="h-10 bg-muted/30 font-mono text-sm placeholder:text-muted-foreground/60 pr-10 focus:bg-background transition-colors shadow-none"
              auto-focus
            />
            <div class="absolute right-1 top-1">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 text-primary hover:bg-primary/10 transition-all"
                    :disabled="!draft.url || !isUrlAccessible || isGenerating || !isUTools"
                    @click="askAI()"
                  >
                    <span v-if="isGenerating" class="i-mdi-loading animate-spin text-lg" />
                    <span v-else class="i-mdi-sparkles text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p v-if="!isUTools">AI 功能仅在 uTools 环境可用</p>
                  <p v-else-if="!draft.url">请输入网址以使用 AI</p>
                  <p v-else-if="!isUrlAccessible">网址无法访问</p>
                  <p v-else>AI 优化标题和描述</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <p v-if="formError" class="text-[11px] text-destructive ml-1">{{ formError }}</p>
        </div>

        <!-- 2. Split Layout: Icon + Info -->
        <div class="flex gap-4 items-start">
          <!-- Left: Icon Preview -->
          <div class="shrink-0 flex flex-col items-center gap-2">
            <div 
              class="relative group cursor-pointer"
              @click="showIconSelector = true"
            >
              <BookmarkIcon 
                :icon="previewIcon"
                :fallback-text="draft.title || draft.url"
                :loading="iconLoading"
                size="custom"
                custom-size-class="w-20 h-20 rounded-xl"
                class="shadow-sm border-2 border-transparent group-hover:border-primary/40 transition-all"
              />
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center transition-opacity">
                <span class="i-mdi-pencil text-white text-xl" />
              </div>
            </div>
            <span class="text-[10px] text-muted-foreground font-medium">点击修改图标</span>
          </div>

          <!-- Right: Title & Desc -->
          <div class="flex-1 space-y-3 min-w-0">
            <div class="relative flex items-center gap-2">
              <Input 
                v-model="draft.title" 
                placeholder="网站标题" 
                class="h-9 border-border bg-background px-3 focus-visible:ring-1 focus-visible:ring-primary/40 shadow-none text-sm font-semibold flex-1"
                @input="onTitleInput"
              />
              <Button
                v-if="hasAIGenerated"
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                @click="undoTitle()"
              >
                <span class="i-mdi-undo text-sm" />
              </Button>
            </div>
            
            <div class="relative">
              <Textarea 
                v-model="draft.desc" 
                placeholder="请输入网站简介" 
                :maxlength="maxDescLen"
                class="h-20 min-h-[80px] text-xs resize-none bg-background border border-border px-3 py-2 focus-visible:ring-1 focus-visible:ring-primary/40 shadow-none pr-8"
                @input="onDescInput"
              />
              <Button
                v-if="hasAIGenerated"
                variant="ghost"
                size="icon"
                class="absolute top-1.5 right-1.5 h-6 w-6 text-muted-foreground hover:text-foreground"
                @click="undoDesc()"
              >
                <span class="i-mdi-undo text-xs" />
              </Button>
            </div>
          </div>
        </div>

        <!-- 3. Category & AI Suggestion -->
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <label class="text-xs font-medium text-muted-foreground">分类</label>
            <Button
              v-if="isUTools"
              variant="ghost"
              size="sm"
              class="h-6 text-[11px] gap-1 px-2 hover:bg-primary/5 text-primary/80"
              :disabled="!draft.url || isSuggestingCategory"
              @click="askCategorySuggestion"
            >
              <span v-if="isSuggestingCategory" class="i-mdi-loading animate-spin" />
              <span v-else class="i-mdi-auto-fix" />
              AI 推荐
            </Button>
          </div>
          
          <Transition name="fade">
            <div v-if="categorySuggestion" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10 mb-2">
              <span class="i-mdi-lightbulb-on-outline text-primary text-base shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-medium text-foreground truncate">
                  {{ categorySuggestion.groupName }} / {{ categorySuggestion.subGroupName }}
                </p>
              </div>
              <div class="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="applyCategorySuggestion">
                  <span class="i-mdi-check text-green-500 text-sm" />
                </Button>
                <Button variant="ghost" size="icon" class="h-6 w-6" @click="dismissCategorySuggestion">
                  <span class="i-mdi-close text-muted-foreground text-sm" />
                </Button>
              </div>
            </div>
          </Transition>
          
          <Popover v-model:open="showCategorySelector">
            <PopoverTrigger as-child>
              <div 
                class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div v-if="selectedLocationsLabel" class="flex items-center gap-2 truncate text-primary font-medium text-xs">
                  {{ selectedLocationsLabel }}
                </div>
                <span v-else class="text-muted-foreground text-xs">选择分类...</span>
                <span class="i-mdi-chevron-down opacity-50 shrink-0 text-sm" />
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

        <!-- 4. Footer Context (Templates) -->
        <Transition name="fade">
          <div v-if="isDraftTemplate && isUTools" class="p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-muted-foreground">
                <span class="i-mdi-rocket-launch text-primary text-sm" />
                <span>模板书签已激活</span>
              </div>
              <div class="flex items-center gap-2">
                <label for="allowUniversal" class="cursor-pointer font-medium">万能匹配</label>
                <Switch 
                  id="allowUniversal" 
                  :checked="draft.allowUniversal"
                  @update:checked="(v: boolean) => draft.allowUniversal = v"
                  class="scale-75 origin-right"
                />
              </div>
            </div>
            <p class="text-muted-foreground leading-relaxed">
              输入「<span class="text-foreground font-semibold">{{ draft.title || '书签名' }}</span>」按 Tab 键输入「{{ draftTemplateLabel }}」即可搜索。
            </p>
          </div>
        </Transition>
      </div>

      <!-- Footer Buttons -->
      <DialogFooter class="px-5 py-3 bg-muted/20 border-t border-border flex flex-row items-center justify-between sm:justify-between gap-2">
        <div class="flex-1">
          <Button 
            v-if="editingId"
            variant="ghost" 
            size="sm"
            class="text-destructive hover:text-destructive hover:bg-destructive/10 px-2 h-8"
            @click="requestDelete"
          >
            <span class="i-mdi-trash-can-outline mr-1 text-base" />
            删除
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="h-8 w-20" @click="emit('update:open', false)">取消</Button>
          <Button size="sm" class="h-8 w-20" :disabled="isSaving" @click="onSave">
            <span v-if="isSaving" class="i-mdi-loading animate-spin mr-1" />
            保存
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Delete Confirm -->
  <DeleteConfirmDialog 
    v-model:open="showDeleteConfirmLocal"
    :is-trash-active="false"
    @confirm="confirmDelete"
  />

  <!-- Icon Selector -->
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
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
