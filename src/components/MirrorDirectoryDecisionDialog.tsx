import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/internal/Dialog'

/**
 * MirrorDirectoryDecisionDialog（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue Dialog + emit(read/overwrite/update:open) → React 受控 onOpenChange +
 * onRead / onOverwrite。结构与文案、按钮禁用条件（loading / canRead）一致。
 */
export interface MirrorDirectoryDecisionDialogProps {
  open: boolean
  directoryPath: string
  filePath: string
  canRead: boolean
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onRead: () => void
  onOverwrite: () => void
}

export function MirrorDirectoryDecisionDialog({
  open,
  directoryPath,
  filePath,
  canRead,
  loading,
  onOpenChange,
  onRead,
  onOverwrite
}: MirrorDirectoryDecisionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>发现已有快照文件</DialogTitle>
        <DialogDescription>
          当前文件夹里已经有 `snapshot.json`，请选择处理方式。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-4">
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p className="truncate" title={directoryPath}>
            文件夹：{directoryPath}
          </p>
          <p className="truncate" title={filePath}>
            文件：{filePath}
          </p>
        </div>

        <div className="rounded-lg bg-muted/30 p-3 text-xs leading-5 text-foreground/85">
          读取：保留现有文件并读入当前应用。
          <br />
          覆盖：先备份旧文件，再写入当前书签。
        </div>

        {!canRead && (
          <p className="text-xs text-destructive">当前 `snapshot.json` 无法读取，只能覆盖。</p>
        )}
      </div>

      <DialogFooter className="mt-2 gap-3 px-1 sm:gap-3 sm:px-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onOpenChange(false)}
          className="h-9 px-4 inline-flex items-center justify-center rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          disabled={loading || !canRead}
          onClick={onRead}
          className="h-9 min-w-32 px-4 inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 shadow-sm hover:bg-emerald-100 transition-colors disabled:pointer-events-none disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-200 dark:hover:bg-emerald-500/18"
        >
          读取现有文件
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onOverwrite}
          className="h-9 min-w-32 px-4 inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-sm text-red-600 shadow-sm hover:bg-red-100 transition-colors disabled:pointer-events-none disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/12 dark:text-red-200 dark:hover:bg-red-500/18"
        >
          备份后覆盖
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default MirrorDirectoryDecisionDialog
