import { useBookmarkFormStore } from './bookmark-form/state';
import { useShallow } from 'zustand/react/shallow';
import { useUIManager } from './useUIManager';
import { useFormView } from './bookmark-form/useFormView';
import { useFormSaveInputs, useFormSave } from './bookmark-form/useFormSave';
import { useFormEntry } from './bookmark-form/useFormEntry';
import { useFormMetadata } from './bookmark-form/useFormMetadata';
import { useFormText } from './bookmark-form/useFormText';
import { useFormCategory } from './bookmark-form/useFormCategory';
import { useFormUrlFetch } from './bookmark-form/useFormUrlFetch';
import { useFormEffects } from './bookmark-form/useFormEffects';
import { checkAiAvailable } from './bookmark-form/metadata';

/** 新建/编辑表单编排。状态、请求代际与各职责控制器均保持单一归属。 */
export function useBookmarkForm() {
  const form = useBookmarkFormStore(useShallow(s => ({
    showAdd: s.showAdd,
    modalTitle: s.modalTitle,
    editingId: s.editingId,
    draft: s.draft,
    draftLocations: s.draftLocations,
    previewIcon: s.previewIcon,
    showCategorySelector: s.showCategorySelector,
    showIconSelector: s.showIconSelector,
    formError: s.formError,
    isSaving: s.isSaving,
    iconLoading: s.iconLoading,
    iconFetchFailed: s.iconFetchFailed,
    iconFetchPhase: s.iconFetchPhase,
    isGenerating: s.isGenerating,
    isSuggestingCategory: s.isSuggestingCategory,
    aiError: s.aiError,
    categorySuggestion: s.categorySuggestion,
    originalBeforeAI: s.originalBeforeAI,
    originalUrl: s.originalUrl,
    lastFetchedUrl: s.lastFetchedUrl,
    isTitleDirty: s.isTitleDirty,
    isDescDirty: s.isDescDirty,
    titleSuggestion: s.titleSuggestion
  })));
  const set = useBookmarkFormStore(s => s.set);
  const patchDraft = useBookmarkFormStore(s => s.patchDraft);
  const showToast = useUIManager(s => s.showToast);
  const {
    isEditing,
    previewText,
    previewIconUrl,
    previewIconStyle,
    isDraftTemplate,
    draftTemplateLabel,
    needsBackgroundSave,
    saveButtonLabel,
    aiEnabled,
    canUseAi,
    aiUnavailableReason,
    hasAIGenerated,
    selectedLocationsLabel
  } = useFormView({
    form
  });
  const {
    buildTextIcon,
    resolveLocationsForSave
  } = useFormSaveInputs();
  const {
    resetPendingIconFetch,
    openAdd,
    openEdit
  } = useFormEntry({
    set
  });
  const {
    askAI,
    runAutoPolishAfterFetch
  } = useFormMetadata({
    set,
    patchDraft
  });
  const {
    undoTitle,
    undoDesc,
    onTitleInput,
    takeOverTitle,
    applyTitleSuggestion,
    takeOverDesc,
    onDescInput
  } = useFormText({
    set,
    patchDraft
  });
  const {
    applyCategorySuggestion,
    askCategorySuggestion,
    dismissCategorySuggestion
  } = useFormCategory({
    set,
    showToast
  });
  const {
    requestDelete,
    handleSave
  } = useFormSave({
    set,
    showToast,
    buildTextIcon,
    resolveLocationsForSave
  });
  const {
    runUrlFetch
  } = useFormUrlFetch({
    set,
    patchDraft,
    showToast,
    runAutoPolishAfterFetch
  });
  useFormEffects({
    form,
    set,
    patchDraft,
    resetPendingIconFetch,
    isDraftTemplate
  });
  return {
    ...form,
    set,
    patchDraft,
    isEditing,
    maxDescLen: Infinity,
    previewIconStyle,
    previewText,
    previewIconUrl,
    selectedLocationsLabel,
    isDraftTemplate,
    draftTemplateLabel,
    needsBackgroundSave,
    saveButtonLabel,
    aiEnabled,
    canUseAi,
    aiUnavailableReason,
    hasAIGenerated,
    openAdd,
    openEdit,
    handleSave,
    runUrlFetch,
    askAI,
    undoTitle,
    undoDesc,
    onTitleInput,
    onDescInput,
    takeOverTitle,
    takeOverDesc,
    applyTitleSuggestion,
    askCategorySuggestion,
    applyCategorySuggestion,
    dismissCategorySuggestion,
    requestDelete,
    checkAiAvailable
  };
}
export type { CategorySuggestionState } from "./bookmark-form/state";
export { useBookmarkFormStore } from "./bookmark-form/state";
export { isValidUrlInput } from "./bookmark-form/icons";
export { enqueueMetadataHydration } from "./bookmark-form/hydration";
export { URL_FETCH_PASTE_DEBOUNCE_MS, URL_FETCH_IMMEDIATE_MS } from "./bookmark-form/runtime";
