import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/**
 * DeleteConfirmDialog（React 版）
 * --------------------------------------------------------------------------
 * 删除确认对话框（移入回收站 / 彻底删除二态）。等价旧版 Vue DeleteConfirmDialog.vue。
 * 受控 open + onOpenChange + onConfirm。轻量自包含遮罩弹窗（不依赖 HeroUI Modal，
 * 行为/样式与旧版一致）。无埋点。
 */
export interface DeleteConfirmDialogProps {
  open: boolean
  isTrashActive: boolean
  onOpenChange: (value: boolean) => void
  onConfirm: () => void
}

export function DeleteConfirmDialog({
  open,
  isTrashActive,
  onOpenChange,
  onConfirm
}: DeleteConfirmDialogProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }
  const handleClose = () => onOpenChange(false)

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-[400px] mx-4 p-4 rounded-lg bg-card border border-border shadow-lg"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">确认删除</h2>
        <p className="py-2 text-sm">
          {isTrashActive
            ? '确定要彻底删除此书签吗？此操作不可撤销。'
            : '确定要将此书签移入回收站吗？'}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleConfirm}>确认</Button>
        </div>
      </div>
    </div>
  )
}

export default DeleteConfirmDialog
