import type { FormSet, PatchDraft } from './controllerTypes';
import { useCallback } from 'react';
import { useBookmarkFormStore } from './state';
export function useFormText({
  set,
  patchDraft
}: {
  set: FormSet;
  patchDraft: PatchDraft;
}) {
  const onTitleInput = useCallback(() => set({
    isTitleDirty: true
  }), [set]);
  const takeOverTitle = useCallback(() => set({
    isTitleDirty: true
  }), [set]);

  // 采纳匹配到的标题：替换用户手动填写的内容（视为用户主动选择，保持 dirty）
  const applyTitleSuggestion = useCallback(() => {
    const {
      titleSuggestion
    } = useBookmarkFormStore.getState();
    if (!titleSuggestion) return;
    patchDraft({
      title: titleSuggestion
    });
    set({
      titleSuggestion: null,
      isTitleDirty: true
    });
  }, [patchDraft, set]);
  const takeOverDesc = useCallback(() => set({
    isDescDirty: true
  }), [set]);
  const onDescInput = useCallback((val: string) => {
    set({
      isDescDirty: true
    });
    patchDraft({
      desc: val
    });
  }, [set, patchDraft]);
  return {
    onTitleInput,
    takeOverTitle,
    applyTitleSuggestion,
    takeOverDesc,
    onDescInput
  };
}
