import type * as React from 'react'
import { useCallback, useRef } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { parseJsonImportText, importHtmlBookmarks, applyImportDataToStore } from '@/hooks/useImportExport'
import { parseHtmlBookmarks } from '@/lib/htmlBookmarkParser'
import { Ico } from './icon'

export function SettingsData({ onToast }: { onToast?: (title?: string) => void }) {

  // 隐藏的 file input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 导入文件处理
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 重置 input，方便再次选同一文件
    e.target.value = ''
    try {
      const text = await file.text()
      const bookmarkStore = useBookmarkStore.getState()

      if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
        // HTML 书签导入
        const parsed = parseHtmlBookmarks(text)
        const importData = importHtmlBookmarks(parsed)
        const summary = applyImportDataToStore(bookmarkStore, importData, 'merge')
        onToast?.(`导入成功：${summary.added.bookmarks} 条书签`)
      } else {
        // JSON 导入
        const result = parseJsonImportText(text)
        if (!result.ok) {
          onToast?.(`导入失败：${result.message}`)
          return
        }
        const summary = applyImportDataToStore(bookmarkStore, result.data, 'merge')
        onToast?.(`导入成功：${summary.added.bookmarks} 条书签`)
      }
    } catch (err) {
      console.error('[Import] 导入失败', err)
      onToast?.('导入失败，请检查文件格式')
    }
  }, [onToast])

  const handleResetBookmarks = useCallback(() => {
    if (
      !window.confirm(
        '确定重置为默认书签？当前全部分组与书签将被替换为内置示例（含站点图标），此操作不可撤销。'
      )
    ) {
      return
    }
    useBookmarkStore.getState().resetToDefaultBookmarks()
    onToast?.('已恢复默认书签')
  }, [onToast])

  // 导出 JSON
  const handleExport = useCallback(() => {
    const { groups, bookmarks } = useBookmarkStore.getState()
    const data = JSON.stringify({ groups, bookmarks }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `goose-marks-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onToast?.('备份已下载')
  }, [onToast])

  return (
    <>
      <div className="set-section" id="set-data">
        <h2><Ico name="database" />导入与备份</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">导入浏览器书签</div><div className="rd">支持 Chrome / Edge / Firefox 导出的 HTML</div></div>
            {/* 隐藏的 file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <button
              className="btn btn-outline"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Ico name="upload" />选择文件
            </button>
          </div>
          <div className="set-row">
            <div><div className="rt">导出备份</div><div className="rd">下载全部分组与书签（JSON）</div></div>
            <button
              className="btn btn-primary"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={handleExport}
            >
              <Ico name="download" />导出
            </button>
          </div>
          <div className="set-row">
            <div><div className="rt">重置书签</div><div className="rd">恢复为内置默认分组与示例链接（图标已内置）</div></div>
            <button
              className="btn btn-ghost danger"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={handleResetBookmarks}
            >
              <Ico name="rotate-ccw" />重置
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
