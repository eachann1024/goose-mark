export const ICON_LOADING_WATCHDOG_MS = 18000;

// 粘贴链接后自动读取的防抖（粘贴是「一次成型」的输入，短防抖即可；打字不触发自动读取）
export const URL_FETCH_PASTE_DEBOUNCE_MS = 500;
export const URL_FETCH_IMMEDIATE_MS = 400;

// 表单内联网兜底总预算：原始网页 + 目标页面 Reader。
export const JINA_FALLBACK_TIMEOUT_MS = 12000;

// 四个请求字段跨 hook 实例共享，保持旧模块级单例的归属。
export const formRequests = {
  urlFetchTimer: null as ReturnType<typeof setTimeout> | null,
  iconLoadingWatchdog: null as ReturnType<typeof setTimeout> | null,
  urlFetchRequestId: 0
};
