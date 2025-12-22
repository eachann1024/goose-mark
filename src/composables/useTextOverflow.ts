import { ref } from 'vue'

/**
 * 检测文字是否溢出（被截断）
 * 使用方式：在 mouseenter 时调用 checkOverflow 检查元素
 */
export function useTextOverflow() {
  const overflowMap = ref<Record<string, boolean>>({})

  // 检查单个元素是否溢出
  const isOverflow = (el: HTMLElement | null): boolean => {
    if (!el) return false
    return el.scrollWidth > el.clientWidth
  }

  // 更新溢出状态（用于 v-for 场景）
  const updateOverflow = (key: string, el: HTMLElement | null) => {
    overflowMap.value[key] = isOverflow(el)
  }

  return {
    overflowMap,
    isOverflow,
    updateOverflow
  }
}
