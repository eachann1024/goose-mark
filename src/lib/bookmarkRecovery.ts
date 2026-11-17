import type { BookmarkSnapshot } from './stateRepository'

// 仅本机的原格式 JSON。副本从不自动加载进当前账号；恢复必须由用户显式导入。
const PREFIX = 'goose-marks.bookmark-recovery.'
const sessionId = crypto.randomUUID()
const pendingKey = `${PREFIX}pending.${sessionId}`
const CHECKPOINT_PREFIX = `${PREFIX}checkpoint-v2.`
const CHECKPOINT_LIMIT = 16
const CHECKPOINT_BYTES = 256 * 1024 * 1024
const CHECKPOINT_DEBOUNCE_MS = 800
let lastConflictContent: string | undefined
let lastCheckpointHash: string | undefined
let scheduledCheckpointSnapshot: BookmarkSnapshot | null = null
let scheduledCheckpointTimer: ReturnType<typeof setTimeout> | null = null
let checkpointWriteChain: Promise<void> = Promise.resolve()

const stripUsageForHash = (bookmarks: BookmarkSnapshot['bookmarks']) =>
  [...bookmarks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ visits: _visits, lastUsed: _lastUsed, ...rest }) => rest)

function nativeDirectory() {
  if (!window.require) return null
  const fs = window.require('node:fs') as typeof import('node:fs')
  const path = window.require('node:path') as typeof import('node:path')
  let root: string | undefined
  try { root = window.utools?.getPluginLocalDataPath?.() } catch { /* 兼容旧宿主 */ }
  if (!root) {
    const home = window.utools?.getPath('home')
    if (!home) return null
    root = path.join(home, '.goose-marks')
  }
  return { fs, path, directory: path.join(root, 'bookmark-recovery') }
}

export function preserveBookmarkRecovery(snapshot: BookmarkSnapshot, kind: 'pending' | 'checkpoint' | 'conflict' = 'pending'): void {
  const content = kind !== 'pending' ? JSON.stringify([snapshot.groups, stripUsageForHash(snapshot.bookmarks)]) : undefined
  if (kind === 'conflict' && content === lastConflictContent) return
  let key = kind === 'pending' ? pendingKey : kind === 'checkpoint'
    ? `${CHECKPOINT_PREFIX}${Date.now()}.${sessionId}`
    : `${PREFIX}conflict.${Date.now()}.${crypto.randomUUID()}`
  let contentHash: string | undefined
  try {
    const native = nativeDirectory()
    if (native) {
      // 已确认快照和冲突副本按内容命名，反复启动或往返同步不会无限复制同一份数据。
      if (kind !== 'pending') {
        contentHash = (window.require!('node:crypto') as typeof import('node:crypto')).createHash('sha256').update(content!).digest('hex')
        if (kind === 'checkpoint' && contentHash === lastCheckpointHash) return
        key = `${PREFIX}${kind}.${contentHash}`
      }
      // 只轮换本版本新建的已确认 checkpoint，旧文件、pending 和真实冲突副本不参与清理。
      const directory = kind === 'checkpoint' ? native.path.join(native.directory, 'checkpoints') : native.directory
      native.fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const file = native.path.join(directory, `${key}.json`)
      if (kind !== 'pending' && native.fs.existsSync(file)) {
        if (kind === 'checkpoint') lastCheckpointHash = contentHash
        if (kind === 'conflict') lastConflictContent = content
        return
      }
      const raw = JSON.stringify(snapshot)
      const temporary = `${file}.${crypto.randomUUID()}.tmp`
      try {
        const fd = native.fs.openSync(temporary, 'wx', 0o600)
        try {
          native.fs.writeFileSync(fd, raw, 'utf8')
          native.fs.fsyncSync(fd)
        } finally { native.fs.closeSync(fd) }
        native.fs.renameSync(temporary, file)
      } finally {
        if (native.fs.existsSync(temporary)) native.fs.unlinkSync(temporary)
      }
      if (kind === 'checkpoint') {
        lastCheckpointHash = contentHash
        try {
          const files = native.fs.readdirSync(directory).filter(name => /^goose-marks\.bookmark-recovery\.checkpoint\.[a-f0-9]{64}\.json$/.test(name)).map(name => {
            const target = native.path.join(directory, name)
            return { target, stat: native.fs.lstatSync(target) }
          }).filter(entry => entry.stat.isFile()).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs || a.target.localeCompare(b.target))
          let bytes = files.reduce((total, entry) => total + entry.stat.size, 0), count = files.length
          for (const entry of files) {
            if (count <= CHECKPOINT_LIMIT && (bytes <= CHECKPOINT_BYTES || count <= 2)) break
            if (entry.target === file) continue
            const current = native.fs.lstatSync(entry.target)
            if (current.ino !== entry.stat.ino || current.mtimeMs !== entry.stat.mtimeMs) continue
            native.fs.unlinkSync(entry.target)
            bytes -= entry.stat.size; count--
          }
        } catch (error) { console.warn('[bookmark] 已保存，本机历史快照暂未轮换:', error) }
      }
      try { window.localStorage.removeItem(key) } catch { /* 原生副本已落盘；旧副本不自动恢复。 */ }
      if (kind === 'conflict') lastConflictContent = content
      return
    }
  } catch (error) { console.warn('[bookmark] 原生恢复副本写入失败，尝试 Web Storage:', error) }
  const raw = JSON.stringify(snapshot)
  if (kind !== 'pending' && Object.keys(window.localStorage).some(existing => existing.startsWith(kind === 'checkpoint' ? CHECKPOINT_PREFIX : `${PREFIX}${kind}.`) && window.localStorage.getItem(existing) === raw)) {
    if (kind === 'conflict') lastConflictContent = content
    return
  }
  if (kind === 'checkpoint') key = `${CHECKPOINT_PREFIX}${Date.now()}.${sessionId}`
  // 空间不足时只淘汰本版本已确认的历史快照，绝不删除待保存、冲突或旧版副本。
  const replaceable = Object.keys(window.localStorage).filter(existing => existing.startsWith(CHECKPOINT_PREFIX) && existing !== key).sort()
  for (;;) {
    try { window.localStorage.setItem(key, raw); break }
    catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError' || !replaceable.length) throw error
      window.localStorage.removeItem(replaceable.shift()!)
    }
  }
  if (kind === 'checkpoint') {
    try {
      const older = Object.keys(window.localStorage).filter(existing => existing.startsWith(CHECKPOINT_PREFIX) && existing !== key).sort()
      for (const old of older.slice(0, Math.max(0, older.length - CHECKPOINT_LIMIT + 1))) window.localStorage.removeItem(old)
    } catch { /* 当前副本已保存；清理失败不影响后续编辑。 */ }
  }
  if (kind === 'conflict') lastConflictContent = content
}

async function writeBookmarkCheckpointAsync(snapshot: BookmarkSnapshot): Promise<void> {
  const native = nativeDirectory()
  if (!native?.fs?.promises) {
    preserveBookmarkRecovery(snapshot, 'checkpoint')
    return
  }
  const fsp = native.fs.promises
  const content = JSON.stringify([snapshot.groups, stripUsageForHash(snapshot.bookmarks)])
  const hash = (window.require!('node:crypto') as typeof import('node:crypto')).createHash('sha256').update(content).digest('hex')
  if (hash === lastCheckpointHash) return

  const key = `${PREFIX}checkpoint.${hash}`
  const directory = native.path.join(native.directory, 'checkpoints')
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 })
  const file = native.path.join(directory, `${key}.json`)
  try {
    await fsp.access(file)
    lastCheckpointHash = hash
    return
  } catch {
    // file does not exist yet
  }

  const raw = JSON.stringify(snapshot)
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    const handle = await fsp.open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(raw, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fsp.rename(temporary, file)
    lastCheckpointHash = hash
  } finally {
    await fsp.unlink(temporary).catch(() => {})
  }

  try {
    const names = (await fsp.readdir(directory)).filter(name => /^goose-marks\.bookmark-recovery\.checkpoint\.[a-f0-9]{64}\.json$/.test(name))
    const stats = await Promise.all(names.map(async (name) => {
      const target = native.path.join(directory, name)
      try {
        return { target, stat: await fsp.lstat(target) }
      } catch {
        return null
      }
    }))
    const files = stats
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.stat.isFile()))
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs || a.target.localeCompare(b.target))
    let bytes = files.reduce((total, entry) => total + entry.stat.size, 0)
    let count = files.length
    for (const entry of files) {
      if (count <= CHECKPOINT_LIMIT && (bytes <= CHECKPOINT_BYTES || count <= 2)) break
      if (entry.target === file) continue
      try {
        const current = await fsp.lstat(entry.target)
        if (current.ino !== entry.stat.ino || current.mtimeMs !== entry.stat.mtimeMs) continue
        await fsp.unlink(entry.target)
        bytes -= entry.stat.size
        count--
      } catch {
        // ignore concurrent cleanup
      }
    }
  } catch (error) {
    console.warn('[bookmark] 已保存，本机历史快照暂未轮换:', error)
  }
  try { window.localStorage.removeItem(key) } catch {}
}

/** 后台异步落盘已确认快照，避免启动与常规保存后在渲染主线程同步序列化和 fsync 大文件。 */
export function scheduleBookmarkCheckpoint(snapshot: BookmarkSnapshot): void {
  scheduledCheckpointSnapshot = snapshot
  if (scheduledCheckpointTimer != null) clearTimeout(scheduledCheckpointTimer)
  scheduledCheckpointTimer = setTimeout(() => {
    scheduledCheckpointTimer = null
    const next = scheduledCheckpointSnapshot
    scheduledCheckpointSnapshot = null
    if (!next) return
    checkpointWriteChain = checkpointWriteChain
      .then(() => writeBookmarkCheckpointAsync(next))
      .catch((error) => console.warn('[bookmark] 后台写入检查点失败:', error))
  }, CHECKPOINT_DEBOUNCE_MS)
}

export function clearSavedBookmarkRecovery(): void {
  // 只清除本窗口已成功保存的待写副本，绝不删除历史或其他窗口的恢复内容。
  try { window.localStorage.removeItem(pendingKey) } catch { /* 保留副本不影响正常启动。 */ }
  try {
    const native = nativeDirectory()
    if (native) {
      const file = native.path.join(native.directory, `${pendingKey}.json`)
      if (native.fs.existsSync(file)) native.fs.unlinkSync(file)
    }
  } catch (error) { console.warn('[bookmark] 已保存，本机待写副本仍保留:', error) }
}
