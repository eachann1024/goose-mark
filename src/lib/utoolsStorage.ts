/**
 * uTools 持久化存储适配器 (版本 6 - 水合安全 + 双端回退)
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

/**
 * 从 dbStorage 读取；若为空则回退 localStorage 并自动迁移到 dbStorage。
 * 修复历史上「写入落在 localStorage、重启后只读 dbStorage」导致书签丢失的问题。
 */
const readPersistedValue = (key: string): string | null => {
  const utools = getUtoolsApi()
  if (utools?.dbStorage) {
    let dbValue: string | null = null
    try {
      dbValue = utools.dbStorage.getItem(key)
    } catch {
      dbValue = null
    }
    if (dbValue !== null && dbValue !== undefined) return dbValue

    const legacy = getLocalStorageItem(key)
    if (legacy === null) return null

    try {
      utools.dbStorage.setItem(key, legacy)
      removeLocalStorageItem(key)
    } catch {
      // 迁移失败仍返回 legacy，至少本次会话可读
    }
    return legacy
  }

  return getLocalStorageItem(key)
}

// 模块加载时生成一次性随机 clientId，避免多窗口 window.name 都为 '' 时跨窗口同步失效
const _clientId: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

let bc: BroadcastChannel | null = null
try {
  bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('goose-marks-storage-sync') : null
} catch {
  bc = null
}

const sessionCache = new Map<string, string | null>()

if (bc) {
  bc.onmessage = (event) => {
    const { key, value, source } = event.data
    if (source === _clientId || !key) return

    sessionCache.set(key, value)

    window.dispatchEvent(new CustomEvent('storage-sync', { detail: { key, value } }))
  }
}

export const utoolsStorage = {
  getItem(key: string): string | null {
    if (sessionCache.has(key)) return sessionCache.get(key) ?? null

    const value = readPersistedValue(key)
    sessionCache.set(key, value)
    return value
  },

  setItem(key: string, value: string): void {
    const oldValue = this.getItem(key)
    if (oldValue === value) return

    sessionCache.set(key, value)

    const utools = getUtoolsApi()
    if (utools?.dbStorage) {
      try {
        utools.dbStorage.setItem(key, value)
      } catch (error) {
        console.warn('[utoolsStorage] dbStorage.setItem 失败，回退 localStorage:', error)
        setLocalStorageItem(key, value)
      }
      removeLocalStorageItem(key)
    } else {
      setLocalStorageItem(key, value)
    }

    if (bc) {
      bc.postMessage({ key, value, source: _clientId })
    }
  },

  removeItem(key: string): void {
    sessionCache.delete(key)
    const utools = getUtoolsApi()
    if (utools?.dbStorage) {
      try {
        utools.dbStorage.removeItem(key)
      } catch {}
    }
    removeLocalStorageItem(key)

    if (bc) {
      bc.postMessage({ key, value: null, source: _clientId })
    }
  },

  /** 清除内存缓存，下次 getItem 强制从底层存储重读 */
  flushItem(key: string): void {
    sessionCache.delete(key)
  }
}

export const getPersistentItem = (key: string, legacyKeys: string[] = []): string | null => {
  const current = utoolsStorage.getItem(key)
  if (current !== null) return current

  const candidates = [key, ...legacyKeys.filter((legacyKey) => legacyKey !== key)]
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