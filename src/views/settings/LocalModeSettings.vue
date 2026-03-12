<script setup lang="ts">
const settingsStore = useSettingsStore()
const { showToast } = useUIManager()
const { ensureLocalModeDevicePathNotice, markDevicePathConfigured } = useFeatureNoticeCenter()
const extensionResourceUrl = 'https://my.feishu.cn/wiki/ZY1dwv0oBim9R8k5jTwc9Fjqn8f'

const openExtensionResource = () => {
  try {
    if (window.utools?.shellOpenExternal) {
      window.utools.shellOpenExternal(extensionResourceUrl)
      return
    }
  } catch (error) {
    console.warn('[LocalModeSettings] 打开拓展资源失败，尝试浏览器打开', error)
  }
  window.open(extensionResourceUrl, '_blank')
}

const {
  canUseLocalMirror,
  canPickMirrorDirectory,
  pickMirrorDirectory,
  inspectMirrorDirectory,
  activateMirrorDirectory,
  start,
  syncNow,
  setDefaultMirrorDirectoryForDevice,
  isMirrorDirectoryConfiguredOnDevice,
  getResolvedMirrorDirectoryPath
} = useLocalDataMirror()

type PendingMirrorDecision = {
  directoryPath: string
  filePath: string
  canRead: boolean
}

const mirrorAvailable = computed(() => canUseLocalMirror())
const canPickDirectory = computed(() => canPickMirrorDirectory())
const usingCustomDirectory = computed(() => !!settingsStore.localMirrorDirectory)
const deviceDirectoryConfigured = computed(() => isMirrorDirectoryConfiguredOnDevice())
const mirrorDirectoryPath = computed(() => getResolvedMirrorDirectoryPath())
const showMirrorDecisionDialog = ref(false)
const mirrorDecisionLoading = ref(false)
const pendingMirrorDecision = ref<PendingMirrorDecision | null>(null)
const displayDirectoryPath = computed(() => {
  if (!deviceDirectoryConfigured.value && settingsStore.preferLocalSnapshotOnStartup) {
    return '未设置（请先选择同步文件夹）'
  }
  return mirrorDirectoryPath.value || '暂无可用路径'
})

const handlePreferLocalSnapshotChange = (checked: boolean) => {
  settingsStore.setPreferLocalSnapshotOnStartup(checked)
  if (!checked) {
    ensureLocalModeDevicePathNotice(false)
  }
}

const closeMirrorDecisionDialog = (force = false) => {
  if (mirrorDecisionLoading.value && !force) return
  showMirrorDecisionDialog.value = false
  pendingMirrorDecision.value = null
}

const handleMirrorDirectoryActivation = (directoryPath: string, action: 'overwrite' | 'read') => {
  const result = activateMirrorDirectory(directoryPath, action)
  if (!result.ok) {
    showToast({
      title: action === 'read' ? '读取失败' : '覆盖失败',
      description: action === 'read' ? '现有 snapshot.json 无法读取，请改用覆盖。' : '旧文件备份失败，未覆盖原文件。',
      variant: 'error'
    })
    return false
  }

  markDevicePathConfigured()
  showToast({
    title: action === 'read' ? '已读取现有快照' : '已设置同步文件夹',
    description: action === 'overwrite' && result.backupPath
      ? `已备份旧文件：${result.backupPath}`
      : directoryPath,
    variant: 'success'
  })
  return true
}

const confirmMirrorDecision = (action: 'overwrite' | 'read') => {
  const pending = pendingMirrorDecision.value
  if (!pending) return
  mirrorDecisionLoading.value = true
  try {
    if (handleMirrorDirectoryActivation(pending.directoryPath, action)) {
      closeMirrorDecisionDialog(true)
    }
  } finally {
    mirrorDecisionLoading.value = false
  }
}

const chooseMirrorDirectory = async () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持浏览器拓展数据', variant: 'warning' })
    return
  }
  if (!canPickDirectory.value) {
    showToast({ title: '当前环境不支持选择文件夹', variant: 'warning' })
    return
  }

  const selected = await pickMirrorDirectory()
  if (!selected) return

  const inspection = inspectMirrorDirectory(selected)
  if (inspection.hasExistingFile) {
    pendingMirrorDecision.value = {
      directoryPath: selected,
      filePath: inspection.filePath,
      canRead: inspection.canReadExistingFile
    }
    showMirrorDecisionDialog.value = true
    return
  }

  handleMirrorDirectoryActivation(selected, 'overwrite')
}

const resetMirrorDirectory = () => {
  if (!usingCustomDirectory.value) return
  setDefaultMirrorDirectoryForDevice()
  start()
  syncNow()
  markDevicePathConfigured()
  showToast({ title: '已恢复默认同步文件夹', variant: 'success' })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">浏览器拓展模式</h3>
        <p class="settings-block__desc">双向同步：应用写入本地快照，扩展改动后也会回写当前书签。</p>
      </div>

      <button
        type="button"
        class="group w-full rounded-xl border border-input bg-muted/35 p-4 text-left transition-colors hover:bg-muted/55"
        @click="openExtensionResource"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2 text-foreground">
              <span class="i-mdi-star-four-points-circle text-lg" />
              <span class="text-sm font-semibold">浏览器拓展已上线（含说明视频）</span>
            </div>
            <div class="text-xs text-muted-foreground">
              打开下载与说明
            </div>
          </div>
          <span class="i-mdi-open-in-new text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </button>

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <div class="text-sm font-medium">启用本地快照同步</div>
          <div class="text-xs text-muted-foreground">共享同一个 `snapshot.json`</div>
        </div>
        <Switch
          :model-value="settingsStore.preferLocalSnapshotOnStartup"
          aria-label="启动时优先读取本地数据"
          @update:model-value="handlePreferLocalSnapshotChange"
        />
      </div>

      <div v-if="settingsStore.preferLocalSnapshotOnStartup" class="rounded-lg bg-background/60 p-3 space-y-3">
        <div class="flex items-center gap-2 text-xs">
          <span class="text-muted-foreground shrink-0">同步文件夹：</span>
          <span class="min-w-0 flex-1 truncate" :title="displayDirectoryPath">
            {{ displayDirectoryPath }}
          </span>
          <Button
            size="sm"
            variant="ghost"
            class="h-6 shrink-0 px-2 text-xs"
            :disabled="!mirrorAvailable || !canPickDirectory"
            @click="chooseMirrorDirectory"
          >
            选择文件夹
          </Button>
        </div>
      </div>
      <div v-if="!mirrorAvailable" class="text-xs text-muted-foreground">
        当前环境不支持浏览器拓展数据。
      </div>
    </div>

    <MirrorDirectoryDecisionDialog
      :open="showMirrorDecisionDialog"
      :directory-path="pendingMirrorDecision?.directoryPath || ''"
      :file-path="pendingMirrorDecision?.filePath || ''"
      :can-read="pendingMirrorDecision?.canRead ?? false"
      :loading="mirrorDecisionLoading"
      @update:open="value => !value && closeMirrorDecisionDialog()"
      @read="confirmMirrorDecision('read')"
      @overwrite="confirmMirrorDecision('overwrite')"
    />
  </div>
</template>
