import { useCallback } from 'react';
import type { IconSource, BookmarkLocation } from '@/types/bookmark';
import { useBookmarkFormStore } from './state';
import { useBookmarkStore } from '@/stores/bookmark';
import type { FormSet, ShowToast, BuildTextIcon, ResolveLocationsForSave } from './controllerTypes';
import { addBehaviorLog } from '@/lib/debugReport';
import { isValidUrlInput } from './icons';
import { fetchAsDataUrl } from '@/services/iconCache';
import { enqueueMetadataHydration } from './hydration';
export function useFormSaveInputs() {
  // ---- 动作 ----
  const buildTextIcon = useCallback((): IconSource => {
    const {
      draft
    } = useBookmarkFormStore.getState();
    const base = (draft.title || draft.url).trim();
    const text = base ? base.slice(0, 4).toUpperCase() : '•';
    return {
      type: 'text',
      value: text
    };
  }, []);
  const resolveLocationsForSave = useCallback((): BookmarkLocation[] => {
    const {
      draftLocations
    } = useBookmarkFormStore.getState();
    if (draftLocations.length > 0) return [...draftLocations];
    const store = useBookmarkStore.getState();
    const activeGroup = store.groups.find(group => group.id === store.activeGroupId) ?? store.groups[0];
    const activeSubGroup = activeGroup?.children.find(child => child.id === store.activeSubGroupId) ?? activeGroup?.children[0];
    if (!activeGroup || !activeSubGroup) return [];
    return [{
      groupId: activeGroup.id,
      subGroupId: activeSubGroup.id
    }];
  }, []);
  return {
    buildTextIcon,
    resolveLocationsForSave
  };
}
export function useFormSave({
  set,
  showToast,
  buildTextIcon,
  resolveLocationsForSave
}: {
  set: FormSet;
  showToast: ShowToast;
  buildTextIcon: BuildTextIcon;
  resolveLocationsForSave: ResolveLocationsForSave;
}) {
  const requestDelete = useCallback(() => {
    const {
      editingId
    } = useBookmarkFormStore.getState();
    if (!editingId) return;
    addBehaviorLog('delete-bookmark', `id: ${editingId}`);
    useBookmarkStore.getState().removeBookmark(editingId);
    set({
      showAdd: false
    });
    showToast({
      title: '书签已删除',
      variant: 'success',
      duration: 2000
    });
  }, [set, showToast]);
  const handleSave = useCallback(async (options?: {
    forceAi?: boolean;
    background?: boolean;
  }) => {
    const state = useBookmarkFormStore.getState();
    const {
      draft,
      editingId,
      previewIcon,
      iconLoading,
      isGenerating
    } = state;
    set({
      formError: ''
    });
    if (!draft.url.trim()) return set({
      formError: '请输入链接'
    });
    if (!isValidUrlInput(draft.url)) return set({
      formError: '请输入有效链接'
    });
    if (state.isSaving) return;
    set({
      isSaving: true
    });
    try {
      const locationsToSave = resolveLocationsForSave();
      if (locationsToSave.length === 0) {
        set({
          formError: '请选择分类'
        });
        return;
      }
      const titleToSave = draft.title.trim();
      const descToSave = draft.desc.trim();
      const urlToSave = draft.url.trim();
      addBehaviorLog(editingId ? 'edit-bookmark' : 'add-bookmark', `${draft.title} ${draft.url}`.trim());
      let iconToSave = previewIcon ?? buildTextIcon();
      if (iconToSave.type === 'remote' && !iconToSave.cache && iconToSave.src) {
        const base64 = await fetchAsDataUrl(iconToSave.src);
        if (base64) iconToSave = {
          ...iconToSave,
          cache: base64,
          fetchedAt: Date.now()
        };
      }
      const store = useBookmarkStore.getState();
      if (editingId) {
        store.updateBookmark(editingId, {
          title: titleToSave,
          url: urlToSave,
          desc: descToSave,
          allowUniversal: draft.allowUniversal,
          tags: [...state.draftTags],
          icon: iconToSave
        });
        store.updateBookmarkLocations(editingId, locationsToSave);
      } else {
        const created = store.addBookmark({
          title: titleToSave,
          url: urlToSave,
          desc: descToSave,
          allowUniversal: draft.allowUniversal,
          tags: [...state.draftTags],
          pinned: false,
          icon: iconToSave
        }, locationsToSave);
        if (created && iconToSave?.type === 'text') void store.refreshSingleIcon(created);
        const shouldHydrateInBackground = !!options?.forceAi || !!options?.background || !titleToSave || !descToSave || !previewIcon || iconLoading || isGenerating;
        if (shouldHydrateInBackground) {
          enqueueMetadataHydration(created.id, {
            url: urlToSave,
            initialTitle: titleToSave,
            initialDesc: descToSave,
            forceAi: options?.forceAi
          });
        }
        const firstLoc = locationsToSave[0];
        if (firstLoc) {
          store.setSearch('');
          store.selectGroup(firstLoc.groupId, firstLoc.subGroupId);
        }
      }
      set({
        showAdd: false
      });
    } finally {
      set({
        isSaving: false
      });
    }
  }, [set, resolveLocationsForSave, buildTextIcon]);
  return {
    requestDelete,
    handleSave
  };
}
