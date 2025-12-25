import { ref, onBeforeUnmount } from 'vue'

/**
 * 检测文字是否溢出（被截断）
 * 支持主动更新和通过 ResizeObserver 自动更新
 */
export function useTextOverflow() {
  const overflowMap = ref<Record<string, boolean>>({})
  const observers = new Map<string, ResizeObserver>()

  // 检查单个元素是否溢出
  const isOverflow = (el: HTMLElement | null): boolean => {
    if (!el) return false
    // 使用 Math.ceil 处理亚像素导致的微小差异
    return Math.ceil(el.scrollWidth) > Math.ceil(el.clientWidth)
  }

  // 更新溢出状态（用于 v-for 场景）
  const updateOverflow = (key: string, el: HTMLElement | null) => {
    if (!el) return
    const overflow = isOverflow(el)
    if (overflowMap.value[key] !== overflow) {
      overflowMap.value[key] = overflow
    }
  }

  // 自动监听元素尺寸变化
  const observeOverflow = (key: string, el: HTMLElement | null) => {
    if (!el) return
    
    // 如果已经有观察者，先断开
    if (observers.has(key)) {
      observers.get(key)?.disconnect()
    }

    const observer = new ResizeObserver(() => {
      updateOverflow(key, el)
    })
    
    observer.observe(el)
    observers.set(key, observer)
    
    // 立即检查一次
    updateOverflow(key, el)
  }

  // 清理所有观察者
  onBeforeUnmount(() => {
    observers.forEach(observer => observer.disconnect())
    observers.clear()
  })

  return {
    overflowMap,
    isOverflow,
    updateOverflow,
    observeOverflow
  }
}
