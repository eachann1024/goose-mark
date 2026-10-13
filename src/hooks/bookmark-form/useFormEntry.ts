import type { FormSet } from './controllerTypes';
import { useCallback } from 'react';
import { formRequests } from './runtime';
import type { BookmarkLocation, Bookmark } from '@/types/bookmark';
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark';
import { initialDraft } from './state';
export function useFormEntry({
  set
}: {
  set: FormSet;
}) {
  const resetPendingIconFetch = useCallback(() => {
    if (formRequests.urlFetchTimer) {
      clearTimeout(formRequests.urlFetchTimer);
      formRequests.urlFetchTimer = null;
    }
    if (formRequests.iconLoadingWatchdog) {
      clearTimeout(formRequests.iconLoadingWatchdog);
      formRequests.iconLoadingWatchdog = null;
    }
    // 递增代际计数器，使所有在途的图标/AI 响应作废：
    // 关表单再打开同 URL 的另一表单时，旧会话的慢响应不能写进新会话。
    // 在途请求作废后其 finally 不再清 isGenerating，这里一并兜底重置。
    formRequests.urlFetchRequestId++;
    formRequests.askAiRequestId++;
    set({
      iconLoading: false,
      iconFetchFailed: false,
      iconFetchPhase: 'idle',
      isGenerating: false
    });
  }, [set]);

  /** 解析新建默认「放到哪里」：优先 preferred，否则 store.active*；过滤回收站；无效则回退首个有效组+首子组 */
  const resolveDefaultDraftLocations = useCallback((preferred?: {
    groupId?: string | null;
    subGroupId?: string | null;
  }): BookmarkLocation[] => {
    const store = useBookmarkStore.getState();
    const validGroups = store.groups.filter(g => g.id !== TRASH_GROUP_ID && g.children.length > 0);
    if (validGroups.length === 0) return [];
    const preferGroupId = (preferred?.groupId || store.activeGroupId || '').trim();
    const preferSubId = (preferred?.subGroupId || store.activeSubGroupId || '').trim();
    let group = preferGroupId && preferGroupId !== TRASH_GROUP_ID ? validGroups.find(g => g.id === preferGroupId) : undefined;
    if (!group) group = validGroups[0];
    let sub = preferSubId ? group.children.find(c => c.id === preferSubId) : undefined;
    if (!sub) sub = group.children[0];
    if (!sub) return [];
    return [{
      groupId: group.id,
      subGroupId: sub.id
    }];
  }, []);
  const openAdd = useCallback((preferred?: {
    groupId?: string | null;
    subGroupId?: string | null;
  }) => {
    resetPendingIconFetch();
    const draftLocations = resolveDefaultDraftLocations(preferred);
    set({
      editingId: '',
      modalTitle: '新建书签',
      draft: initialDraft(),
      draftTags: [],
      draftLocations,
      previewIcon: null,
      formError: '',
      isTitleDirty: false,
      isDescDirty: false,
      titleSuggestion: null,
      originalUrl: '',
      lastFetchedUrl: '',
      showAdd: true
    });
  }, [resetPendingIconFetch, resolveDefaultDraftLocations, set]);
  const openEdit = useCallback((bookmark: Bookmark) => {
    resetPendingIconFetch();
    const store = useBookmarkStore.getState();
    set({
      editingId: bookmark.id,
      modalTitle: '编辑书签',
      draft: {
        title: bookmark.title || '',
        url: bookmark.url,
        allowUniversal: bookmark.allowUniversal ?? false,
        desc: bookmark.desc || ''
      },
      previewIcon: bookmark.icon ?? null,
      formError: '',
      isTitleDirty: true,
      titleSuggestion: null,
      originalUrl: bookmark.url,
      lastFetchedUrl: bookmark.url,
      draftTags: [...(bookmark.tags ?? [])],
      draftLocations: store.getBookmarkLocations(bookmark.id),
      showAdd: true
    });
  }, [resetPendingIconFetch, set]);
  return {
    resetPendingIconFetch,
    openAdd,
    openEdit
  };
}
