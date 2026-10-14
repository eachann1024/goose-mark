import { flushBookmarkStorePersistence, useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { saveBookmarkSnapshot, saveSettingsSnapshot } from '@/lib/stateRepository'
import { currentFileSettings } from './settings'

export async function preserveLocalData() {
  const snapshot = () => {
    const state = useBookmarkStore.getState()
    return structuredClone({ groups: state.groups, bookmarks: state.bookmarks,
      activeGroupId: state.activeGroupId, activeSubGroupId: state.activeSubGroupId })
  }
  const settings = () => ({ ...currentFileSettings(), localMirrorDirectory: useSettingsStore.getState().localMirrorDirectory })
  const bookmarks = snapshot()
  const preferences = settings()
  const stamp = JSON.stringify({ bookmarks, preferences })
  await flushBookmarkStorePersistence()
  // 使用会抛出写入错误的仓储接口；保存成功之后才能持久化停用标记。
  await saveBookmarkSnapshot(bookmarks)
  saveSettingsSnapshot(preferences)
  if (JSON.stringify({ bookmarks: snapshot(), preferences: settings() }) !== stamp) {
    throw new Error('保存期间当前数据发生变化，连接尚未移除，请重试')
  }
}
