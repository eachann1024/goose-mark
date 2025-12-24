import { ref } from 'vue'

// ============ Tooltip 管理 ============
const tooltipProviderKey = ref(0)

// ============ Toast 管理 ============
export type ToastVariant = 'success' | 'info' | 'warning' | 'error'

export interface ToastState {
  visible: boolean
  title: string
  description?: string
  variant?: ToastVariant
  actionLabel?: string
  onAction?: () => void
  duration?: number
}

const toastState = ref<ToastState>({
  visible: false,
  title: '',
  variant: 'info'
})

let toastTimer: ReturnType<typeof setTimeout> | null = null

// ============ Dialog 管理 ============
const openDialogCount = ref(0)

/**
 * 统一的 UI 状态管理
 * 整合 Tooltip、Toast、Dialog 等 UI 组件的全局状态
 */
export function useUIManager() {
  // ========== Tooltip ==========
  
  /** 隐藏所有悬浮提示 */
  const hideAllTooltips = () => {
    tooltipProviderKey.value++
  }

  // ========== Toast ==========
  
  /** 显示 Toast 提示 */
  const showToast = (options: Omit<ToastState, 'visible'>) => {
    if (toastTimer) clearTimeout(toastTimer)
    
    toastState.value = {
      visible: true,
      title: options.title,
      description: options.description,
      variant: options.variant || 'info',
      actionLabel: options.actionLabel,
      onAction: options.onAction
    }

    const duration = options.duration || 4500
    toastTimer = setTimeout(() => {
      closeToast()
    }, duration)
  }

  /** 关闭 Toast 提示 */
  const closeToast = () => {
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = null
    toastState.value.visible = false
    setTimeout(() => {
      if (!toastState.value.visible) {
        toastState.value.onAction = undefined
      }
    }, 300)
  }

  // ========== Dialog ==========
  
  /** 注册弹窗打开 */
  const registerDialogOpen = () => {
    openDialogCount.value++
  }

  /** 注册弹窗关闭 */
  const registerDialogClose = () => {
    openDialogCount.value = Math.max(0, openDialogCount.value - 1)
  }

  /** 当前是否有弹窗打开 */
  const hasOpenDialog = () => openDialogCount.value > 0

  // ========== 组合操作 ==========
  
  /** 
   * 弹窗关闭时的清理操作
   * - 隐藏所有 tooltip
   * - 可选：关闭 toast
   */
  const onDialogClose = (options?: { closeToast?: boolean }) => {
    hideAllTooltips()
    registerDialogClose()
    if (options?.closeToast) {
      closeToast()
    }
  }

  /**
   * 弹窗打开时的操作
   * - 隐藏所有 tooltip（避免 tooltip 显示在弹窗之上）
   */
  const onDialogOpen = () => {
    hideAllTooltips()
    registerDialogOpen()
  }

  /**
   * 主界面切换/触发时的清理
   * - 隐藏所有 tooltip
   * - 关闭 toast
   */
  const onMainViewSwitch = () => {
    hideAllTooltips()
    closeToast()
  }

  return {
    // Tooltip
    tooltipProviderKey,
    hideAllTooltips,
    
    // Toast
    toastState,
    showToast,
    closeToast,
    
    // Dialog
    openDialogCount,
    registerDialogOpen,
    registerDialogClose,
    hasOpenDialog,
    
    // 组合操作
    onDialogClose,
    onDialogOpen,
    onMainViewSwitch
  }
}
