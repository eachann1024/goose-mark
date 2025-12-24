/**
 * @deprecated 请使用 useUIManager 替代
 * 保留此文件仅为向后兼容
 */
import { useUIManager, type ToastVariant, type ToastState } from './useUIManager'

export type { ToastVariant, ToastState }

export function useToast() {
  const { toastState, showToast, closeToast } = useUIManager()
  return { toastState, showToast, closeToast }
}


