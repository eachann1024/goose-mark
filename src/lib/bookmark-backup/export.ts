import { useBookmarkStore } from '@/stores/bookmark'
import { currentFileSettings } from './settings'
import { portableSnapshot } from './snapshot'

export async function exportBookmarkBackup() {
  const name = `goose-marks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const { groups, bookmarks } = useBookmarkStore.getState()
  const text = await portableSnapshot({ groups, bookmarks, settings: currentFileSettings() })
  if (window.__gooseBackup?.saveWithDialog) {
    const result = await window.__gooseBackup.saveWithDialog(name, text)
    return result === 'saved' ? '完整备份已导出' : null
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
