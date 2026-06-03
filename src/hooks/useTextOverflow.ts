import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 检测文字是否溢出（被截断）（React 版）
 * 支持主动更新和通过 ResizeObserver 自动更新。
 * 旧版 Vue overflowMap(ref) + onBeforeUnmount 清理 → useState + useEffect 卸载清理。
 */
export function useTextOverflow() {
  const [overflowMap, setOverflowMap] = useState<Record<string, boolean>>({})
  const observersRef = useRef(new Map<string, ResizeObserver>())

  // 检查单个元素是否溢出
  const isOverflow = useCallback((el: HTMLElement | null): boolean => {
    if (!el) return false
    return Math.ceil(el.scrollWidth) > Math.ceil(el.clientWidth)
  }, [])

  // 更新溢出状态（用于列表场景）
  const updateOverflow = useCallback(
    (key: string, el: HTMLElement | null) => {
      if (!el) return
      const overflow = isOverflow(el)
      setOverflowMap((prev) => (prev[key] === overflow ? prev : { ...prev, [key]: overflow }))
    },
    [isOverflow]
  )

  // 自动监听元素尺寸变化
  const observeOverflow = useCallback(
    (key: string, el: HTMLElement | null) => {
      if (!el) return
      const observers = observersRef.current
      observers.get(key)?.disconnect()

      const observer = new ResizeObserver(() => updateOverflow(key, el))
      observer.observe(el)
      observers.set(key, observer)
      updateOverflow(key, el)
    },
    [updateOverflow]
  )

  // 卸载时清理所有观察者
  useEffect(() => {
    const observers = observersRef.current
    return () => {
      observers.forEach((observer) => observer.disconnect())
      observers.clear()
    }
  }, [])

  return { overflowMap, isOverflow, updateOverflow, observeOverflow }
}
