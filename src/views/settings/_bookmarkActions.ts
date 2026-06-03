import { useBookmarkStore } from '@/stores/bookmark'
import type { Group, Bookmark } from '@/types/bookmark'

/**
 * 书签 store 的“重业务动作”桥接（settings 模块用）
 * --------------------------------------------------------------------------
 * 背景：第 2 阶段的 React 书签 store（src/stores/bookmark.ts）仅迁移了状态形状、
 * 选择动作与种子/迁移逻辑；分组增删改、排序、跨分组移动、回收站、图标补全等
 * 重业务动作以 TODO[业务阶段] 标记，尚未落地。
 *
 * settings 模块的 CategoryManager / DataSettings / ToolsSettings 需要这些动作。
 * 为保证“功能等价重写 + 类型自查通过 + 集成阶段零改动接入”，这里声明与旧版
 * Pinia store 完全一致的方法契约，并在运行时从 live store 上解析对应方法：
 *   - 一旦业务阶段把这些方法补进 store，本桥接会自动透传，无需改动设置页；
 *   - 在方法尚未补齐时，调用会安全降级（返回兜底值并 console.warn），
 *     不会抛错破坏 UI。
 *
 * 契约（与旧版 Pinia 'bookmark' store 同名同签名）：
 */
export interface BookmarkMutations {
  // 分组管理
  addGroup: (name: string) => void
  updateGroup: (groupId: string, name: string) => void
  removeGroup: (groupId: string) => boolean
  reorderGroups: (groups: Group[]) => void
  // 子分组管理
  addSubGroup: (name: string, groupId: string) => void
  updateSubGroup: (groupId: string, subId: string, name: string) => void
  removeSubGroup: (groupId: string, subId: string) => boolean
  reorderSubGroups: (groupId: string, subGroups: Group['children']) => void
  moveSubToGroup: (fromGroupId: string, subId: string, toGroupId: string) => void
  promoteSubToGroup: (fromGroupId: string, subId: string) => void
  // 共享实体同步
  syncAllSharedEntities: () => void
  // 图标补全
  countMissingIconCandidates: (forceRematch: boolean) => number
  refreshMissingIcons: (forceRematch?: boolean) => Promise<{
    matched: number
    total: number
    remaining: number
    failList: Array<{ title: string }>
  }>
  // Pinia 兼容 $patch（DataSettings 清空操作使用）
  $patch: (partial: Record<string, unknown>) => void
}

/**
 * BookmarkStoreLike 适配器（供 useImportExport.applyImportDataToStore 使用）
 * --------------------------------------------------------------------------
 * applyImportDataToStore 期望一个含 groups/bookmarks/activeGroupId/activeSubGroupId
 * 以及 setData / selectGroup 的对象（旧 Pinia $patch 已被改造为 setData）。
 * 这里基于 live Zustand store 的当前快照构造可变工作副本，导入函数会就地改写
 * 或通过 setData 替换；调用结束后用 commit() 把结果写回 store。
 */
export interface BookmarkStoreLike {
  groups: Group[]
  bookmarks: Bookmark[]
  activeGroupId: string
  activeSubGroupId: string
  setData: (
    state: Partial<{
      groups: Group[]
      bookmarks: Bookmark[]
      activeGroupId: string
      activeSubGroupId: string
    }>
  ) => void
  selectGroup: (groupId: string, subId?: string) => void
}

export function createBookmarkStoreAdapter(): {
  adapter: BookmarkStoreLike
  commit: () => void
} {
  const snapshot = useBookmarkStore.getState()
  const adapter: BookmarkStoreLike = {
    groups: [...snapshot.groups],
    bookmarks: [...snapshot.bookmarks],
    activeGroupId: snapshot.activeGroupId,
    activeSubGroupId: snapshot.activeSubGroupId,
    setData: (state) => {
      if (state.groups) adapter.groups = state.groups
      if (state.bookmarks) adapter.bookmarks = state.bookmarks
      if (typeof state.activeGroupId === 'string')
        adapter.activeGroupId = state.activeGroupId
      if (typeof state.activeSubGroupId === 'string')
        adapter.activeSubGroupId = state.activeSubGroupId
    },
    selectGroup: (groupId, subId) => {
      adapter.activeGroupId = groupId
      if (typeof subId === 'string') adapter.activeSubGroupId = subId
    }
  }
  const commit = () => {
    useBookmarkStore.setState({
      groups: [...adapter.groups],
      bookmarks: [...adapter.bookmarks],
      activeGroupId: adapter.activeGroupId,
      activeSubGroupId: adapter.activeSubGroupId
    })
  }
  return { adapter, commit }
}

type StoreShape = Record<string, unknown>

const resolve = <K extends keyof BookmarkMutations>(
  name: K
): BookmarkMutations[K] | undefined => {
  const store = useBookmarkStore.getState() as unknown as StoreShape
  const fn = store[name as string]
  return typeof fn === 'function'
    ? (fn as BookmarkMutations[K])
    : undefined
}

const warnMissing = (name: string) => {
  console.warn(
    `[settings] useBookmarkStore.${name} 尚未在 React store 中实现（业务阶段补齐）。`
  )
}

/**
 * 取得书签变更动作集合。集成阶段当 store 补齐这些方法后，直接透传。
 */
export function getBookmarkMutations(): BookmarkMutations {
  return {
    addGroup: (name) => resolve('addGroup')?.(name) ?? warnMissing('addGroup'),
    updateGroup: (groupId, name) =>
      resolve('updateGroup')?.(groupId, name) ?? warnMissing('updateGroup'),
    removeGroup: (groupId) => {
      const fn = resolve('removeGroup')
      if (!fn) {
        warnMissing('removeGroup')
        return false
      }
      return fn(groupId)
    },
    reorderGroups: (groups) =>
      resolve('reorderGroups')?.(groups) ?? warnMissing('reorderGroups'),
    addSubGroup: (name, groupId) =>
      resolve('addSubGroup')?.(name, groupId) ?? warnMissing('addSubGroup'),
    updateSubGroup: (groupId, subId, name) =>
      resolve('updateSubGroup')?.(groupId, subId, name) ??
      warnMissing('updateSubGroup'),
    removeSubGroup: (groupId, subId) => {
      const fn = resolve('removeSubGroup')
      if (!fn) {
        warnMissing('removeSubGroup')
        return false
      }
      return fn(groupId, subId)
    },
    reorderSubGroups: (groupId, subGroups) =>
      resolve('reorderSubGroups')?.(groupId, subGroups) ??
      warnMissing('reorderSubGroups'),
    moveSubToGroup: (fromGroupId, subId, toGroupId) =>
      resolve('moveSubToGroup')?.(fromGroupId, subId, toGroupId) ??
      warnMissing('moveSubToGroup'),
    promoteSubToGroup: (fromGroupId, subId) =>
      resolve('promoteSubToGroup')?.(fromGroupId, subId) ??
      warnMissing('promoteSubToGroup'),
    syncAllSharedEntities: () =>
      resolve('syncAllSharedEntities')?.() ??
      warnMissing('syncAllSharedEntities'),
    countMissingIconCandidates: (forceRematch) => {
      const fn = resolve('countMissingIconCandidates')
      if (!fn) {
        warnMissing('countMissingIconCandidates')
        return 0
      }
      return fn(forceRematch)
    },
    refreshMissingIcons: async (forceRematch) => {
      const fn = resolve('refreshMissingIcons')
      if (!fn) {
        warnMissing('refreshMissingIcons')
        return { matched: 0, total: 0, remaining: 0, failList: [] }
      }
      return fn(forceRematch)
    },
    $patch: (partial) => {
      const fn = resolve('$patch')
      if (fn) {
        fn(partial)
        return
      }
      // 退化：直接 setState 合并（Zustand）。$patch 写入的是顶层 store 字段
      // （groups/bookmarks/search/activeGroupId/activeSubGroupId），与 Pinia 一致。
      useBookmarkStore.setState(
        partial as Partial<ReturnType<typeof useBookmarkStore.getState>>
      )
    }
  }
}
