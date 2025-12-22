import { ref } from 'vue'

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

const state = ref<ToastState>({
  visible: false,
  title: '',
  variant: 'info'
})

let timer: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  const showToast = (options: Omit<ToastState, 'visible'>) => {
    if (timer) clearTimeout(timer)
    
    state.value = {
      visible: true,
      title: options.title,
      description: options.description,
      variant: options.variant || 'info',
      actionLabel: options.actionLabel,
      onAction: options.onAction
    }

    const duration = options.duration || 4500
    timer = setTimeout(() => {
      closeToast()
    }, duration)
  }

  const closeToast = () => {
    if (timer) clearTimeout(timer)
    timer = null
    state.value.visible = false
    // Delay clearing data to allow transition out
    setTimeout(() => {
        if (!state.value.visible) {
             state.value.onAction = undefined
        }
    }, 300)
  }

  return {
    toastState: state,
    showToast,
    closeToast
  }
}
