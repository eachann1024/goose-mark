import { useBookmarkStore } from '@/stores/bookmark'
import { setSettingsFileReadOnly } from '@/stores/settings'
import { utoolsStorage } from '@/lib/utoolsStorage'
import { readSource, type Source, type SourceRead } from './folder'
import { SOURCE_PATH_KEY } from './source-actions'
import { sourceAction, useSharedJsonStatus } from './status'
import { startupSource } from './startup'

type InitializationRuntime = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  stamp: () => string
  connected: () => boolean
  paused: () => boolean
  connect: (source: Source, remote: SourceRead) => Promise<boolean>
  useLocal: () => void
}

export function createSourceInitialization(runtime: InitializationRuntime) {
  return () => sourceAction(() => runtime.enqueue(async () => {
    if (runtime.connected() && !runtime.paused()) return false
    const savedPath = utoolsStorage.getItem(SOURCE_PATH_KEY)
    if (!savedPath) {
      runtime.useLocal()
      return false
    }
    if (useSharedJsonStatus.getState().phase === 'paused' &&
      !window.confirm('重新连接将以数据源替换当前缓存，未同步的本地修改会被丢弃。建议先导出备份。确定重新连接？')) return false
    const stamp = runtime.stamp()
    let target: Source | undefined
    try {
      target = await startupSource(savedPath)
      const remote = await readSource(target)
      if ((await readSource(target)).digest !== remote.digest) throw new Error('初始化期间数据源发生变化')
      if (runtime.stamp() !== stamp) throw new Error('初始化期间本地数据发生变化，已保留当前编辑，请重新连接')
      // All reads finish before switching the connection; connect owns rollback and persistence.
      return await runtime.connect(target, remote)
    } catch (error) {
      const message = error instanceof Error ? error.message : '数据源不可用'
      if (!runtime.connected()) {
        setSettingsFileReadOnly(true)
        useBookmarkStore.getState().setReadOnly(true)
        useSharedJsonStatus.setState({ phase: 'paused', sourceMode: target?.mode ?? null, path: savedPath, error: message })
      }
      window.alert(`文件同步不可用：${message}`)
      return false
    }
  }))
}
