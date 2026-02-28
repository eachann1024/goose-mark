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
  start,
  syncNow,
  setMirrorDirectoryForDevice,
  setDefaultMirrorDirectoryForDevice,
  isMirrorDirectoryConfiguredOnDevice,
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

const handlePreferLocalSnapshotChange = (checked: boolean) => {
  settingsStore.setPreferLocalSnapshotOnStartup(checked)
  if (!checked) {
    ensureLocalModeDevicePathNotice(false)
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

  setMirrorDirectoryForDevice(selected)
  start()
  syncNow()
  markDevicePathConfigured()
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
  markDevicePathConfigured()
  showToast({ title: '已恢复默认文件夹', variant: 'success' })
}
</script>

<template>
  <div class="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle>浏览器拓展模式</CardTitle>
        <CardDescription>书签每次改动会同步到本地，浏览器拓展自动读取数据，无需手动刷新。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <button
          type="button"
          class="group w-full rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-4 text-left transition-all hover:shadow-md hover:border-amber-400 dark:border-amber-500/40 dark:from-amber-500/10 dark:via-orange-500/10 dark:to-rose-500/10"
          @click="openExtensionResource"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <span class="i-mdi-star-four-points-circle text-lg" />
                <span class="text-sm font-semibold">浏览器拓展已上线（含说明视频）</span>
              </div>
              <div class="text-xs text-amber-800/90 dark:text-amber-200/90">
                点击直达下载与使用说明页面
              </div>
            </div>
            <span class="i-mdi-open-in-new text-lg text-amber-700 transition-transform group-hover:translate-x-0.5 dark:text-amber-300" />
          </div>
        </button>

        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <div class="text-sm font-medium">本地浏览器拓展模式</div>
            <div class="text-xs text-muted-foreground">开启后会生成 snapshot.json 文件，拓展如果改动了书签也会同步到鹅的书签插件中</div>
          </div>
          <Switch
            :model-value="settingsStore.preferLocalSnapshotOnStartup"
            aria-label="启动时优先读取本地数据"
            @update:model-value="handlePreferLocalSnapshotChange"
          />
        </div>

        <div v-if="settingsStore.preferLocalSnapshotOnStartup" class="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground shrink-0">配置存放位置：</span>
            <span class="min-w-0 flex-1 truncate" :title="displayDirectoryPath">
              {{ displayDirectoryPath }}
            </span>
            <Button
              size="sm"
              variant="outline"
              class="h-6 shrink-0 px-2 text-xs"
              :disabled="!mirrorAvailable || !canPickDirectory"
              @click="chooseMirrorDirectory"
            >
              选择文件夹
            </Button>
          </div>
        </div>
        <div v-if="!mirrorAvailable" class="text-xs text-amber-500">
          当前环境不支持浏览器拓展数据。
        </div>
      </CardContent>
    </Card>
    <!--
      已按需精简：暂时隐藏“浏览器拓展操作”模块
    -->
  </div>
</template>
