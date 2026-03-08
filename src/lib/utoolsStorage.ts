/**
 * uTools 持久化存储适配器 (版本 5 - 智能同步版)
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

const getBrowserLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const getLocalStorageItem = (key: string): string | null => {
  const storage = getBrowserLocalStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const setLocalStorageItem = (key: string, value: string): void => {
  const storage = getBrowserLocalStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {}
}

const removeLocalStorageItem = (key: string): void => {
  const storage = getBrowserLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {}
}

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('goose-marks-storage-sync') : null
const sessionCache = new Map<string, string | null>()

if (bc) {
  bc.onmessage = (event) => {
    const { key, value, source } = event.data
    // 忽略自己发出的消息 (虽然 BroadcastChannel 默认不发给自己，但显式防御更好)
    if (source === window.name || !key) return
    
    // 更新内存缓存，供下一次读取使用
    sessionCache.set(key, value)
    
    // 触发全局事件，让 Store 监听并同步
    window.dispatchEvent(new CustomEvent('storage-sync', { detail: { key, value } }))
  }
}

export const utoolsStorage = {
  getItem(key: string): string | null {
    if (sessionCache.has(key)) return sessionCache.get(key) || null
    
    const utools = getUtoolsApi()
    const value = utools?.dbStorage ? utools.dbStorage.getItem(key) : getLocalStorageItem(key)
    
    sessionCache.set(key, value)
    return value
  },

  setItem(key: string, value: string): void {
    const oldValue = this.getItem(key)
    if (oldValue === value) return // 内容未变，不执行写入和广播，有效防止循环

    sessionCache.set(key, value)

    const utools = getUtoolsApi()
    if (utools?.dbStorage) {
      utools.dbStorage.setItem(key, value)
      removeLocalStorageItem(key)
    } else {
      setLocalStorageItem(key, value)
    }

    if (bc) {
      bc.postMessage({ key, value, source: window.name })
    }
  },

  removeItem(key: string): void {
    sessionCache.delete(key)
    const utools = getUtoolsApi()
    if (utools?.dbStorage) {
      utools.dbStorage.removeItem(key)
    }
    removeLocalStorageItem(key)
    
    if (bc) {
      bc.postMessage({ key, value: null, source: window.name })
    }
  },

  flushItem(key: string): void {}
}

export const getPersistentItem = (key: string, legacyKeys: string[] = []): string | null => {
  const current = utoolsStorage.getItem(key)
  if (current !== null) return current

  const candidates = [key, ...legacyKeys.filter(legacyKey => legacyKey !== key)]
  for (const candidateKey of candidates) {
    const legacyValue = getLocalStorageItem(candidateKey)
    if (legacyValue === null) continue
    utoolsStorage.setItem(key, legacyValue)
    if (candidateKey !== key) {
      removeLocalStorageItem(candidateKey)
    }
    return legacyValue
  }

  return null
}

export const removePersistentItem = (key: string, legacyKeys: string[] = []): void => {
  utoolsStorage.removeItem(key)
  legacyKeys.forEach(removeLocalStorageItem)
}
