interface UToolsDbDoc<T = unknown> {
  _id: string
  _rev?: string
  _deleted?: boolean
  data?: T
}

interface UToolsDbResult {
  ok?: boolean
  id?: string
  rev?: string
  error?: unknown
  message?: string
  name?: string
}

interface UToolsDbStorage {
  getItem: (key: string) => unknown
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

interface UToolsDbApi {
  put: <T>(doc: UToolsDbDoc<T>) => UToolsDbResult
  get: <T>(id: string) => UToolsDbDoc<T> | null
  remove: (id: string) => UToolsDbResult
  bulkDocs?: (docs: Array<UToolsDbDoc<unknown>>) => UToolsDbResult[]
  allDocs: <T>(prefix?: string) => Array<UToolsDbDoc<T>>
  postAttachment?: (id: string, data: Uint8Array, type: string) => UToolsDbResult
  getAttachment?: (id: string) => Uint8Array | null
  getAttachmentType?: (id: string) => string | null
  promises?: {
    put?: <T>(doc: UToolsDbDoc<T>) => Promise<UToolsDbResult>
    get?: <T>(id: string) => Promise<UToolsDbDoc<T> | null>
    remove?: (id: string) => Promise<UToolsDbResult>
    allDocs?: <T>(prefix?: string) => Promise<Array<UToolsDbDoc<T>>>
    bulkDocs?: (docs: Array<UToolsDbDoc<unknown>>) => Promise<UToolsDbResult[]>
    postAttachment?: (id: string, data: Uint8Array, type: string) => Promise<UToolsDbResult>
    getAttachment?: (id: string) => Promise<Uint8Array | null>
    getAttachmentType?: (id: string) => Promise<string | null>
  }
}

interface UToolsApi {
  dbStorage?: UToolsDbStorage
  db?: UToolsDbApi
}

export interface HostDoc<T> {
  _id: string
  _rev?: string
  data: T
}

export interface HostWriteDoc<T = unknown> {
  _id: string
  _rev?: string
  _deleted?: boolean
  data?: T
}

const STORAGE_SYNC_CHANNEL = 'goose-marks-storage-sync'

const getUtoolsApi = (): UToolsApi | undefined =>
  typeof window !== 'undefined' ? (window as unknown as { utools?: UToolsApi }).utools : undefined

export const isUToolsDbAvailable = (): boolean => Boolean(getUtoolsApi()?.db)

export const getDbStorage = (): UToolsDbStorage | null => {
  const storage = getUtoolsApi()?.dbStorage
  if (!storage) return null
  if (
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return null
  }
  return storage
}

export const getDoc = <T>(id: string): HostDoc<T> | null => {
  try {
    return (getUtoolsApi()?.db?.get<T>(id) as HostDoc<T> | null | undefined) ?? null
  } catch {
    return null
  }
}

export const getDocAsync = async <T>(id: string, strict = false): Promise<HostDoc<T> | null> => {
  const db = getUtoolsApi()?.db
  if (!db) return null
  try {
    if (db.promises?.get) {
      return (await db.promises.get<T>(id)) as HostDoc<T> | null
    }
    return (db.get<T>(id) as HostDoc<T> | null) ?? null
  } catch (error) {
    if (strict) throw error
    return null
  }
}

export const allDocs = <T>(prefix = ''): Array<HostDoc<T>> => {
  try {
    return (getUtoolsApi()?.db?.allDocs<T>(prefix) as Array<HostDoc<T>> | undefined) ?? []
  } catch {
    return []
  }
}

export const allDocsAsync = async <T>(prefix = '', strict = false): Promise<Array<HostDoc<T>>> => {
  const db = getUtoolsApi()?.db
  if (!db) return []
  try {
    if (db.promises?.allDocs) {
      return (await db.promises.allDocs<T>(prefix)) as Array<HostDoc<T>>
    }
    return db.allDocs<T>(prefix) as Array<HostDoc<T>>
  } catch (error) {
    if (strict) throw error
    return []
  }
}

export const putDoc = <T>(id: string, data: T, rev?: string): UToolsDbResult => {
  const db = getUtoolsApi()?.db
  if (!db) return { ok: false, id, error: 'uTools db unavailable' }
  try {
    return db.put(rev ? { _id: id, _rev: rev, data } : { _id: id, data })
  } catch (error) {
    return { ok: false, id, error }
  }
}

export const putDocWithRetry = <T>(id: string, data: T): UToolsDbResult => {
  const current = getDoc<T>(id)
  let result = putDoc(id, data, current?._rev)
  if (!isFailedResult(result)) return result

  const latest = getDoc<T>(id)
  result = putDoc(id, data, latest?._rev)
  return result
}

const isFailedResult = (result: UToolsDbResult | undefined): boolean =>
  !result || result.ok !== true || Boolean(result.error)

const normalizeWriteDoc = (doc: HostWriteDoc): HostWriteDoc => {
  if (doc._rev !== undefined) return doc
  const { _rev: _ignored, ...rest } = doc
  return rest
}

/**
 * 优先走 uTools 官方 promises.bulkDocs，把多次同步 host 调用合并为一次异步批量写。
 * 老版本没有 promises/bulkDocs 时保留逐条兼容路径。
 * 不替换调用方的 _rev 重试：冲突表示编辑基线已失效，必须交回上层处理。
 */
export const bulkWriteDocs = async (docs: HostWriteDoc[]): Promise<{ ok: boolean; failedIds: string[]; results: UToolsDbResult[] }> => {
  if (docs.length === 0) return { ok: true, failedIds: [], results: [] }
  const db = getUtoolsApi()?.db
  if (!db) return { ok: false, failedIds: docs.map((doc) => doc._id), results: [] }
  const payload = docs.map(normalizeWriteDoc)

  let results: UToolsDbResult[]
  try {
    if (db.promises?.bulkDocs) {
      results = await db.promises.bulkDocs(payload)
    } else if (db.bulkDocs) {
      results = db.bulkDocs(payload)
    } else {
      results = []
      for (const doc of payload) {
        try { results.push(db.put(doc)) }
        catch (error) { results.push({ ok: false, id: doc._id, error }) }
        if (isFailedResult(results.at(-1))) break
      }
    }
  } catch {
    results = []
  }

  const failedIds: string[] = []
  payload.forEach((doc, index) => {
    if (!isFailedResult(results[index])) return
    failedIds.push(doc._id)
  })
  return { ok: failedIds.length === 0, failedIds, results }
}

/**
 * 同步批量写入：仅在 onPluginOut / pagehide / beforeunload 等宿主即将挂起或销毁窗口的退出路径使用，
 * 确保尚未落盘的新增/编辑在渲染进程退出前同步写入 uTools 数据库。
 */
export const bulkWriteDocsSync = (docs: HostWriteDoc[]): { ok: boolean; failedIds: string[]; results: UToolsDbResult[] } => {
  if (docs.length === 0) return { ok: true, failedIds: [], results: [] }
  const db = getUtoolsApi()?.db
  if (!db) return { ok: false, failedIds: docs.map((doc) => doc._id), results: [] }
  const payload = docs.map(normalizeWriteDoc)

  let results: UToolsDbResult[]
  try {
    if (db.bulkDocs) {
      results = db.bulkDocs(payload)
    } else {
      results = []
      for (const doc of payload) {
        try { results.push(db.put(doc)) }
        catch (error) { results.push({ ok: false, id: doc._id, error }) }
        if (isFailedResult(results.at(-1))) break
      }
    }
  } catch {
    results = []
  }

  const failedIds: string[] = []
  payload.forEach((doc, index) => {
    if (!isFailedResult(results[index])) return
    failedIds.push(doc._id)
  })
  return { ok: failedIds.length === 0, failedIds, results }
}

export const removeDoc = (id: string): UToolsDbResult => {
  const db = getUtoolsApi()?.db
  if (!db) return { ok: false, id, error: 'uTools db unavailable' }
  try {
    return db.remove(id)
  } catch (error) {
    return { ok: false, id, error }
  }
}

export const postAttachment = (id: string, data: Uint8Array, type: string): UToolsDbResult => {
  const db = getUtoolsApi()?.db
  if (!db?.postAttachment) return { ok: false, id, error: 'uTools attachment unavailable' }
  try {
    return db.postAttachment(id, data, type)
  } catch (error) {
    return { ok: false, id, error }
  }
}

export const postAttachmentAsync = async (id: string, data: Uint8Array, type: string): Promise<UToolsDbResult> => {
  const db = getUtoolsApi()?.db
  if (!db) return { ok: false, id, error: 'uTools attachment unavailable' }
  try {
    if (db.promises?.postAttachment) {
      return await db.promises.postAttachment(id, data, type)
    }
    if (db.postAttachment) {
      return db.postAttachment(id, data, type)
    }
    return { ok: false, id, error: 'uTools attachment unavailable' }
  } catch (error) {
    return { ok: false, id, error }
  }
}

export const getAttachment = (id: string): Uint8Array | null => {
  try {
    return getUtoolsApi()?.db?.getAttachment?.(id) ?? null
  } catch {
    return null
  }
}

export const getAttachmentAsync = async (id: string): Promise<Uint8Array | null> => {
  const db = getUtoolsApi()?.db
  if (!db) return null
  try {
    if (db.promises?.getAttachment) {
      return (await db.promises.getAttachment(id)) ?? null
    }
    return db.getAttachment?.(id) ?? null
  } catch {
    return null
  }
}

export const getAttachmentType = (id: string): string | null => {
  try {
    return getUtoolsApi()?.db?.getAttachmentType?.(id) ?? null
  } catch {
    return null
  }
}

export const getAttachmentTypeAsync = async (id: string): Promise<string | null> => {
  const db = getUtoolsApi()?.db
  if (!db) return null
  try {
    if (db.promises?.getAttachmentType) {
      return (await db.promises.getAttachmentType(id)) ?? null
    }
    return db.getAttachmentType?.(id) ?? null
  } catch {
    return null
  }
}

const clientId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

let broadcastChannel: BroadcastChannel | null = null
try {
  broadcastChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(STORAGE_SYNC_CHANNEL) : null
} catch {
  broadcastChannel = null
}

if (broadcastChannel && typeof window !== 'undefined') {
  broadcastChannel.onmessage = (event) => {
    const { key, value, source } = event.data ?? {}
    if (source === clientId || typeof key !== 'string') return
    window.dispatchEvent(new CustomEvent('storage-sync', { detail: { key, value } }))
  }
}

export const emitStorageSync = (key: string, value: string | null): void => {
  broadcastChannel?.postMessage({ key, value, source: clientId })
}
