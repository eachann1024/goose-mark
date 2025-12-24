import { ref } from 'vue'

// ============ Tooltip 管理 ============
const tooltipProviderKey = ref(0)
const isTooltipEnabled = ref(true)

// ============ Toast 管理 ============
export type ToastVariant = 'success' | 'info' | 'warning' | 'error'
export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** 锚点信息，用于智能计算 Toast 位置 */
export interface ToastAnchor {
  /** 锚点元素的边界矩形 */
  rect?: DOMRect
  /** 锚点元素（会自动获取 getBoundingClientRect） */
  element?: HTMLElement
  /** 偏好策略：avoid=避开锚点，near=靠近锚点 */
  strategy?: 'avoid' | 'near'
}

export interface ToastState {
  visible: boolean
  title: string
  description?: string
  variant?: ToastVariant
  actionLabel?: string
  onAction?: () => void
  duration?: number
  position?: ToastPosition
}

export interface ToastOptions extends Omit<ToastState, 'visible'> {
  /** 锚点信息，用于智能计算位置（优先级高于 position） */
  anchor?: ToastAnchor
}

const toastState = ref<ToastState>({
  visible: false,
  title: '',
  variant: 'info',
  position: 'top-right'
})

let toastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 根据锚点位置计算最佳 Toast 显示位置
 * @param anchor 锚点信息
 * @returns 最佳位置
 */
const calcToastPosition = (anchor?: ToastAnchor): ToastPosition => {
  if (!anchor) return 'top-right'
  
  const rect = anchor.rect || anchor.element?.getBoundingClientRect()
  if (!rect) return 'top-right'
  
  const strategy = anchor.strategy || 'avoid'
  const viewWidth = window.innerWidth
  const viewHeight = window.innerHeight
  
  // 锚点中心点
  const anchorCenterX = rect.left + rect.width / 2
  const anchorCenterY = rect.top + rect.height / 2
  
  // 判断锚点在视口的哪个象限
  const isLeft = anchorCenterX < viewWidth / 2
  const isTop = anchorCenterY < viewHeight / 2
  
  if (strategy === 'avoid') {
    // 避开锚点：Toast 显示在对角位置
    if (isLeft && isTop) return 'top-right'      // 锚点左上 → Toast 右上
    if (!isLeft && isTop) return 'top-left'      // 锚点右上 → Toast 左上
    if (isLeft && !isTop) return 'bottom-right'  // 锚点左下 → Toast 右下
    return 'bottom-left'                         // 锚点右下 → Toast 左下
  } else {
    // 靠近锚点：Toast 显示在同侧
    if (isLeft && isTop) return 'top-left'
    if (!isLeft && isTop) return 'top-right'
    if (isLeft && !isTop) return 'bottom-left'
    return 'bottom-right'
  }
}

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
    // 采用非毁灭性方式：通过状态切换强制销毁当前的 Tooltip 内容
    isTooltipEnabled.value = false
    nextTick(() => {
      isTooltipEnabled.value = true
    })
  }

  // ========== Toast ==========
  
  /** 显示 Toast 提示 */
  const showToast = (options: ToastOptions) => {
    if (toastTimer) clearTimeout(toastTimer)
    
    // 如果提供了 anchor，自动计算位置
    const position = options.anchor 
      ? calcToastPosition(options.anchor)
      : (options.position || 'top-right')
    
    toastState.value = {
      visible: true,
      title: options.title,
      description: options.description,
      variant: options.variant || 'info',
      actionLabel: options.actionLabel,
      onAction: options.onAction,
      position
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
    isTooltipEnabled,
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
