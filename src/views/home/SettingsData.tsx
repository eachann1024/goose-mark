import type * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { parseJsonImportText, importHtmlBookmarks, applyImportDataToStore } from '@/hooks/useImportExport'
import { parseHtmlBookmarks } from '@/lib/htmlBookmarkParser'
import { Ico } from './icon'
import { DataImportPreview } from './DataImportPreview'
import { importPreviewCounts, importTargetStamp } from '@/hooks/import-export/preview'
import type { ImportData, ImportMode } from '@/hooks/import-export/types'
import { portableSnapshot, parse } from '@/lib/bookmark-backup/snapshot'
import { exportBookmarkBackup } from '@/lib/bookmark-backup/export'
import type { HomeToastHandler } from './homeInteractionTypes'

export function SettingsData({ onToast }: { onToast?: HomeToastHandler }) {

  const [preview, setPreview] = useState<{ data: ImportData; stamp: string } | null>(null)
  const showPreview = (data: ImportData) => setPreview({ data, stamp: importTargetStamp(useBookmarkStore.getState()) })
  const confirmImport = (mode: ImportMode) => {
    if (!preview) return
    const store = useBookmarkStore.getState()
    if (store.isReadOnly || importTargetStamp(store) !== preview.stamp) {
      onToast?.('当前数据已变化，请重新导入预览')
      setPreview(null)
      return
    }
    const summary = applyImportDataToStore(store, preview.data, mode)
    store.ensureValidSelection()
    setPreview(null)
    onToast?.(`导入完成：当前共 ${summary.after.bookmarks} 条书签`)
  }

  // 隐藏的 file input ref
  const fileInputRef = useRef<HTMLInputElement>(null)
  const readOnly = useBookmarkStore(state => state.isReadOnly)

  // 导入文件处理
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 重置 input，方便再次选同一文件
    e.target.value = ''
    try {
      const text = await file.text()
      const bookmarkStore = useBookmarkStore.getState()
      if (bookmarkStore.isReadOnly) {
        onToast?.('当前书签只读，未导入文件')
        return
      }

      if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
        // HTML 书签导入
        const parsed = parseHtmlBookmarks(text)
        const importData = importHtmlBookmarks(parsed)
        showPreview(importData)
      } else {
        // JSON 导入
        const result = parseJsonImportText(text)
        if (!result.ok) {
          onToast?.(`导入失败：${result.message}`)
          return
        }
        showPreview(file.name.toLowerCase().endsWith('.json') && result.source === 'goose-marks'
          ? JSON.parse(await portableSnapshot(parse(text))) as ImportData : result.data)
      }
    } catch (err) {
      console.error('[Import] 导入失败', err)
      onToast?.('导入失败，请检查文件格式')
    }
  }, [onToast])

  const handleClearBookmarks = useCallback(() => {
    if (useBookmarkStore.getState().isReadOnly) {
      onToast?.('当前书签只读，未清空书签')
      return
    }
    if (
      !window.confirm(
        '确定清空全部书签（含回收站）？保留默认分组结构，不恢复示例。此操作不可撤销。'
      )
    ) {
      return
    }
    useBookmarkStore.getState().clearAllBookmarks()
    onToast?.('已清空全部书签')
  }, [onToast])

  const handleExport = async () => {
    try {
      const message = await exportBookmarkBackup()
      if (message) onToast?.(message)
    } catch (error) { onToast?.(`导出失败：${error instanceof Error ? error.message : '无法完整读取图片'}`) }
  }

  return (
    <>
      {preview && <DataImportPreview counts={importPreviewCounts(preview.data, useBookmarkStore.getState())}
        onConfirm={confirmImport} onCancel={() => setPreview(null)} />}
      <div className="set-section" id="set-data">
        <h2><Ico name="database" />导入与备份</h2>
        <div className="set-card">
          <div className="set-row set-row-action">
            <div><div className="rt">导入书签或备份</div></div>
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
              disabled={readOnly}
              onClick={() => fileInputRef.current?.click()}
            >
              <Ico name="upload" />选择文件
            </button>
          </div>
          <div className="set-row set-row-action">
            <div><div className="rt">导出完整备份</div></div>
            <button
              className="btn btn-primary"
              style={{ height: 34, fontSize: 12.5 }}
              onClick={() => void handleExport()}
            >
              <Ico name="download" />导出
            </button>
          </div>
          <div className="set-row set-row-action">
            <div><div className="rt">清空全部书签</div></div>
            <button
              className="btn btn-ghost danger"
              style={{ height: 34, fontSize: 12.5 }}
              disabled={readOnly}
              onClick={handleClearBookmarks}
            >
              <Ico name="trash-2" />清空全部
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
