/**
 * 运行平台检测
 * --------------------------------------------------------------------------
 * uTools 模式：preload/preload.cjs 在窗口加载时把 utools API 挂到 window.utools。
 * 独立模式：普通浏览器 / Tauri 壳，window.utools 不存在，数据回退 localStorage。
 */

export type RuntimePlatform = 'utools' | 'standalone'

export const isUToolsRuntime = (): boolean =>
  typeof window !== 'undefined' && typeof (window as { utools?: unknown }).utools !== 'undefined'

export const getRuntimePlatform = (): RuntimePlatform => (isUToolsRuntime() ? 'utools' : 'standalone')
