import { jsonValue, portableLibrary, prepareFolder, readSource, type Source, type SourceRead } from './folder'
import type { Snapshot } from './files'
import type { Connection } from './runtime-types'
import { sourceAction } from './status'

export type MigrationRuntime = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  active: (source: Connection) => boolean
  stamp: () => string
  snapshot: () => Snapshot
  connect: (target: Source, remote: SourceRead) => Promise<boolean>
  source: () => Connection | undefined
  baseline: () => SourceRead | undefined
}

export function createLegacyMigration(runtime: MigrationRuntime) {
  return async function migrateLegacySource() {
    const source = runtime.source()
    if (!source || source.mode !== 'legacy') return false
    return sourceAction(() => runtime.enqueue(async () => {
      if (!runtime.active(source)) throw new Error('旧 JSON 连接已暂停，请先重新连接，或从当前本地缓存新建文件夹')
      const stamp = runtime.stamp()
      const snapshot = runtime.snapshot()
      const expected = runtime.baseline()
      if (!expected) throw new Error('旧 JSON 基线缺失，请重新连接后迁移')
      const baseline = await readSource(source)
      if (baseline.digest !== expected.digest) throw new Error('旧 JSON 已变化，迁移已取消；请重新连接后重试')
      const prepared = await prepareFolder(snapshot)
      if (!runtime.active(source) || runtime.stamp() !== stamp) throw new Error('迁移期间本地数据发生变化，请重试')
      const selected = await window.utools?.showOpenDialog?.({ title: '选择空的新数据文件夹', properties: ['openDirectory', 'createDirectory'] })
      if (!selected?.[0]) return false
      const target: Source = { path: selected[0], mode: 'folder' }
      if (!runtime.active(source) || runtime.stamp() !== stamp || (await readSource(source)).digest !== expected.digest) {
        throw new Error('迁移期间数据已变化，未切换连接，请重试')
      }
      await portableLibrary().createFolder(target.path, prepared, { settings: jsonValue(snapshot.settings) })
      const remote = await readSource(target)
      if (remote.bookmarks !== prepared.bookmarksDigest || (await readSource(source)).digest !== expected.digest || runtime.stamp() !== stamp || !runtime.active(source)) {
        throw new Error('迁移文件夹已保留，数据在创建期间发生变化，未切换连接，请检查后重试')
      }
      return runtime.connect(target, remote)
    }))
  }
}
