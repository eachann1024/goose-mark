import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { utoolsStorage } from '@/lib/utoolsStorage'

/**
 * Pinia 兼容持久化适配器
 * --------------------------------------------------------------------------
 * 旧版 Vue 应用使用 pinia-plugin-persistedstate，其默认行为：
 *   - 存储 key = store 的 $id（如 'bookmark' / 'settings' / 'stats'）
 *   - 存储值 = 被持久化字段的「裸 JSON 对象」，例如：
 *       { "groups": [...], "bookmarks": [...], "activeGroupId": "g-nav", ... }
 *     （没有 zustand 默认的 { state, version } 外层包裹）
 *
 * 为保证 uTools dbStorage 中已有的用户数据「零迁移、可直接读写」，
 * 这里提供一个 zustand `persist` 中间件用的 PersistStorage：
 *   - 读：把裸对象包装回 zustand 期望的 { state, version: 0 }
 *   - 写：剥掉外层，只把 state 内容以裸 JSON 写回（与 Pinia 完全一致）
 *
 * 同时复用 utoolsStorage（uTools dbStorage 优先，回退 localStorage，
 * 带 BroadcastChannel 跨窗口同步与内存缓存），契约与旧版一致。
 */
export const createPiniaCompatStorage = <S>(): PersistStorage<S> => ({
  getItem: (name): StorageValue<S> | null => {
    const raw = utoolsStorage.getItem(name)
    if (raw == null) return null
    try {
      const parsed = JSON.parse(raw)
      // 兼容两种历史格式：
      // 1) Pinia 裸对象（无 state/version 字段）
      // 2) 极少数情况下已是 zustand 包裹结构
      if (parsed && typeof parsed === 'object' && 'state' in parsed && 'version' in parsed) {
        return parsed as StorageValue<S>
      }
      return { state: parsed as S, version: 0 }
    } catch {
      return null
    }
  },
  setItem: (name, value): void => {
    // 仅写入 state 裸对象，保持与 Pinia 持久化文件格式一致
    utoolsStorage.setItem(name, JSON.stringify(value.state))
  },
  removeItem: (name): void => {
    utoolsStorage.removeItem(name)
  }
})
