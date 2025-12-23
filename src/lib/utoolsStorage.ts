/**
 * uTools 持久化存储适配器
 * 用于 pinia-plugin-persistedstate
 */

interface UToolsDbStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

interface UToolsApi {
  dbStorage?: UToolsDbStorage
}

const getUtoolsApi = (): UToolsApi | undefined => {
  return typeof window !== 'undefined' ? (window as unknown as { utools?: UToolsApi }).utools : undefined
}

// 防抖写入，避免拖拽时频繁持久化导致卡顿
const pendingWrites = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>()
const DEBOUNCE_MS = 300

const flushWrite = (key: string, value: string) => {
  const utools = getUtoolsApi()
  if (utools?.dbStorage) {
    utools.dbStorage.setItem(key, value)
  } else {
    localStorage.setItem(key, value)
  }
}

export const utoolsStorage = {
  getItem(key: string): string | null {
    // 如果有待写入的值，先返回它
    const pending = pendingWrites.get(key)
    if (pending) return pending.value
    
    const utools = getUtoolsApi()
    if (utools?.dbStorage) {
      return utools.dbStorage.getItem(key)
    }
    return localStorage.getItem(key)
  },
  setItem(key: string, value: string): void {
    // 清除之前的定时器
    const existing = pendingWrites.get(key)
    if (existing) clearTimeout(existing.timer)
    
    // 设置新的防抖定时器
    const timer = setTimeout(() => {
      pendingWrites.delete(key)
      flushWrite(key, value)
    }, DEBOUNCE_MS)
    
    pendingWrites.set(key, { value, timer })
  },
  // 立即保存，不使用防抖（用于关键操作，如分享导入）
  flushItem(key: string): void {
    const pending = pendingWrites.get(key)
    if (pending) {
      clearTimeout(pending.timer)
      pendingWrites.delete(key)
      flushWrite(key, pending.value)
    }
  },
  removeItem(key: string): void {
    // 清除待写入
    const existing = pendingWrites.get(key)
    if (existing) {
      clearTimeout(existing.timer)
      pendingWrites.delete(key)
    }
    
    const utools = getUtoolsApi()
    if (utools?.dbStorage) {
      utools.dbStorage.removeItem(key)
    } else {
      localStorage.removeItem(key)
    }
  }
}

