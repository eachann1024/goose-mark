import { useBookmarkStore } from '@/stores/bookmark'
import { currentFileSettings } from './settings'
import { portableSnapshot } from './snapshot'

export async function exportBookmarkBackup() {
  const name = `goose-marks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const native = !!(window.utools?.showSaveDialog && window.require)
  const target = native ? await window.utools!.showSaveDialog!({
    title: '导出完整备份',
    defaultPath: name,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }) : undefined
  if (native && !target) return null
  const { groups, bookmarks } = useBookmarkStore.getState()
  const text = await portableSnapshot({ groups, bookmarks, settings: currentFileSettings() })
  if (target) {
    const fs = window.require!('node:fs/promises') as typeof import('node:fs/promises')
    const file = await fs.open(target, 'wx', 0o600)
    try {
      await file.writeFile(text, 'utf8')
      await file.sync()
    } finally { await file.close() }
    return '完整备份已导出'
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  try { link.click() }
  finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return '备份下载已开始'
}
