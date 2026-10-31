import type { BookmarkSnapshot } from './stateRepository'

// 仅本机的原格式 JSON。副本从不自动加载进当前账号；恢复必须由用户显式导入。
const PREFIX = 'goose-marks.bookmark-recovery.'
const sessionId = crypto.randomUUID()
const pendingKey = `${PREFIX}pending.${sessionId}`
const CHECKPOINT_PREFIX = `${PREFIX}checkpoint-v2.`
const CHECKPOINT_LIMIT = 16
const CHECKPOINT_BYTES = 256 * 1024 * 1024
let lastConflictContent: string | undefined

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
  const content = kind !== 'pending' ? JSON.stringify([snapshot.groups, [...snapshot.bookmarks].sort((a, b) => a.id.localeCompare(b.id))]) : undefined
  if (kind === 'conflict' && content === lastConflictContent) return
  let key = kind === 'pending' ? pendingKey : kind === 'checkpoint'
    ? `${CHECKPOINT_PREFIX}${Date.now()}.${sessionId}`
    : `${PREFIX}conflict.${Date.now()}.${crypto.randomUUID()}`
  const raw = JSON.stringify(snapshot)
  try {
    const native = nativeDirectory()
    if (native) {
      // 已确认快照和冲突副本按内容命名，反复启动或往返同步不会无限复制同一份数据。
      if (kind !== 'pending') {
        const hash = (window.require!('node:crypto') as typeof import('node:crypto')).createHash('sha256').update(content!).digest('hex')
        key = `${PREFIX}${kind}.${hash}`
      }
      // 只轮换本版本新建的已确认 checkpoint，旧文件、pending 和真实冲突副本不参与清理。
      const directory = kind === 'checkpoint' ? native.path.join(native.directory, 'checkpoints') : native.directory
      native.fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const file = native.path.join(directory, `${key}.json`)
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
