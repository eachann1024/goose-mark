import type { BookmarkLocation, IconSource } from '@/types/bookmark';
import { create } from 'zustand';
export interface CategorySuggestionState {
  groupId: string;
  groupName: string;
  subGroupId: string;
  subGroupName: string;
  confidence: number;
  reason: string;
}
export interface DraftState {
  title: string;
  url: string;
  desc: string;
  allowUniversal: boolean;
}
export interface BookmarkFormState {
  showAdd: boolean;
  modalTitle: string;
  editingId: string;
  draft: DraftState;
  draftTags: string[];
  draftLocations: BookmarkLocation[];
  previewIcon: IconSource | null;
  showCategorySelector: boolean;
  showIconSelector: boolean;
  formError: string;
  isSaving: boolean;
  iconLoading: boolean;
  iconFetchFailed: boolean;
  iconFetchPhase: 'idle' | 'loading' | 'success' | 'failed';
  isTitleDirty: boolean;
  isDescDirty: boolean;
  /** 用户已手动填写标题时，抓到的匹配标题不直接覆盖，存为可点击采纳的建议 */
  titleSuggestion: string | null;
  originalUrl: string;
  /** 最近一次（排定）读取网页信息时的 URL，用于判断链接是否有未读取变更 */
  lastFetchedUrl: string;
  isGenerating: boolean;
  isSuggestingCategory: boolean;
  aiError: string;
  originalBeforeAI: {
    title: string;
    desc: string;
  } | null;
  categorySuggestion: CategorySuggestionState | null;
  set: (patch: Partial<BookmarkFormState>) => void;
  patchDraft: (patch: Partial<DraftState>) => void;
}
export const initialDraft = (): DraftState => ({
  title: '',
  url: '',
  desc: '',
  allowUniversal: false
});

/** 模块级共享表单状态（等价旧版 createSharedComposable 的单例 state） */
export const useBookmarkFormStore = create<BookmarkFormState>(set => ({
  showAdd: false,
  modalTitle: '新建书签',
  editingId: '',
  draft: initialDraft(),
  draftTags: [],
  draftLocations: [],
  previewIcon: null,
  showCategorySelector: false,
  showIconSelector: false,
  formError: '',
  isSaving: false,
  iconLoading: false,
  iconFetchFailed: false,
  iconFetchPhase: 'idle' as const,
  isTitleDirty: false,
  isDescDirty: false,
  titleSuggestion: null,
  originalUrl: '',
  lastFetchedUrl: '',
  isGenerating: false,
  isSuggestingCategory: false,
  aiError: '',
  originalBeforeAI: null,
  categorySuggestion: null,
  set: patch => set(patch),
  patchDraft: patch => set(s => ({
    draft: {
      ...s.draft,
      ...patch
    }
  }))
}));
