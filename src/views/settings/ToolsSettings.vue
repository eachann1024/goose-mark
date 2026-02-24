<script setup lang="ts">
import ResultToast from '@/components/ResultToast.vue'

const store = useBookmarkStore()
const settingsStore = useSettingsStore()

const matching = ref(false)
const forceRematch = computed(() => !settingsStore.skipFailedIconMatch)

// Result Toast
type ResultToastVariant = 'success' | 'info' | 'warning' | 'error'
type ResultToastState = {
  visible: boolean
  variant: ResultToastVariant
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}
const resultToast = ref<ResultToastState>({
  visible: false,
  variant: 'info',
  title: ''
})
let resultToastTimer: ReturnType<typeof setTimeout> | null = null

const closeResultToast = () => {
  if (resultToastTimer) clearTimeout(resultToastTimer)
  resultToastTimer = null
  resultToast.value.visible = false
  resultToast.value.onAction = undefined
}

const showResultToast = (payload: Omit<ResultToastState, 'visible'>, timeoutMs = 4500) => {
  if (resultToastTimer) clearTimeout(resultToastTimer)
  resultToast.value = { ...payload, visible: true }
  resultToastTimer = setTimeout(() => closeResultToast(), timeoutMs)
}

const handleResultToastAction = () => resultToast.value.onAction?.()

const missingCount = computed(() => store.countMissingIconCandidates(forceRematch.value))

const matchMissing = async () => {
  if (matching.value) return
  const missing = store.countMissingIconCandidates(forceRematch.value)
  if (missing === 0) {
    showResultToast({ variant: 'info', title: '没有需要补全的图标', description: '当前书签图标已完整' }, 4500)
    return
  }
  matching.value = true
  const started = performance.now()
  try {
    const res = await store.refreshMissingIcons(forceRematch.value)
    const elapsed = Math.round(performance.now() - started)
    
    let description = ''
    if (res.matched > 0) {
      description += `✓ 成功匹配 ${res.matched} 个`
    }
    if (res.failList.length > 0) {
      const failNames = res.failList.slice(0, 5).map(f => {
        const name = f.title.length > 12 ? f.title.slice(0, 12) + '...' : f.title
        return name
      })
      const failStr = failNames.join('、')
      const moreCount = res.failList.length > 5 ? ` 等${res.failList.length}个` : ''
      description += description ? '\n' : ''
      description += `✗ 未匹配：${failStr}${moreCount}`
    }
    description += ` (${elapsed}ms)`
    
    showResultToast(
      {
        variant: res.remaining > 0 ? 'warning' : 'success',
        title: `图标补全完成：${res.matched}/${res.total}`,
        description
      },
      res.failList.length > 0 ? 8000 : 5000
    )
    settingsStore.addIconMatchLog({
      time: Date.now(),
      scope: 'missing',
      total: res.total,
      success: res.matched,
      failed: res.failList.length,
      failedTitles: res.failList.map(item => item.title)
    })
  } catch (e) {
    console.error('[Settings] refreshMissingIcons failed:', e)
    showResultToast({ variant: 'error', title: '图标补全失败', description: '请稍后重试，或检查网络和权限' }, 6500)
  } finally {
    matching.value = false
  }
}
</script>

<template>
  <div class="grid gap-6">
    <div class="grid gap-6">
      <!-- Icon Match -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">图标补全</CardTitle>
          <CardDescription>待补全图标：<span class="text-primary font-bold">{{ missingCount }}</span> 个</CardDescription>
        </CardHeader>
        <CardContent>
          <Button class="w-full" variant="secondary" :disabled="matching || missingCount === 0" @click="matchMissing">
            <span v-if="matching" class="i-mdi-loading animate-spin mr-2" />
            {{ matching ? '补全中...' : (missingCount === 0 ? '已全部补全' : '一键补全图标') }}
          </Button>
        </CardContent>
      </Card>
    </div>

    <ResultToast
      :open="resultToast.visible"
      :variant="resultToast.variant"
      :title="resultToast.title"
      :description="resultToast.description"
      :action-label="resultToast.actionLabel"
      @close="closeResultToast"
      @action="handleResultToastAction"
    />
  </div>
</template>
