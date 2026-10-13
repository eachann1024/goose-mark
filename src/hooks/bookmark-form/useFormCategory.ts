import type { FormSet, ShowToast } from './controllerTypes';
import { useCallback } from 'react';
import { useBookmarkFormStore } from './state';
import { checkAiAvailable, getActiveAiSettings, resolveErrorMessage } from './metadata';
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark';
import { addBehaviorLog } from '@/lib/debugReport';
import { buildCategoryUserPrompt, CATEGORY_SYSTEM_PROMPT, CATEGORY_OUTPUT } from '@/constants/aiPrompts';
import { runAIText } from '@/lib/aiProvider';
import { parseAIJsonObject, normalizeAIConfidence, truncateAIText } from '@/lib/aiOutput';
import type { CategorySuggestionState } from './state';
export function useFormCategory({
  set,
  showToast
}: {
  set: FormSet;
  showToast: ShowToast;
}) {
  const applyCategorySuggestion = useCallback((options?: {
    silent?: boolean;
    keepSuggestion?: boolean;
  }) => {
    const {
      categorySuggestion
    } = useBookmarkFormStore.getState();
    if (!categorySuggestion) return;
    set({
      draftLocations: [{
        groupId: categorySuggestion.groupId,
        subGroupId: categorySuggestion.subGroupId
      }]
    });
    if (!options?.keepSuggestion) set({
      categorySuggestion: null
    });
    if (!options?.silent) showToast({
      title: '已应用分类建议',
      variant: 'success'
    });
  }, [set, showToast]);
  const askCategorySuggestion = useCallback(async () => {
    const {
      draft
    } = useBookmarkFormStore.getState();
    if (!draft.url) return;
    const {
      available,
      reason
    } = checkAiAvailable();
    if (!available) {
      showToast({
        title: reason,
        variant: 'warning'
      });
      return;
    }
    const store = useBookmarkStore.getState();
    const existingGroups = store.groups.filter(g => g.id !== TRASH_GROUP_ID).map(g => ({
      id: g.id,
      name: g.name,
      subGroups: g.children.map(c => ({
        id: c.id,
        name: c.name
      }))
    }));
    if (existingGroups.length === 0) {
      showToast({
        title: '请先创建分组',
        variant: 'warning'
      });
      return;
    }
    addBehaviorLog('ask-category-suggestion', draft.url);
    set({
      isSuggestingCategory: true,
      aiError: ''
    });
    try {
      const prompt = buildCategoryUserPrompt({
        url: draft.url,
        groups: existingGroups.map(group => ({
          name: group.name,
          subGroups: group.subGroups
        })),
        concise: true
      });
      const res = await runAIText(getActiveAiSettings(), [{
        role: 'system',
        content: CATEGORY_SYSTEM_PROMPT
      }, {
        role: 'user',
        content: prompt
      }], {
        output: CATEGORY_OUTPUT
      });
      let data: Record<string, unknown>;
      try {
        data = parseAIJsonObject(res);
      } catch {
        showToast({
          title: 'AI 返回格式异常，请重试',
          variant: 'warning'
        });
        return;
      }
      // groupName 为空字符串时 includes('') 会误选第一个分组，trim 后为空视为无建议（问题6）
      const groupNameStr = typeof data.groupName === 'string' ? data.groupName.trim() : '';
      const matchedGroup = groupNameStr ? existingGroups.find(group => group.name === groupNameStr) : undefined;
      if (matchedGroup) {
        const matchedSubGroup = data.subGroupName ? matchedGroup.subGroups.find(s => s.name === data.subGroupName) : matchedGroup.subGroups[0];
        if (!matchedSubGroup) {
          showToast({
            title: 'AI 返回的子分组不在现有列表中',
            variant: 'info'
          });
          return;
        }
        const result: CategorySuggestionState = {
          groupId: matchedGroup.id,
          groupName: matchedGroup.name,
          subGroupId: matchedSubGroup?.id || matchedGroup.subGroups[0]?.id || '',
          subGroupName: matchedSubGroup?.name || matchedGroup.subGroups[0]?.name || '',
          confidence: normalizeAIConfidence(data.confidence),
          reason: truncateAIText(data.reason, 30) || '基于 URL 内容推荐'
        };
        set({
          categorySuggestion: result
        });
      } else {
        showToast({
          title: '未找到合适的分类建议',
          variant: 'info'
        });
      }
    } catch (error) {
      const message = resolveErrorMessage(error, '分类');
      set({
        aiError: message
      });
      showToast({
        title: message,
        variant: 'warning'
      });
    } finally {
      set({
        isSuggestingCategory: false
      });
    }
  }, [set, showToast, applyCategorySuggestion]);
  const dismissCategorySuggestion = useCallback(() => set({
    categorySuggestion: null
  }), [set]);
  return {
    applyCategorySuggestion,
    askCategorySuggestion,
    dismissCategorySuggestion
  };
}
