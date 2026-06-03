import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/internal/Dialog'

/**
 * QuickSaveDialog（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue Dialog + v-model:open + emit('save', url) 可 await → React 受控
 * onOpenChange + onSave(返回 Promise 时 await)。打开时自动聚焦 URL 输入框。
 */
export interface QuickSaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 保存回调：返回 Promise 时会等待其完成再清空并关闭 */
  onSave: (url: string) => void | Promise<void>
}

export function QuickSaveDialog({ open, onOpenChange, onSave }: QuickSaveDialogProps) {
  const [url, setUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [savingStatus, setSavingStatus] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 打开时自动聚焦（等价旧版 watch(open) + setTimeout）
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [open])

  const handleSave = async () => {
    if (!url.trim() || isSaving) return
    setIsSaving(true)
    setSavingStatus('正在获取页面信息...')
    try {
      await onSave(url.trim())
      setUrl('')
      onOpenChange(false)
    } finally {
      setIsSaving(false)
      setSavingStatus('')
    }
  }

  const handleCancel = () => {
    setUrl('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>快速保存书签</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <label htmlFor="quick-save-url" className="text-sm font-medium">
            网址
          </label>
          <input
            id="quick-save-url"
            ref={inputRef}
            type="url"
            value={url}
            disabled={isSaving}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            placeholder="输入网址，如 https://example.com"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          {savingStatus && <p className="text-xs text-muted-foreground">{savingStatus}</p>}
        </div>
      </div>

      <DialogFooter>
        <button
          type="button"
          disabled={isSaving}
          onClick={handleCancel}
          className="h-9 px-4 inline-flex items-center justify-center rounded-md border border-input bg-muted/35 text-sm text-foreground shadow-sm hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!url.trim() || isSaving}
          onClick={handleSave}
          className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          保存
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default QuickSaveDialog
