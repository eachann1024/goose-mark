<script setup lang="ts">
const settingsStore = useSettingsStore()
const bookmarkStore = useBookmarkStore()
const { showToast } = useUIManager()
const {
  canUseLocalMirror,
  canPickMirrorDirectory,
  pickMirrorDirectory,
  start,
  syncNow,
  setMirrorDirectoryForDevice,
  setDefaultMirrorDirectoryForDevice,
  isMirrorDirectoryConfiguredOnDevice,
  shouldPromptMirrorDirectorySelection,
  readMirrorSnapshot,
  validateMirrorSnapshot,
  applyMirrorToStore,
  getResolvedMirrorDirectoryPath
} = useLocalDataMirror()

const mirrorAvailable = computed(() => canUseLocalMirror())
const canPickDirectory = computed(() => canPickMirrorDirectory())
const usingCustomDirectory = computed(() => !!settingsStore.localMirrorDirectory)
const deviceDirectoryConfigured = computed(() => isMirrorDirectoryConfiguredOnDevice())
const mirrorDirectoryPath = computed(() => getResolvedMirrorDirectoryPath())
const displayDirectoryPath = computed(() => {
  if (!deviceDirectoryConfigured.value && settingsStore.preferLocalSnapshotOnStartup) {
    return '未设置（请先选择保存文件夹）'
  }
  return mirrorDirectoryPath.value || '暂无可用路径'
})

const togglePreferLocalSnapshot = () => {
  const next = !settingsStore.preferLocalSnapshotOnStartup
  settingsStore.setPreferLocalSnapshotOnStartup(next)
  if (next && shouldPromptMirrorDirectorySelection()) {
    showToast({
      title: '请先为当前设备选择保存文件夹',
      description: '未选择前仍以云端数据为准，不会从本地恢复',
      variant: 'warning'
    })
  }
}

const chooseMirrorDirectory = async () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持本地备份', variant: 'warning' })
    return
  }
  if (!canPickDirectory.value) {
    showToast({ title: '当前环境不支持选择文件夹', variant: 'warning' })
    return
  }

  const selected = await pickMirrorDirectory()
  if (!selected) return

  setMirrorDirectoryForDevice(selected)
  start()
  syncNow()
  showToast({
    title: '已更新保存文件夹',
    description: selected,
    variant: 'success'
  })
}

const resetMirrorDirectory = () => {
  if (!usingCustomDirectory.value) return
  setDefaultMirrorDirectoryForDevice()
  start()
  syncNow()
  showToast({ title: '已恢复默认文件夹', variant: 'success' })
}

const rebuildLocalSnapshot = () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持本地备份', variant: 'warning' })
    return
  }
  syncNow()
  showToast({ title: '已刷新本地备份', variant: 'success' })
}

const applySnapshotToCurrent = () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持本地备份', variant: 'warning' })
    return
  }

  const payload = readMirrorSnapshot()
  const validation = validateMirrorSnapshot(payload)
  if (!payload || !validation.ok) {
    syncNow()
    showToast({
      title: '本地备份不可用，已按当前数据重新生成',
      description: validation.reason ? `原因：${validation.reason}` : undefined,
      variant: 'warning'
    })
    return
  }

  applyMirrorToStore(bookmarkStore, payload)
  showToast({ title: '已用本地备份恢复当前数据', variant: 'success' })
}
</script>

<template>
  <div class="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle>本地备份</CardTitle>
        <CardDescription>为浏览器扩展提供本地数据，并支持启动时优先使用本地备份</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">启动时优先用本地备份</div>
            <div class="text-xs text-muted-foreground">开启后每次启动都会先读取本地备份</div>
          </div>
          <Button
            :variant="settingsStore.preferLocalSnapshotOnStartup ? 'default' : 'outline'"
            size="sm"
            @click="togglePreferLocalSnapshot"
          >
            {{ settingsStore.preferLocalSnapshotOnStartup ? '已开启' : '未开启' }}
          </Button>
        </div>

        <div class="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground shrink-0">备份位置：</span>
            <span class="min-w-0 flex-1 truncate" :title="displayDirectoryPath">
              {{ displayDirectoryPath }}
            </span>
            <span v-if="!deviceDirectoryConfigured && settingsStore.preferLocalSnapshotOnStartup" class="text-amber-500 shrink-0">
              未配置
            </span>
          </div>
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              :disabled="!mirrorAvailable || !canPickDirectory"
              @click="chooseMirrorDirectory"
            >
              选择文件夹
            </Button>
          </div>
          <div class="text-xs text-muted-foreground leading-5">
            开启后，启动会先用本地备份恢复数据；同步到新设备后，需要在新设备重新选择一次文件夹。
          </div>
        </div>
        <div v-if="!mirrorAvailable" class="text-xs text-amber-500">
          当前环境不支持本地备份。
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>本地备份操作</CardTitle>
        <CardDescription>可手动刷新备份，或用备份恢复当前数据</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <Button variant="secondary" :disabled="!mirrorAvailable" @click="rebuildLocalSnapshot">
          <span class="i-mdi-database-sync mr-2" />
          刷新本地备份
        </Button>
        <Button variant="outline" :disabled="!mirrorAvailable" @click="applySnapshotToCurrent">
          <span class="i-mdi-database-import-outline mr-2" />
          用本地备份恢复当前数据
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
