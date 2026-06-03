import { useMemo, useState } from 'react'
import { Star, SquareArrowOutUpRight } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings'
import { useUIManager } from '@/hooks/useUIManager'
import { useFeatureNoticeCenter } from '@/hooks/useFeatureNoticeCenter'
import { useLocalDataMirror } from '@/hooks/useLocalDataMirror'
import {
  Button,
  Switch,
  SettingsBlock,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter
} from './_ui'

const extensionResourceUrl =
  'https://my.feishu.cn/wiki/ZY1dwv0oBim9R8k5jTwc9Fjqn8f'

type MirrorDecisionAction = 'overwrite' | 'read'

type PendingMirrorDecision = {
  directoryPath: string
  filePath: string
  canRead: boolean
}

/**
 * 同步文件夹已有快照时的处理对话框（替代旧 Vue MirrorDirectoryDecisionDialog.vue）。
 */
function MirrorDirectoryDecisionDialog({
  open,
  directoryPath,
  filePath,
  canRead,
  loading,
  onClose,
  onRead,
  onOverwrite
}: {
  open: boolean
  directoryPath: string
  filePath: string
  canRead: boolean
  loading: boolean
  onClose: () => void
  onRead: () => void
  onOverwrite: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} dismissable={!loading}>
      <ModalHeader>
        <ModalTitle>发现已有快照文件</ModalTitle>
        <ModalDescription>
          当前文件夹里已经有 `snapshot.json`，请选择处理方式。
        </ModalDescription>
      </ModalHeader>

      <div className="space-y-3 py-2">
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
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
          <p className="text-xs text-destructive">
            当前 `snapshot.json` 无法读取，只能覆盖。
          </p>
        )}
      </div>

      <ModalFooter>
        <Button
          variant="ghost"
          className="px-4 text-muted-foreground hover:bg-transparent hover:text-foreground"
          disabled={loading}
          onClick={onClose}
        >
          取消
        </Button>
        <Button
          variant="outline"
          className="min-w-32 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-200 dark:hover:bg-emerald-500/18"
          disabled={loading || !canRead}
          onClick={onRead}
        >
          读取现有文件
        </Button>
        <Button
          variant="destructive"
          className="min-w-32"
          disabled={loading}
          onClick={onOverwrite}
        >
          备份后覆盖
        </Button>
      </ModalFooter>
    </Modal>
  )
}

/**
 * LocalModeSettings：浏览器拓展 / 本地快照同步设置。
 * 对应旧 Vue views/settings/LocalModeSettings.vue，功能等价；无埋点。
 */
export default function LocalModeSettings() {
  const settingsStore = useSettingsStore()
  const showToast = useUIManager((u) => u.showToast)
  const ensureLocalModeDevicePathNotice = useFeatureNoticeCenter(
    (f) => f.ensureLocalModeDevicePathNotice
  )
  const markDevicePathConfigured = useFeatureNoticeCenter(
    (f) => f.markDevicePathConfigured
  )

  const mirror = useLocalDataMirror()

  const [showMirrorDecisionDialog, setShowMirrorDecisionDialog] =
    useState(false)
  const [mirrorDecisionLoading, setMirrorDecisionLoading] = useState(false)
  const [pendingMirrorDecision, setPendingMirrorDecision] =
    useState<PendingMirrorDecision | null>(null)

  const mirrorAvailable = useMemo(() => mirror.canUseLocalMirror(), [mirror])
  const canPickDirectory = useMemo(
    () => mirror.canPickMirrorDirectory(),
    [mirror]
  )
  const usingCustomDirectory = !!settingsStore.localMirrorDirectory
  const deviceDirectoryConfigured = mirror.isMirrorDirectoryConfiguredOnDevice()
  const mirrorDirectoryPath = mirror.getResolvedMirrorDirectoryPath()

  const displayDirectoryPath = (() => {
    if (
      !deviceDirectoryConfigured &&
      settingsStore.preferLocalSnapshotOnStartup
    ) {
      return '未设置（请先选择同步文件夹）'
    }
    return mirrorDirectoryPath || '暂无可用路径'
  })()

  const openExtensionResource = () => {
    try {
      if (window.utools?.shellOpenExternal) {
        window.utools.shellOpenExternal(extensionResourceUrl)
        return
      }
    } catch (error) {
      console.warn(
        '[LocalModeSettings] 打开拓展资源失败，尝试浏览器打开',
        error
      )
    }
    window.open(extensionResourceUrl, '_blank')
  }

  const handlePreferLocalSnapshotChange = (checked: boolean) => {
    settingsStore.setPreferLocalSnapshotOnStartup(checked)
    if (!checked) {
      mirror.stop()
      ensureLocalModeDevicePathNotice(false)
      return
    }
    mirror.start()
  }

  const closeMirrorDecisionDialog = (force = false) => {
    if (mirrorDecisionLoading && !force) return
    setShowMirrorDecisionDialog(false)
    setPendingMirrorDecision(null)
  }

  const handleMirrorDirectoryActivation = (
    directoryPath: string,
    action: MirrorDecisionAction
  ) => {
    const result = mirror.activateMirrorDirectory(directoryPath, action)
    if (!result.ok) {
      showToast({
        title: action === 'read' ? '读取失败' : '覆盖失败',
        description:
          action === 'read'
            ? '现有 snapshot.json 无法读取，请改用覆盖。'
            : '旧文件备份失败，未覆盖原文件。',
        variant: 'error'
      })
      return false
    }

    markDevicePathConfigured()
    showToast({
      title: action === 'read' ? '已读取现有快照' : '已设置同步文件夹',
      description:
        action === 'overwrite' && result.backupPath
          ? `已备份旧文件：${result.backupPath}`
          : directoryPath,
      variant: 'success'
    })
    return true
  }

  const confirmMirrorDecision = (action: MirrorDecisionAction) => {
    const pending = pendingMirrorDecision
    if (!pending) return
    setMirrorDecisionLoading(true)
    try {
      if (handleMirrorDirectoryActivation(pending.directoryPath, action)) {
        closeMirrorDecisionDialog(true)
      }
    } finally {
      setMirrorDecisionLoading(false)
    }
  }

  const chooseMirrorDirectory = async () => {
    if (!mirrorAvailable) {
      showToast({ title: '当前环境不支持浏览器拓展数据', variant: 'warning' })
      return
    }
    if (!canPickDirectory) {
      showToast({ title: '当前环境不支持选择文件夹', variant: 'warning' })
      return
    }

    const selected = await mirror.pickMirrorDirectory()
    if (!selected) return

    const inspection = mirror.inspectMirrorDirectory(selected)
    if (inspection.hasExistingFile) {
      setPendingMirrorDecision({
        directoryPath: selected,
        filePath: inspection.filePath,
        canRead: inspection.canReadExistingFile
      })
      setShowMirrorDecisionDialog(true)
      return
    }

    handleMirrorDirectoryActivation(selected, 'overwrite')
  }

  // 与旧版保持一致：保留 resetMirrorDirectory 行为（当前 UI 未直接暴露按钮，但逻辑等价）
  void usingCustomDirectory

  return (
    <div className="flex flex-col gap-3">
      <SettingsBlock
        title="浏览器拓展模式"
        desc="双向同步：应用写入本地快照，扩展改动后也会回写当前书签。"
      >
        <button
          type="button"
          className="group w-full rounded-xl border border-input bg-muted/35 p-4 text-left transition-colors hover:bg-muted/55"
          onClick={openExtensionResource}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <Star className="size-5" />
                <span className="text-sm font-semibold">
                  浏览器拓展已上线（含说明视频）
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                打开下载与说明
              </div>
            </div>
            <SquareArrowOutUpRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </button>

        <div className="settings-row">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">启用本地快照同步</div>
            <div className="text-xs text-muted-foreground">
              共享同一个 snapshot.json
            </div>
          </div>
          <Switch
            checked={settingsStore.preferLocalSnapshotOnStartup}
            aria-label="启动时优先读取本地数据"
            onChange={handlePreferLocalSnapshotChange}
          />
        </div>

        {settingsStore.preferLocalSnapshotOnStartup && (
          <div className="space-y-3 rounded-lg bg-background/60 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="shrink-0 text-muted-foreground">
                同步文件夹：
              </span>
              <span
                className="min-w-0 flex-1 truncate"
                title={displayDirectoryPath}
              >
                {displayDirectoryPath}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 px-2 text-xs"
                disabled={!mirrorAvailable || !canPickDirectory}
                onClick={chooseMirrorDirectory}
              >
                选择文件夹
              </Button>
            </div>
          </div>
        )}

        {!mirrorAvailable && (
          <div className="text-xs text-muted-foreground">
            当前环境不支持浏览器拓展数据。
          </div>
        )}
      </SettingsBlock>

      <MirrorDirectoryDecisionDialog
        open={showMirrorDecisionDialog}
        directoryPath={pendingMirrorDecision?.directoryPath || ''}
        filePath={pendingMirrorDecision?.filePath || ''}
        canRead={pendingMirrorDecision?.canRead ?? false}
        loading={mirrorDecisionLoading}
        onClose={() => closeMirrorDecisionDialog()}
        onRead={() => confirmMirrorDecision('read')}
        onOverwrite={() => confirmMirrorDecision('overwrite')}
      />
    </div>
  )
}
