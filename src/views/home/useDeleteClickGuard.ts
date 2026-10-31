import { useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'

/** 行被删除后下一行可能移动到同一位置，拦截同一次双击的后续点击。 */
export function useDeleteClickGuard() {
  const last = useRef<{ x: number; y: number; time: number } | null>(null)
  return useCallback((event: MouseEvent) => {
    if (event.detail === 0) return true // 键盘或辅助技术触发
    const now = Date.now()
    const previous = last.current
    if (event.detail > 1 || (previous && now - previous.time < 500 && Math.abs(event.clientX - previous.x) < 5 && Math.abs(event.clientY - previous.y) < 5)) return false
    last.current = { x: event.clientX, y: event.clientY, time: now }
    return true
  }, [])
}
