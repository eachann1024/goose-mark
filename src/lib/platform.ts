/**
 * 运行平台检测
 * --------------------------------------------------------------------------
 * uTools 模式：preload/preload.cjs 在窗口加载时把 utools API 挂到 window.utools。
 * 独立模式：普通浏览器调试，window.utools 不存在，仅提供非持久化调试能力。
 */

export type RuntimePlatform = 'utools' | 'standalone'

export const isUToolsRuntime = (): boolean =>
  typeof window !== 'undefined' && typeof (window as { utools?: unknown }).utools !== 'undefined'

export const getRuntimePlatform = (): RuntimePlatform => (isUToolsRuntime() ? 'utools' : 'standalone')
