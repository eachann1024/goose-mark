import { fetchAndCacheIcon } from '@/services/iconCache';
import { toIconSource, isHostLikeTitle, buildTextIconFromValue } from './icons';
import { isLoginOrAccessWallText, fetchMetadataFromNetwork } from '@/services/metadataFallback';
import { checkAiAvailable, generateMetadataDirect } from './metadata';
import { useBookmarkStore } from '@/stores/bookmark';
import type { Bookmark } from '@/types/bookmark';
export const shouldHydrateTitle = (initialTitle: string, currentTitle: string) => !initialTitle.trim() && !currentTitle.trim();
export const shouldHydrateDesc = (initialDesc: string, currentDesc?: string) => !initialDesc.trim() && !(currentDesc || '').trim();

// 后台元信息补全任务（模块级，跨实例共享 job 表，等价旧版单例）
export const hydrationJobIds = new Map<string, number>();

// 导出供 uTools 快速收集复用：快存只落 URL，标题/简介靠这套后台水合补全（与表单流程同一实现）
export const enqueueMetadataHydration = (bookmarkId: string, options: {
  url: string;
  initialTitle: string;
  initialDesc: string;
  forceAi?: boolean;
}) => {
  const jobId = Date.now() + Math.random();
  hydrationJobIds.set(bookmarkId, jobId);
  void (async () => {
    let usedNetworkFallback = false;
    try {
      const fetched = await fetchAndCacheIcon(options.url, true);
      let rawTitle = typeof fetched?.title === 'string' ? fetched.title.trim() : '';
      let rawDesc = typeof fetched?.description === 'string' ? fetched.description.trim() : '';
      const hydratedIcon = toIconSource(fetched);
      if (rawTitle && (isHostLikeTitle(rawTitle, options.url) || isLoginOrAccessWallText(rawTitle))) {
        rawTitle = '';
      }
      if (rawDesc && isLoginOrAccessWallText(rawDesc)) rawDesc = '';
      if (!rawTitle || !rawDesc) {
        const fallback = await fetchMetadataFromNetwork(options.url);
        if (fallback) {
          if (!rawTitle && fallback.title && !isHostLikeTitle(fallback.title, options.url) && !isLoginOrAccessWallText(fallback.title)) {
            rawTitle = fallback.title;
          }
          if (!rawDesc && fallback.description && !isLoginOrAccessWallText(fallback.description)) {
            rawDesc = fallback.description;
          }
          usedNetworkFallback = true;
        }
      }
      let nextTitle = rawTitle && !isHostLikeTitle(rawTitle, options.url) && !isLoginOrAccessWallText(rawTitle) ? rawTitle : '';
      let nextDesc = rawDesc && !isLoginOrAccessWallText(rawDesc) ? rawDesc : '';
      const aiReady = checkAiAvailable().available;
      if (options.forceAi && aiReady) {
        const aiResult = await generateMetadataDirect({
          url: options.url,
          title: rawTitle,
          desc: rawDesc,
          forceNetworkFallback: usedNetworkFallback
        });
        if (aiResult) {
          nextTitle = aiResult.title || nextTitle;
          nextDesc = aiResult.desc || nextDesc;
        }
      }
      if (hydrationJobIds.get(bookmarkId) !== jobId) return;
      const store = useBookmarkStore.getState();
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId);
      if (!bookmark || bookmark.url !== options.url) return;
      const patch: Partial<Bookmark> = {};
      if (nextTitle && shouldHydrateTitle(options.initialTitle, bookmark.title)) patch.title = nextTitle;
      if (nextDesc && shouldHydrateDesc(options.initialDesc, bookmark.desc)) patch.desc = nextDesc;
      if (hydratedIcon && (!bookmark.icon || bookmark.icon.type === 'text')) {
        patch.icon = hydratedIcon;
      } else if (!bookmark.icon && (nextTitle || options.url)) {
        patch.icon = buildTextIconFromValue(nextTitle || options.url);
      }
      if (Object.keys(patch).length > 0) store.updateBookmark(bookmarkId, patch);
    } catch (error) {
      console.warn('[BookmarkForm] background hydration failed:', error);
    } finally {
      if (hydrationJobIds.get(bookmarkId) === jobId) hydrationJobIds.delete(bookmarkId);
    }
  })();
};
