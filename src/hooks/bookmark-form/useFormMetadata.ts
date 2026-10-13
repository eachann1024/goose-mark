import type { FormSet, PatchDraft } from './controllerTypes';
import { useCallback } from 'react';
import { useBookmarkFormStore } from './state';
import { checkAiAvailable, generateMetadataDirect, resolveErrorMessage } from './metadata';
import { notify } from '@/lib/notify';
import { addBehaviorLog } from '@/lib/debugReport';
import { formRequests } from './runtime';
import type { DraftState } from './state';
import { useSettingsStore } from '@/stores/settings';
export function useFormMetadata({
  set,
  patchDraft
}: {
  set: FormSet;
  patchDraft: PatchDraft;
}) {
  const askAI = useCallback(async (showNotify = false) => {
    const {
      draft,
      originalBeforeAI
    } = useBookmarkFormStore.getState();
    if (!draft.url) return;
    const {
      available,
      reason
    } = checkAiAvailable();
    if (!available) {
      if (showNotify) notify(reason);
      set({
        formError: reason
      });
      return;
    }
    if (!originalBeforeAI) {
      set({
        originalBeforeAI: {
          title: draft.title,
          desc: draft.desc
        }
      });
    }
    addBehaviorLog('ask-ai', draft.url);
    set({
      isGenerating: true,
      aiError: ''
    });
    // 代际校验：requestId 区分同 URL 的并发请求/跨会话请求，URL 校验作第二道防线
    const thisAskAiId = ++formRequests.askAiRequestId;
    const askAiUrl = draft.url;
    try {
      const res = await generateMetadataDirect({
        url: draft.url,
        title: draft.title,
        desc: draft.desc
      });
      // 已有更新的请求发起，或用户已切换 URL：丢弃本次 AI 生成结果
      if (thisAskAiId !== formRequests.askAiRequestId) return;
      if (useBookmarkFormStore.getState().draft.url !== askAiUrl) return;
      if (res) {
        const patch: Partial<DraftState> = {};
        if (res.title) patch.title = res.title;
        if (res.desc) patch.desc = res.desc;
        if (Object.keys(patch).length) patchDraft(patch);
      }
    } catch (error) {
      if (thisAskAiId !== formRequests.askAiRequestId) return;
      const message = resolveErrorMessage(error, '生成');
      set({
        aiError: message
      });
      if (showNotify) notify(message);
      set({
        formError: message
      });
    } finally {
      // 只有仍是最新请求时才清 isGenerating，避免旧请求先结束误关新请求的加载态
      if (thisAskAiId === formRequests.askAiRequestId) set({
        isGenerating: false
      });
    }
  }, [set, patchDraft]);

  /**
     * URL 元信息抓取结束后的自动 AI 清洗润色（仅新建 + 设置开启 + AI 可用）。
     * 不覆盖用户已 dirty 的标题/简介；代际与 URL 一致性与 askAI 一致。
     */
  const runAutoPolishAfterFetch = useCallback(async (input: {
    url: string;
    forceNetworkFallback: boolean;
    /** 绑定本次 url 抓取代际：抓取已被新请求取代则跳过 */
    fetchRequestId: number;
  }) => {
    if (!input.url) return;
    if (input.fetchRequestId !== formRequests.urlFetchRequestId) return;
    const settings = useSettingsStore.getState();
    if (!settings.aiFormAutoPolish) return;
    if (!checkAiAvailable().available) return;
    const form = useBookmarkFormStore.getState();
    if (form.editingId) return;
    if (form.draft.url !== input.url) return;
    // 标题与简介都已被用户接管时无需自动跑
    if (form.isTitleDirty && form.isDescDirty) return;
    if (!form.originalBeforeAI) {
      set({
        originalBeforeAI: {
          title: form.draft.title,
          desc: form.draft.desc
        }
      });
    }
    addBehaviorLog('auto-polish', input.url);
    set({
      isGenerating: true,
      aiError: ''
    });
    const thisAskAiId = ++formRequests.askAiRequestId;
    try {
      const latest = useBookmarkFormStore.getState();
      const res = await generateMetadataDirect({
        url: input.url,
        title: latest.draft.title,
        desc: latest.draft.desc,
        forceNetworkFallback: input.forceNetworkFallback
      });
      if (thisAskAiId !== formRequests.askAiRequestId) return;
      if (input.fetchRequestId !== formRequests.urlFetchRequestId) return;
      const after = useBookmarkFormStore.getState();
      if (after.draft.url !== input.url) return;
      if (!res) return;
      const patch: Partial<DraftState> = {};
      if (res.title && !after.isTitleDirty) patch.title = res.title;
      if (res.desc && !after.isDescDirty) patch.desc = res.desc;
      if (Object.keys(patch).length) patchDraft(patch);
    } catch (error) {
      if (thisAskAiId !== formRequests.askAiRequestId) return;
      const message = resolveErrorMessage(error, '生成');
      set({
        aiError: message
      });
    } finally {
      if (thisAskAiId === formRequests.askAiRequestId) set({
        isGenerating: false
      });
    }
  }, [set, patchDraft]);
  return {
    askAI,
    runAutoPolishAfterFetch
  };
}
