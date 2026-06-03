/**
 * @deprecated 请使用 useUIManager 替代
 * 保留此文件仅为向后兼容
 */
import { useUIManager, type ToastVariant, type ToastState } from './useUIManager'

export type { ToastVariant, ToastState }

export function useToast() {
  const toastState = useUIManager((s) => s.toastState)
  const showToast = useUIManager((s) => s.showToast)
  const closeToast = useUIManager((s) => s.closeToast)
  return { toastState, showToast, closeToast }
}
