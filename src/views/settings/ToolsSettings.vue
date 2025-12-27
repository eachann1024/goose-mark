<script setup lang="ts">
import ResultToast from '@/components/ResultToast.vue'
import { probeUrl, type ProbeResult } from '@/services/siteProbe'

const store = useBookmarkStore()

const matching = ref(false)
const probing = ref(false)
const probeResult = ref<ProbeResult[]>([])
const probeTotal = ref(0)
const probeDone = ref(0)

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

const missingCount = computed(() =>
  (Array.isArray(store.bookmarks) ? store.bookmarks : []).filter(b => !b.icon || b.icon.type === 'text').length
)

const copyText = async (text: string) => {
  if (!navigator.clipboard) {
    notify('当前环境不支持剪贴板复制')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    notify('已复制到剪贴板')
  } catch {
    notify('复制失败，请检查权限后重试')
  }
}

const probeReasonText = (reason?: ProbeResult['reason']) => {
  if (!reason) return ''
  const map: Record<NonNullable<ProbeResult['reason']>, string> = {
    invalid_url: '格式错误',
    unsupported_protocol: '不支持',
    template: '模板地址',
    timeout: '超时',
    error: '错误'
  }
  return map[reason]
}

const mapWithConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  if (items.length === 0) return [] as R[]
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  const runner = async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++
      results[idx] = await fn(items[idx])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()))
  return results
}

const matchMissing = async () => {
  if (matching.value) return
  const missing = store.bookmarks.filter(b => !b.icon || b.icon.type === 'text').length
  if (missing === 0) {
    showResultToast({ variant: 'info', title: '没有缺失图标', description: '当前书签图标已齐全' }, 4500)
    return
  }
  matching.value = true
  const started = performance.now()
  try {
    const res = await store.refreshMissingIcons()
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
        title: `图标匹配完成：${res.matched}/${res.total}`,
        description
      },
      res.failList.length > 0 ? 8000 : 5000
    )
  } catch (e) {
    console.error('[Settings] refreshMissingIcons failed:', e)
    showResultToast({ variant: 'error', title: '图标匹配失败', description: '请稍后重试或检查网络/权限' }, 6500)
  } finally {
    matching.value = false
  }
}

const checkInvalid = async () => {
  if (probing.value) return
  const bookmarks = Array.isArray(store.bookmarks) ? store.bookmarks : []
  if (bookmarks.length === 0) {
    showResultToast({ variant: 'info', title: '暂无可检测的书签', description: '先添加书签再进行无效地址分析' }, 4500)
    return
  }
  probing.value = true
  probeResult.value = []
  probeTotal.value = bookmarks.length
  probeDone.value = 0
  const all = bookmarks
  const started = performance.now()
  try {
    const results = await mapWithConcurrency(all, 6, async (bookmark) => {
      try {
        const r = await probeUrl(bookmark.url, 3000)
        probeResult.value.push(r)
        probeDone.value += 1
        return r
      } catch {
        const r = { url: bookmark.url, ok: false, elapsed: 0, reason: 'error' } satisfies ProbeResult
        probeResult.value.push(r)
        probeDone.value += 1
        return r
      }
    })
    const okCount = results.filter(r => r.ok).length
    const fail = results.filter(r => !r.ok)
    const elapsed = Math.round(performance.now() - started)
    const failList = fail.map(r => r.url).join('\n')
    showResultToast(
      {
        variant: fail.length ? 'warning' : 'success',
        title: `无效地址分析完成：${okCount}/${results.length} OK`,
        description: fail.length ? `失败 ${fail.length} 条（耗时 ${elapsed}ms）` : `全部通过（耗时 ${elapsed}ms）`,
        actionLabel: fail.length ? '复制失败列表' : undefined,
        onAction: fail.length ? () => copyText(failList) : undefined
      },
      6500
    )
  } finally {
    probing.value = false
  }
}
</script>

<template>
  <div class="grid gap-6">
    <div class="grid md:grid-cols-2 gap-6">
      <!-- Icon Match -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">图标匹配</CardTitle>
          <CardDescription>缺失图标: <span class="text-primary font-bold">{{ missingCount }}</span> 条</CardDescription>
        </CardHeader>
        <CardContent>
          <Button class="w-full" variant="secondary" :disabled="matching || missingCount === 0" @click="matchMissing">
            <span v-if="matching" class="i-mdi-loading animate-spin mr-2" />
            {{ matching ? '匹配中...' : (missingCount === 0 ? '无需匹配' : '匹配缺失图标') }}
          </Button>
        </CardContent>
      </Card>
      
      <!-- Probe -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">无效地址分析</CardTitle>
          <CardDescription>通过 HEAD/GET 检测链接有效性</CardDescription>
        </CardHeader>
        <CardContent>
          <Button class="w-full" variant="outline" :disabled="probing" @click="checkInvalid">
            <span v-if="probing" class="i-mdi-loading animate-spin mr-2" />
            {{ probing ? `检测中... ${probeDone}/${probeTotal}` : '开始检测' }}
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- Probe Results -->
    <Card v-if="probeResult.length" class="animate-in fade-in slide-in-from-bottom-4">
      <CardHeader>
        <CardTitle>检测结果</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto custom-scroll">
          <div v-for="item in probeResult" :key="item.url" class="rounded-md px-3 py-2 bg-muted/30 flex items-center justify-between border border-border/50">
            <span class="truncate text-sm text-foreground/80 flex-1 mr-4" :title="item.url">{{ item.url }}</span>
            <div class="flex items-center gap-3 shrink-0">
              <span v-if="item.status" class="text-[10px] text-muted-foreground font-mono">HTTP {{ item.status }}</span>
              <span v-if="item.method" class="text-[10px] text-muted-foreground font-mono">{{ item.method }}</span>
              <span class="text-xs text-muted-foreground font-mono">{{ Math.round(item.elapsed) }}ms</span>
              <span
                :class="[
                  item.ok ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
                  'text-[10px] font-bold px-2 py-0.5 rounded border'
                ]"
              >
                {{ item.ok ? 'OK' : (probeReasonText(item.reason) || 'FAIL') }}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

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

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 4px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: var(--radius-sm);
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>
