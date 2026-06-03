import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * uTools 子输入框（subInput）挂载 / 聚焦控制器（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue：ref 内部状态 + useEventListener(window/document) + nextTick。
 * React 版：
 *   - subInputMode / pendingFocusMode 用 useRef 做同步读取的内部状态，并各配一份
 *     useState 镜像供消费者响应式读取（subInputMode 在 UI 中会被订阅）。
 *   - nextTick → queueMicrotask；window/document 监听用 useEffect 注册并卸载清理。
 *   - 入参从 Vue Ref<boolean> 改为 () => boolean 取值函数，调用方传 getter。
 * 无埋点。
 */

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
  isUTools: () => boolean
  canUseSubInput: () => boolean
  getDefaultValue: () => string
  onDefaultInput: (payload: { text: string }) => void
}

const SUB_INPUT_RETRY_DELAYS = [32, 120, 320]
const SUB_INPUT_FOCUS_RECOVERY_DELAYS = [64, 160, 320, 640, 1000]

export function useUToolsSubInputController(options: UseUToolsSubInputControllerOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [subInputMode, setSubInputModeState] = useState<SubInputMode>('none')
  const subInputModeRef = useRef<SubInputMode>('none')
  const setSubInputMode = useCallback((mode: SubInputMode) => {
    subInputModeRef.current = mode
    setSubInputModeState(mode)
  }, [])

  const pendingFocusModeRef = useRef<FocusableSubInputMode | null>(null)
  const subInputSyncToken = useRef(0)
  const subInputRetryTimers = useRef<number[]>([])
  const subInputFocusRecoveryTimers = useRef<number[]>([])

  const clearSubInputRetryTimers = useCallback(() => {
    subInputRetryTimers.current.forEach((timer) => window.clearTimeout(timer))
    subInputRetryTimers.current = []
  }, [])

  const clearSubInputFocusRecoveryTimers = useCallback(() => {
    subInputFocusRecoveryTimers.current.forEach((timer) => window.clearTimeout(timer))
    subInputFocusRecoveryTimers.current = []
  }, [])

  const canFocusSubInputNow = useCallback(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible'
  }, [])

  const queuePendingFocus = useCallback((mode: FocusableSubInputMode) => {
    pendingFocusModeRef.current = mode
  }, [])

  const clearPendingFocus = useCallback(() => {
    pendingFocusModeRef.current = null
  }, [])

  const focusCurrentSubInput = useCallback(() => {
    if (!pendingFocusModeRef.current || !optionsRef.current.isUTools()) return false
    if (!canFocusSubInputNow()) return false
    if (pendingFocusModeRef.current !== subInputModeRef.current) return false
    window.utools?.subInputFocus?.()
    clearSubInputFocusRecoveryTimers()
    clearPendingFocus()
    return true
  }, [canFocusSubInputNow, clearSubInputFocusRecoveryTimers, clearPendingFocus])

  const schedulePendingFocusFlush = useCallback(() => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        focusCurrentSubInput()
      })
    })
  }, [focusCurrentSubInput])

  const scheduleFocusRecovery = useCallback(() => {
    if (!pendingFocusModeRef.current) {
      clearSubInputFocusRecoveryTimers()
      return
    }

    clearSubInputFocusRecoveryTimers()
    SUB_INPUT_FOCUS_RECOVERY_DELAYS.forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (!pendingFocusModeRef.current) return
        schedulePendingFocusFlush()
      }, delay)
      subInputFocusRecoveryTimers.current.push(timer)
    })
  }, [clearSubInputFocusRecoveryTimers, schedulePendingFocusFlush])

  const clearSubInput = useCallback(() => {
    clearSubInputRetryTimers()
    clearSubInputFocusRecoveryTimers()
    clearPendingFocus()
    subInputSyncToken.current += 1
    setSubInputMode('none')
    window.utools?.removeSubInput?.()
  }, [clearSubInputRetryTimers, clearSubInputFocusRecoveryTimers, clearPendingFocus, setSubInputMode])

  const mountSubInput = useCallback(
    (
      mode: FocusableSubInputMode,
      onChange: (payload: { text: string }) => void,
      placeholder: string,
      value: string,
      { focus = false, forceRemount = false }: EnsureDefaultSubInputOptions = {}
    ) => {
      const opts = optionsRef.current
      if (!opts.isUTools()) {
        clearSubInput()
        return false
      }

      if (mode === 'default' && !opts.canUseSubInput()) {
        clearSubInput()
        return false
      }

      if (!forceRemount && subInputModeRef.current === mode) {
        window.utools?.setSubInputValue?.(value)
        if (focus) {
          queuePendingFocus(mode)
          schedulePendingFocusFlush()
          scheduleFocusRecovery()
        }
        return true
      }

      clearSubInputRetryTimers()
      const token = ++subInputSyncToken.current

      const run = () => {
        if (token !== subInputSyncToken.current) return false
        if (mode === 'default' && !opts.canUseSubInput()) return false

        window.utools?.removeSubInput?.()
        const mounted = window.utools?.setSubInput?.(onChange, placeholder, focus) === true
        if (!mounted) return false

        setSubInputMode(mode)
        window.utools?.setSubInputValue?.(value)

        if (focus) {
          queuePendingFocus(mode)
          schedulePendingFocusFlush()
          scheduleFocusRecovery()
        } else if (pendingFocusModeRef.current === mode) {
          clearPendingFocus()
          clearSubInputFocusRecoveryTimers()
        }

        return true
      }

      if (run()) return true

      queueMicrotask(() => {
        requestAnimationFrame(() => {
          SUB_INPUT_RETRY_DELAYS.forEach((delay) => {
            const timer = window.setTimeout(() => {
              const mounted = run()
              if (mounted) clearSubInputRetryTimers()
            }, delay)
            subInputRetryTimers.current.push(timer)
          })
        })
      })

      return false
    },
    [
      clearSubInput,
      clearSubInputRetryTimers,
      clearSubInputFocusRecoveryTimers,
      clearPendingFocus,
      queuePendingFocus,
      schedulePendingFocusFlush,
      scheduleFocusRecovery,
      setSubInputMode
    ]
  )

  const ensureDefaultSubInput = useCallback(
    (settings: EnsureDefaultSubInputOptions = {}) => {
      const opts = optionsRef.current
      return mountSubInput('default', opts.onDefaultInput, '搜索书签...', opts.getDefaultValue(), settings)
    },
    [mountSubInput]
  )

  const activateTemplateSubInput = useCallback(
    ({ placeholder, onChange, focus = true, forceRemount = true }: ActivateTemplateSubInputOptions) =>
      mountSubInput('template', onChange, placeholder, '', { focus, forceRemount }),
    [mountSubInput]
  )

  const focusDefaultSubInput = useCallback(
    (forceRemount = false) => {
      if (!optionsRef.current.canUseSubInput()) return false
      if (subInputModeRef.current !== 'default' || forceRemount) {
        return ensureDefaultSubInput({ focus: true, forceRemount })
      }
      queuePendingFocus('default')
      schedulePendingFocusFlush()
      scheduleFocusRecovery()
      return true
    },
    [ensureDefaultSubInput, queuePendingFocus, schedulePendingFocusFlush, scheduleFocusRecovery]
  )

  const syncDefaultSubInputValue = useCallback((text: string) => {
    if (subInputModeRef.current !== 'default') return false
    return window.utools?.setSubInputValue?.(text) !== false
  }, [])

  // window focus / visibilitychange 监听，等价旧版 useEventListener
  useEffect(() => {
    const onFocus = () => {
      schedulePendingFocusFlush()
      scheduleFocusRecovery()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      schedulePendingFocusFlush()
      scheduleFocusRecovery()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [schedulePendingFocusFlush, scheduleFocusRecovery])

  return {
    subInputMode,
    clearSubInput,
    ensureDefaultSubInput,
    activateTemplateSubInput,
    focusDefaultSubInput,
    syncDefaultSubInputValue
  }
}
