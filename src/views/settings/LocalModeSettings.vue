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
    return '未设置（请先选择本机目录）'
  }
  return mirrorDirectoryPath.value || '未解析到可用路径'
})

const togglePreferLocalSnapshot = () => {
  const next = !settingsStore.preferLocalSnapshotOnStartup
  settingsStore.setPreferLocalSnapshotOnStartup(next)
  if (next && shouldPromptMirrorDirectorySelection()) {
    showToast({
      title: '请先为当前设备设置本地路径',
      description: '未设置路径前会保持云端数据优先，不会执行本地覆盖',
      variant: 'warning'
    })
  }
}

const chooseMirrorDirectory = async () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持本地模式', variant: 'warning' })
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
    title: '已切换本地保存目录',
    description: selected,
    variant: 'success'
  })
}

const resetMirrorDirectory = () => {
  if (!usingCustomDirectory.value) return
  setDefaultMirrorDirectoryForDevice()
  start()
  syncNow()
  showToast({ title: '已恢复默认保存目录', variant: 'success' })
}

const rebuildLocalSnapshot = () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持本地模式', variant: 'warning' })
    return
  }
  syncNow()
  showToast({ title: '已重建本地快照', variant: 'success' })
}

const applySnapshotToCurrent = () => {
  if (!mirrorAvailable.value) {
    showToast({ title: '当前环境不支持本地模式', variant: 'warning' })
    return
  }

  const payload = readMirrorSnapshot()
  const validation = validateMirrorSnapshot(payload)
  if (!payload || !validation.ok) {
    syncNow()
    showToast({
      title: '本地快照无效，已用当前数据重建',
      description: validation.reason ? `原因：${validation.reason}` : undefined,
      variant: 'warning'
    })
    return
  }

  applyMirrorToStore(bookmarkStore, payload)
  showToast({ title: '已从本地快照覆盖当前数据', variant: 'success' })
}
</script>

<template>
  <div class="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle>本地模式</CardTitle>
        <CardDescription>为浏览器扩展提供本地数据源，并支持启动时本地优先覆盖</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">启动时本地数据优先</div>
            <div class="text-xs text-muted-foreground">开启后应用启动会读取本地快照覆盖当前数据</div>
          </div>
          <Button
            :variant="settingsStore.preferLocalSnapshotOnStartup ? 'default' : 'outline'"
            size="sm"
            @click="togglePreferLocalSnapshot"
          >
            {{ settingsStore.preferLocalSnapshotOnStartup ? '已开启' : '点击开启' }}
          </Button>
        </div>

        <div class="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground shrink-0">保存位置：</span>
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
              选择保存文件夹
            </Button>
            <Button
              size="sm"
              variant="ghost"
              :disabled="!usingCustomDirectory"
              @click="resetMirrorDirectory"
            >
              用默认目录
            </Button>
          </div>
          <div class="text-xs text-muted-foreground leading-5">
            本地优先开启后，启动会优先读取本地快照并覆盖 uTools 数据；会员同步到其他设备后，需要在该设备单独选择本地路径。
          </div>
        </div>
        <div v-if="!mirrorAvailable" class="text-xs text-amber-500">
          当前环境不支持本地模式。
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>本地快照操作</CardTitle>
        <CardDescription>手动重建或主动从本地快照覆盖当前数据</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <Button variant="secondary" :disabled="!mirrorAvailable" @click="rebuildLocalSnapshot">
          <span class="i-mdi-database-sync mr-2" />
          立即重建本地快照
        </Button>
        <Button variant="outline" :disabled="!mirrorAvailable" @click="applySnapshotToCurrent">
          <span class="i-mdi-database-import-outline mr-2" />
          从本地快照覆盖当前数据
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
