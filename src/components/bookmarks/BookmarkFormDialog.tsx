import { cn } from '@/lib/utils'
import { useBookmarkForm } from '@/hooks/useBookmarkForm'
import { BookmarkIcon } from '@/components/BookmarkIcon'
import { IconSelector } from '@/components/IconSelector'
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { BookmarkTooltip } from './_BookmarkTooltip'
import {
  ArrowLeft,
  FileText,
  Loader2,
  Sparkles,
  Pencil,
  RotateCcw,
  Wand2,
  Lightbulb,
  Check,
  X,
  Trash2
} from 'lucide-react'

/**
 * BookmarkFormDialog（React 版）
 * --------------------------------------------------------------------------
 * 新建/编辑书签全屏表单页：URL + 内联 AI 取标题/描述、图标预览 + 内联 IconSelector、
 * 标题（AI 撤销）、描述（AI 撤销）、分类（AI 推荐 + CategoryMultiSelect）、底部保存/取消/
 * AI 后台保存/删除。等价旧版 Vue BookmarkFormDialog.vue。
 * 状态来自第 2 阶段 useBookmarkForm（暴露 set/patchDraft 替代 v-model）。
 * i-ph 图标 → lucide-react；Input/Textarea/Button/BookmarkIcon/IconSelector/CategoryMultiSelect 复用。
 *
 * 注：旧版模板用到的 isUrlAccessible / isCheckingUrl / aiBackgroundTooltip 在 React hook
 * 中未导出（以本地 hook 契约为准），此处用静态文案兜底，不改变交互逻辑。无埋点。
 */
export interface BookmarkFormDialogProps {
  onClose: () => void
}

const AI_BACKGROUND_TOOLTIP = '先保存书签，再在后台用 AI 补全标题与描述，无需等待。'

export function BookmarkFormDialog({ onClose }: BookmarkFormDialogProps) {
  const {
    modalTitle,
    draft,
    draftLocations,
    previewIcon,
    showIconSelector,
    formError,
    isSaving,
    iconLoading,
    iconFetchFailed,
    saveButtonLabel,
    aiEnabled,
    canUseAi,
    aiUnavailableReason,
    hasAIGenerated,
    isGenerating,
    isSuggestingCategory,
    categorySuggestion,
    editingId,
    set,
    patchDraft,
    handleSave,
    askAI,
    undoTitle,
    undoDesc,
    onTitleInput,
    onDescInput,
    askCategorySuggestion,
    applyCategorySuggestion,
    dismissCategorySuggestion,
    requestDelete
  } = useBookmarkForm()

  const onSave = async () => {
    await handleSave()
  }
  const onAiBackgroundSave = async () => {
    await handleSave({ forceAi: true, background: true })
  }

  return (
    <div className="bookmark-form-page flex flex-col h-full bg-background relative z-10">
      {/* Header */}
      <header className="shrink-0 z-30 flex items-center gap-4 px-6 pt-5 pb-3">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl bg-background/80"
          onClick={onClose}
        >
          <ArrowLeft className="size-[18px]" />
        </Button>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
            <FileText className="size-[18px]" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{modalTitle}</h1>
        </div>
      </header>

      {/* Form Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll px-6">
        <div className="bookmark-form__canvas mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-28 pt-4">
          {/* 1. URL Input with Inline AI Button */}
          <section className="bookmark-form__section bookmark-form__url-section">
            <label className="bookmark-form__label">链接 / 模板</label>
            <div className="relative group">
              <Input
                value={draft.url}
                onChange={(e) => patchDraft({ url: e.target.value })}
                placeholder="https://example.com 或 {query} 模板"
                className="bookmark-form__control bookmark-form__url-input h-14 font-mono text-base placeholder:text-muted-foreground/50 pr-14"
                autoFocus
              />
              {aiEnabled && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <BookmarkTooltip
                    side="left"
                    content={
                      <p>
                        {!draft.url
                          ? '请输入网址以使用 AI'
                          : !canUseAi
                            ? aiUnavailableReason
                            : 'AI 只预填标题和描述，不会直接保存'}
                      </p>
                    }
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bookmark-form__ai-trigger h-10 w-10 rounded-xl text-primary transition-all"
                      disabled={!draft.url || isGenerating}
                      onClick={() => askAI()}
                    >
                      {isGenerating ? (
                        <Loader2 className="size-[18px] animate-spin" />
                      ) : (
                        <Sparkles className="size-[18px]" />
                      )}
                    </Button>
                  </BookmarkTooltip>
                </div>
              )}
            </div>
            {formError && <p className="mt-2 text-[11px] text-destructive">{formError}</p>}
          </section>

          {/* 2. Icon + Title */}
          <section className="bookmark-form__section">
            <div className="flex items-center gap-4">
              {/* Left: Icon Preview */}
              <div className="shrink-0 flex flex-col items-center gap-2">
                <div
                  className="relative group cursor-pointer"
                  onClick={() => set({ showIconSelector: !showIconSelector })}
                >
                  <BookmarkIcon
                    icon={previewIcon}
                    fallbackText={draft.title || draft.url}
                    loading={iconLoading}
                    size="custom"
                    customSizeClass="w-20 h-20 rounded-2xl"
                    className="bookmark-form__icon-preview transition-all"
                  />
                  <div className="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity">
                    <Pencil className="text-white size-5" />
                  </div>
                </div>
                <span
                  className={cn(
                    'text-xs text-center leading-tight min-h-5 flex items-center',
                    iconLoading
                      ? 'text-amber-500 font-medium animate-pulse'
                      : iconFetchFailed
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground font-medium'
                  )}
                >
                  {iconLoading ? '正在识别站点信息...' : iconFetchFailed ? '识别失败' : '修改图标'}
                </span>
              </div>

              {/* Right: Title */}
              <div className="flex-1 min-w-0">
                <div className="relative flex items-center gap-2">
                  <Input
                    value={draft.title}
                    onChange={(e) => {
                      patchDraft({ title: e.target.value })
                      onTitleInput()
                    }}
                    placeholder="网站标题"
                    className="bookmark-form__control h-12 px-4 text-base font-semibold flex-1"
                  />
                  {aiEnabled && hasAIGenerated && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                      onClick={() => undoTitle()}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Inline Icon Editor */}
            {showIconSelector && (
              <div className="mt-5 pt-5 border-t border-border/30">
                <IconSelector
                  inline
                  value={previewIcon ?? undefined}
                  title={draft.title}
                  onChange={(val) => set({ previewIcon: val })}
                  onClose={() => set({ showIconSelector: false })}
                  onConfirm={() => set({ showIconSelector: false })}
                />
              </div>
            )}
          </section>

          {/* 3. Description */}
          <section className="bookmark-form__section">
            <div className="flex items-center justify-between mb-3">
              <label className="bookmark-form__label !mb-0">描述</label>
              {aiEnabled && hasAIGenerated && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => undoDesc()}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
            </div>
            <Textarea
              value={draft.desc}
              onChange={(e) => onDescInput(e.target.value)}
              placeholder="请输入网站简介..."
              className="min-h-[120px] resize-y"
            />
          </section>

          {/* 4. Category */}
          <section className="bookmark-form__section">
            <div className="flex items-center justify-between">
              <label className="bookmark-form__label">分类</label>
              {aiEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="bookmark-form__suggest-trigger h-8 text-xs gap-1 px-3 rounded-xl text-primary hover:text-primary"
                  disabled={!draft.url || isSuggestingCategory}
                  onClick={() => askCategorySuggestion()}
                >
                  {isSuggestingCategory ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5" />
                  )}
                  AI 推荐
                </Button>
              )}
            </div>

            {aiEnabled && categorySuggestion && (
              <div className="bookmark-form__suggestion flex items-center gap-2 px-3 py-1.5 rounded-lg">
                <Lightbulb className="text-primary size-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">
                    {categorySuggestion.groupName} / {categorySuggestion.subGroupName}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => applyCategorySuggestion()}>
                    <Check className="text-green-500 size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismissCategorySuggestion()}>
                    <X className="text-muted-foreground size-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <CategoryMultiSelect
              inline
              value={draftLocations}
              onChange={(val) => set({ draftLocations: val })}
            />
          </section>

          {/* Footer Buttons */}
          <div className="bookmark-form__footer sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl bg-background/90 px-4 py-3 backdrop-blur-sm">
            <div className="flex-1">
              {editingId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="bookmark-form__delete-trigger text-destructive hover:text-destructive px-3 h-9 rounded-xl"
                  onClick={() => requestDelete()}
                >
                  <Trash2 className="size-4 mr-1" />
                  删除
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-24 rounded-xl text-muted-foreground"
                onClick={onClose}
              >
                取消
              </Button>
              {aiEnabled && !editingId && canUseAi && (
                <BookmarkTooltip side="top" content={<p className="max-w-[260px] text-xs leading-5">{AI_BACKGROUND_TOOLTIP}</p>}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-4 rounded-xl bg-background/80"
                    disabled={isSaving || !draft.url}
                    onClick={onAiBackgroundSave}
                  >
                    {isSaving ? (
                      <Loader2 className="size-3.5 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="size-3.5 mr-1" />
                    )}
                    AI 后台保存
                  </Button>
                </BookmarkTooltip>
              )}
              <Button size="sm" className="h-10 w-28 rounded-xl" disabled={isSaving} onClick={onSave}>
                {isSaving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                {saveButtonLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookmarkFormDialog
