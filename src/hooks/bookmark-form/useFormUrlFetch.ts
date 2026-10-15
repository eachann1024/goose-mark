import type { FormSet, PatchDraft, ShowToast, MetadataAutoPolish } from './controllerTypes';
import { useCallback } from 'react';
import { URL_FETCH_IMMEDIATE_MS, formRequests, ICON_LOADING_WATCHDOG_MS, JINA_FALLBACK_TIMEOUT_MS } from './runtime';
import { useBookmarkFormStore } from './state';
import { buildTextIconFromValue, isHostLikeTitle, toIconSource } from './icons';
import { fetchAndCacheIcon } from '@/services/iconCache';
import { isLoginOrAccessWallText, fetchMetadataFromNetwork } from '@/services/metadataFallback';
export function useFormUrlFetch({
  set,
  patchDraft,
  showToast,
  runAutoPolishAfterFetch
}: {
  set: FormSet;
  patchDraft: PatchDraft;
  showToast: ShowToast;
  runAutoPolishAfterFetch: MetadataAutoPolish;
}) {
  // 手动触发抓取；debounceMs 默认 400（读取按钮/失焦/重试），粘贴后自动读取用 500ms 短防抖。
  const runUrlFetch = useCallback((debounceMs = URL_FETCH_IMMEDIATE_MS) => {
    const {
      editingId,
      originalUrl
    } = useBookmarkFormStore.getState();
    const val = useBookmarkFormStore.getState().draft.url;
    if (!val) return;
    // 编辑模式下：URL 未变化则跳过取图标/标题
    if (editingId && val === originalUrl) return;
    if (formRequests.urlFetchTimer) clearTimeout(formRequests.urlFetchTimer);
    // 每次发起前递增 id，响应回来后校验是否仍是最新请求
    const thisRequestId = ++formRequests.urlFetchRequestId;
    // 排定抓取即进入加载态：标题/描述流光在识别阶段开始转，避免快速响应时加载态一闪而过
    set({
      iconLoading: true,
      iconFetchFailed: false,
      iconFetchPhase: 'loading',
      lastFetchedUrl: val,
      titleSuggestion: null
    });
    // 启动加载态看门狗：即便本次请求回调因代际竞态被丢弃，也保证加载态在总预算后强制落定，
    // 识别环不会无限转。正常回调会在 finally 里清掉它。
    if (formRequests.iconLoadingWatchdog) clearTimeout(formRequests.iconLoadingWatchdog);
    formRequests.iconLoadingWatchdog = setTimeout(() => {
      formRequests.iconLoadingWatchdog = null;
      const s = useBookmarkFormStore.getState();
      if (!s.iconLoading) return;
      set({
        iconLoading: false,
        previewIcon: s.previewIcon ?? buildTextIconFromValue(val),
        iconFetchFailed: !s.previewIcon,
        iconFetchPhase: s.iconFetchPhase === 'success' ? 'success' : 'failed'
      });
    }, ICON_LOADING_WATCHDOG_MS);
    formRequests.urlFetchTimer = setTimeout(async () => {
      formRequests.urlFetchTimer = null;
      let usedNetworkFallback = false;
      let titleUsable = false;
      let fetchSettled = false;
      try {
        const fetched = await Promise.race([fetchAndCacheIcon(val, true), new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))]);
        let latest = useBookmarkFormStore.getState();
        // 双重校验：(1) 请求 id 仍是最新；(2) 当前 draft.url 与发起时一致
        // 任一不满足说明用户已切换 URL，丢弃本次响应
        if (thisRequestId !== formRequests.urlFetchRequestId || latest.draft.url !== val) return;
        let metaTitle = typeof fetched?.title === 'string' ? fetched.title.trim() : '';
        let metaDesc = typeof fetched?.description === 'string' ? fetched.description.trim() : '';
        if (metaTitle && isLoginOrAccessWallText(metaTitle)) metaTitle = '';
        if (metaDesc && isLoginOrAccessWallText(metaDesc)) metaDesc = '';
        titleUsable = !!metaTitle && !isHostLikeTitle(metaTitle, val) && !isLoginOrAccessWallText(metaTitle);

        // 联网兜底只读取目标网页；没有可靠内容时保留空值。
        if (!titleUsable && !latest.isTitleDirty || !metaDesc && !latest.isDescDirty) {
          const fallback = await fetchMetadataFromNetwork(val, JINA_FALLBACK_TIMEOUT_MS);
          latest = useBookmarkFormStore.getState();
          if (thisRequestId !== formRequests.urlFetchRequestId || latest.draft.url !== val) return;
          if (fallback) {
            usedNetworkFallback = true;
            if (!titleUsable && fallback.title && !isHostLikeTitle(fallback.title, val) && !isLoginOrAccessWallText(fallback.title)) {
              metaTitle = fallback.title;
              titleUsable = true;
            }
            if (!metaDesc && fallback.description && !isLoginOrAccessWallText(fallback.description)) {
              metaDesc = fallback.description;
            }
          }
        }
        if (fetched || titleUsable || metaDesc) {
          const newIcon = fetched ? toIconSource(fetched) : buildTextIconFromValue(val);
          set({
            previewIcon: newIcon,
            iconFetchFailed: fetched ? fetched.type === 'text' || fetched.type === 'remote' && !fetched.src : true,
            iconFetchPhase: titleUsable || metaDesc ? 'success' : 'failed'
          });
          if (titleUsable && !latest.isTitleDirty) {
            patchDraft({
              title: metaTitle
            });
          } else if (titleUsable) {
            // 用户已手动填写标题：不覆盖，把匹配到的标题存为可点击采纳的建议
            set({
              titleSuggestion: metaTitle !== latest.draft.title.trim() ? metaTitle : null
            });
          }
          if (metaDesc && !latest.isDescDirty) patchDraft({
            desc: metaDesc
          });
          // 流光结束但有字段没拿到：告知原因，引导手动填写（用户接管的字段不计入）
          const missing = [!titleUsable && !latest.isTitleDirty ? '标题' : '', !metaDesc && !latest.isDescDirty ? '描述' : ''].filter(Boolean);
          if (missing.length > 0) {
            showToast({
              title: `未能获取${missing.join('和')}：站点未提供该信息或访问受限，请手动填写`,
              variant: 'info'
            });
          }
        } else {
          set({
            previewIcon: buildTextIconFromValue(val),
            iconFetchFailed: true,
            iconFetchPhase: 'failed'
          });
          if (!latest.draft.title.trim()) {
            showToast({
              title: '未能获取标题和描述：站点无响应或返回为空，请手动填写',
              variant: 'info'
            });
          }
        }
        fetchSettled = true;
      } catch {
        // 代际校验：旧会话的失败响应不覆盖新表单
        const latestOnCatch = useBookmarkFormStore.getState();
        if (thisRequestId !== formRequests.urlFetchRequestId || latestOnCatch.draft.url !== val) return;
        set({
          previewIcon: buildTextIconFromValue(val),
          iconFetchFailed: true,
          iconFetchPhase: 'failed'
        });
        showToast({
          title: '获取网页信息失败：网络异常或站点拒绝访问，请手动填写标题和描述',
          variant: 'warning'
        });
        fetchSettled = true;
      } finally {
        // iconLoading 只在请求仍有效时才关闭（已被新请求接管则不干扰）
        if (thisRequestId === formRequests.urlFetchRequestId) {
          set({
            iconLoading: false
          });
          // 本次请求正常落定，撤销看门狗兜底
          if (formRequests.iconLoadingWatchdog) {
            clearTimeout(formRequests.iconLoadingWatchdog);
            formRequests.iconLoadingWatchdog = null;
          }
          // AI 仅整理已有页面线索，无内容时由元信息服务跳过。
          if (fetchSettled) {
            void runAutoPolishAfterFetch({
              url: val,
              forceNetworkFallback: usedNetworkFallback || !titleUsable,
              fetchRequestId: thisRequestId
            });
          }
        }
      }
    }, debounceMs);
  }, [runAutoPolishAfterFetch, set, patchDraft, showToast]);
  return {
    runUrlFetch
  };
}
