import type { FormView, FormSet, PatchDraft, ResetPendingIconFetch } from './controllerTypes';
import { useEffect } from 'react';
import { useBookmarkFormStore } from './state';
import { formRequests } from './runtime';
export function useFormEffects({
  form,
  set,
  patchDraft,
  resetPendingIconFetch,
  isDraftTemplate
}: {
  form: FormView;
  set: FormSet;
  patchDraft: PatchDraft;
  resetPendingIconFetch: ResetPendingIconFetch;
  isDraftTemplate: boolean;
}) {
  // ---- 副作用：URL 变更仅清空遗留标题/预览（自动重抓仅在确认页 ConfirmStep）----
  const draftUrl = form.draft.url;
  useEffect(() => {
    const {
      isTitleDirty,
      isDescDirty,
      editingId
    } = useBookmarkFormStore.getState();
    const val = draftUrl;
    // 链接一变，旧链接的匹配标题建议即失效
    set({
      titleSuggestion: null
    });
    if (!val) {
      if (formRequests.urlFetchTimer) {
        clearTimeout(formRequests.urlFetchTimer);
        formRequests.urlFetchTimer = null;
      }
      formRequests.urlFetchRequestId++;
      resetPendingIconFetch();
      set({
        previewIcon: null,
        iconLoading: false,
        iconFetchPhase: 'idle'
      });
      if (!isTitleDirty) patchDraft({
        title: ''
      });
      if (!isDescDirty) patchDraft({
        desc: ''
      });
      return;
    }
    if (!isTitleDirty && !editingId) patchDraft({
      title: ''
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUrl]);

  // 模板失效时清掉 allowUniversal（等价旧版 watch(isDraftTemplate)）
  useEffect(() => {
    if (!isDraftTemplate) patchDraft({
      allowUniversal: false
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraftTemplate]);

  // 关闭弹窗时重置状态（等价旧版 watch(showAdd)）
  useEffect(() => {
    if (!form.showAdd) {
      set({
        previewIcon: null,
        showCategorySelector: false,
        iconLoading: false,
        iconFetchPhase: 'idle' as const,
        editingId: '',
        iconFetchFailed: false,
        formError: '',
        isSaving: false,
        originalUrl: '',
        lastFetchedUrl: '',
        isTitleDirty: false,
        isDescDirty: false,
        titleSuggestion: null
      });
      if (formRequests.urlFetchTimer) {
        clearTimeout(formRequests.urlFetchTimer);
        formRequests.urlFetchTimer = null;
      }
      if (formRequests.iconLoadingWatchdog) {
        clearTimeout(formRequests.iconLoadingWatchdog);
        formRequests.iconLoadingWatchdog = null;
      }
      formRequests.urlFetchRequestId++;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.showAdd]);
}
