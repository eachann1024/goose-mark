import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { utoolsStorage } from '@/lib/utoolsStorage'

/**
 * Pinia 兼容持久化适配器
 * --------------------------------------------------------------------------
 * 旧版 Vue 应用使用 pinia-plugin-persistedstate，其默认行为：
 *   - 存储 key = store 的 $id（如 'bookmark' / 'settings' / 'stats'）
 *   - 存储值 = 被持久化字段的「裸 JSON 对象」
 *     （没有 zustand 默认的 { state, version } 外层包裹）
 *
 * 水合安全：zustand persist 在 getItem 完成前会用种子 state 触发 setItem，
 * 若不做拦截会把演示种子数据写进 dbStorage，覆盖用户真实书签（重启后丢失）。
 * 因此在首次 getItem 完成前，setItem / removeItem 一律 no-op。
 */
export const createPiniaCompatStorage = <S>(): PersistStorage<S> => {
  let hasHydrated = false

  return {
    getItem: (name): StorageValue<S> | null => {
      try {
        const raw = utoolsStorage.getItem(name)
        if (raw == null) return null
        let parsed = JSON.parse(raw)
        // uTools dbStorage 历史数据可能双重 JSON 编码（旧版对已是 JSON 字符串的值再 stringify 一次）。
        // 解一层后若仍是字符串，再解一层，避免 state 拿到字符串 → groups/bookmarks 读空回退种子。
        // setItem 单层写入，重新保存后自愈。详见 memory utools-dbstorage-double-encoded。
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed) } catch { /* 非双层编码，保持原值 */ }
        }
        if (parsed && typeof parsed === 'object' && 'state' in parsed && 'version' in parsed) {
          return parsed as StorageValue<S>
        }
        return { state: parsed as S, version: 0 }
      } catch {
        return null
      } finally {
        hasHydrated = true
      }
    },
    setItem: (name, value): void => {
      if (!hasHydrated) return
      utoolsStorage.setItem(name, JSON.stringify(value.state))
    },
    removeItem: (name): void => {
      if (!hasHydrated) return
      utoolsStorage.removeItem(name)
    }
  }
}