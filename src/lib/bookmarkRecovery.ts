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

function getRecoveryBridge() {
  return typeof window !== 'undefined' ? window.__gooseBookmarkRecovery ?? null : null
}

export function preserveBookmarkRecovery(snapshot: BookmarkSnapshot, kind: 'pending' | 'checkpoint' | 'conflict' = 'pending'): void {
  const content = kind !== 'pending' ? JSON.stringify([snapshot.groups, stripUsageForHash(snapshot.bookmarks)]) : undefined
  if (kind === 'conflict' && content === lastConflictContent) return
  let key = kind === 'pending' ? pendingKey : kind === 'checkpoint'
    ? `${CHECKPOINT_PREFIX}${Date.now()}.${sessionId}`
    : `${PREFIX}conflict.${Date.now()}.${crypto.randomUUID()}`
  let contentHash: string | undefined
  try {
    const bridge = getRecoveryBridge()
    if (bridge) {
      // 已确认快照和冲突副本按内容命名，反复启动或往返同步不会无限复制同一份数据。
      if (kind !== 'pending') {
        contentHash = bridge.sha256(content!)
        if (kind === 'checkpoint' && contentHash === lastCheckpointHash) return
        key = `${PREFIX}${kind}.${contentHash}`
      }
      const filename = `${key}.json`
      const result = bridge.writeFileSync(kind === 'checkpoint', filename, JSON.stringify(snapshot), kind !== 'pending')
      if (result.existed) {
        if (kind === 'checkpoint') lastCheckpointHash = contentHash
        if (kind === 'conflict') lastConflictContent = content
        return
      }
      if (kind === 'checkpoint') {
        lastCheckpointHash = contentHash
        try {
          bridge.rotateCheckpointsSync(filename, CHECKPOINT_LIMIT, CHECKPOINT_BYTES)
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
  const bridge = getRecoveryBridge()
  if (!bridge) {
    preserveBookmarkRecovery(snapshot, 'checkpoint')
    return
  }
  const content = JSON.stringify([snapshot.groups, stripUsageForHash(snapshot.bookmarks)])
  const hash = bridge.sha256(content)
  if (hash === lastCheckpointHash) return

  const key = `${PREFIX}checkpoint.${hash}`
  const filename = `${key}.json`
  const result = await bridge.writeFileAsync(true, filename, JSON.stringify(snapshot), true)
  lastCheckpointHash = hash
  if (result.existed) return

  try {
    await bridge.rotateCheckpointsAsync(filename, CHECKPOINT_LIMIT, CHECKPOINT_BYTES)
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
    getRecoveryBridge()?.removePendingSync(`${pendingKey}.json`)
  } catch (error) { console.warn('[bookmark] 已保存，本机待写副本仍保留:', error) }
}
