import type { Ref } from 'vue'

type SubInputMode = 'none' | 'default' | 'template'
type FocusableSubInputMode = Exclude<SubInputMode, 'none'>

type EnsureDefaultSubInputOptions = {
  focus?: boolean
  forceRemount?: boolean
}

type ActivateTemplateSubInputOptions = {
  placeholder: string
  onChange: (payload: { text: string }) => void
  focus?: boolean
  forceRemount?: boolean
}

type UseUToolsSubInputControllerOptions = {
  isUTools: Ref<boolean>
  canUseSubInput: Ref<boolean>
  getDefaultValue: () => string
  onDefaultInput: (payload: { text: string }) => void
}

const SUB_INPUT_RETRY_DELAYS = [32, 120, 320]
const SUB_INPUT_FOCUS_RECOVERY_DELAYS = [64, 160, 320, 640, 1000]

export function useUToolsSubInputController(options: UseUToolsSubInputControllerOptions) {
  const subInputMode = ref<SubInputMode>('none')
  const pendingFocusMode = ref<FocusableSubInputMode | null>(null)
  let subInputSyncToken = 0
  let subInputRetryTimers: number[] = []
  let subInputFocusRecoveryTimers: number[] = []

  const clearSubInputRetryTimers = () => {
    subInputRetryTimers.forEach(timer => window.clearTimeout(timer))
    subInputRetryTimers = []
  }

  const clearSubInputFocusRecoveryTimers = () => {
    subInputFocusRecoveryTimers.forEach(timer => window.clearTimeout(timer))
    subInputFocusRecoveryTimers = []
  }

  const canFocusSubInputNow = () => {
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible'
  }

  const queuePendingFocus = (mode: FocusableSubInputMode) => {
    pendingFocusMode.value = mode
  }

  const clearPendingFocus = () => {
    pendingFocusMode.value = null
  }

  const focusCurrentSubInput = () => {
    if (!pendingFocusMode.value || !options.isUTools.value) return false
    if (!canFocusSubInputNow()) return false
    if (pendingFocusMode.value !== subInputMode.value) return false
    const focused = window.utools?.subInputFocus?.()
    if (focused === false) return false
    clearSubInputFocusRecoveryTimers()
    clearPendingFocus()
    return true
  }

  const schedulePendingFocusFlush = () => {
    nextTick(() => {
      requestAnimationFrame(() => {
        focusCurrentSubInput()
      })
    })
  }

  const scheduleFocusRecovery = () => {
    if (!pendingFocusMode.value) {
      clearSubInputFocusRecoveryTimers()
      return
    }

    clearSubInputFocusRecoveryTimers()
    SUB_INPUT_FOCUS_RECOVERY_DELAYS.forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (!pendingFocusMode.value) return
        schedulePendingFocusFlush()
      }, delay)
      subInputFocusRecoveryTimers.push(timer)
    })
  }

  const clearSubInput = () => {
    clearSubInputRetryTimers()
    clearSubInputFocusRecoveryTimers()
    clearPendingFocus()
    subInputSyncToken += 1
    subInputMode.value = 'none'
    window.utools?.removeSubInput?.()
  }

  const mountSubInput = (
    mode: FocusableSubInputMode,
    onChange: (payload: { text: string }) => void,
    placeholder: string,
    value: string,
    { focus = false, forceRemount = false }: EnsureDefaultSubInputOptions = {}
  ) => {
    if (!options.isUTools.value) {
      clearSubInput()
      return false
    }

    if (mode === 'default' && !options.canUseSubInput.value) {
      clearSubInput()
      return false
    }

    if (!forceRemount && subInputMode.value === mode) {
      window.utools?.setSubInputValue?.(value)
      if (focus) {
        queuePendingFocus(mode)
        schedulePendingFocusFlush()
        scheduleFocusRecovery()
      }
      return true
    }

    clearSubInputRetryTimers()
    const token = ++subInputSyncToken

    const run = () => {
      if (token !== subInputSyncToken) return false
      if (mode === 'default' && !options.canUseSubInput.value) return false

      window.utools?.removeSubInput?.()
      const mounted = window.utools?.setSubInput?.(onChange, placeholder, focus) === true
      if (!mounted) return false

      subInputMode.value = mode
      window.utools?.setSubInputValue?.(value)

      if (focus) {
        queuePendingFocus(mode)
        schedulePendingFocusFlush()
        scheduleFocusRecovery()
      } else if (pendingFocusMode.value === mode) {
        clearPendingFocus()
        clearSubInputFocusRecoveryTimers()
      }

      return true
    }

    if (run()) {
      return true
    }

    nextTick(() => {
      requestAnimationFrame(() => {
        SUB_INPUT_RETRY_DELAYS.forEach((delay) => {
          const timer = window.setTimeout(() => {
            const mounted = run()
            if (mounted) {
              clearSubInputRetryTimers()
            }
          }, delay)
          subInputRetryTimers.push(timer)
        })
      })
    })

    return false
  }

  const ensureDefaultSubInput = (settings: EnsureDefaultSubInputOptions = {}) => {
    return mountSubInput(
      'default',
      options.onDefaultInput,
      '搜索书签...',
      options.getDefaultValue(),
      settings
    )
  }

  const activateTemplateSubInput = ({
    placeholder,
    onChange,
    focus = true,
    forceRemount = true,
  }: ActivateTemplateSubInputOptions) => {
    return mountSubInput('template', onChange, placeholder, '', { focus, forceRemount })
  }

  const focusDefaultSubInput = (forceRemount = false) => {
    if (!options.canUseSubInput.value) return false
    if (subInputMode.value !== 'default' || forceRemount) {
      return ensureDefaultSubInput({ focus: true, forceRemount })
    }
    queuePendingFocus('default')
    schedulePendingFocusFlush()
    scheduleFocusRecovery()
    return true
  }

  const syncDefaultSubInputValue = (text: string) => {
    if (subInputMode.value !== 'default') return false
    return window.utools?.setSubInputValue?.(text) !== false
  }

  useEventListener(window, 'focus', () => {
    schedulePendingFocusFlush()
    scheduleFocusRecovery()
  })

  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    schedulePendingFocusFlush()
    scheduleFocusRecovery()
  })

  return {
    subInputMode,
    clearSubInput,
    ensureDefaultSubInput,
    activateTemplateSubInput,
    focusDefaultSubInput,
    syncDefaultSubInputValue,
  }
}
