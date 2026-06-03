import { useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import {
  Button,
  SettingsBlock,
  ResultToast,
  type ResultToastState
} from './_ui'
import { getBookmarkMutations } from './_bookmarkActions'

const INITIAL_TOAST: ResultToastState = {
  visible: false,
  variant: 'info',
  title: ''
}

/**
 * ToolsSettings：图标补全工具。
 * 对应旧 Vue views/settings/ToolsSettings.vue，功能等价；无埋点。
 */
export default function ToolsSettings() {
  const skipFailedIconMatch = useSettingsStore((s) => s.skipFailedIconMatch)
  const addIconMatchLog = useSettingsStore((s) => s.addIconMatchLog)
  // 订阅 bookmarks 以便缺失数量随数据变化重算
  const bookmarks = useBookmarkStore((s) => s.bookmarks)

  const [matching, setMatching] = useState(false)
  const [resultToast, setResultToast] =
    useState<ResultToastState>(INITIAL_TOAST)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const forceRematch = !skipFailedIconMatch
  const mutations = useMemo(() => getBookmarkMutations(), [])

  const missingCount = useMemo(
    () => mutations.countMissingIconCandidates(forceRematch),
    // bookmarks 变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forceRematch, bookmarks, mutations]
  )

  const closeResultToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = null
    setResultToast((prev) => ({ ...prev, visible: false }))
  }

  const showResultToast = (
    payload: Omit<ResultToastState, 'visible'>,
    timeoutMs = 4500
  ) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setResultToast({ ...payload, visible: true })
    toastTimer.current = setTimeout(closeResultToast, timeoutMs)
  }

  const matchMissing = async () => {
    if (matching) return
    const missing = mutations.countMissingIconCandidates(forceRematch)
    if (missing === 0) {
      showResultToast(
        {
          variant: 'info',
          title: '没有需要补全的图标',
          description: '当前书签图标已完整'
        },
        4500
      )
      return
    }
    setMatching(true)
    const started = performance.now()
    try {
      const res = await mutations.refreshMissingIcons(forceRematch)
      const elapsed = Math.round(performance.now() - started)

      let description = ''
      if (res.matched > 0) {
        description += `✓ 成功匹配 ${res.matched} 个`
      }
      if (res.failList.length > 0) {
        const failNames = res.failList.slice(0, 5).map((f) => {
          const name =
            f.title.length > 12 ? f.title.slice(0, 12) + '...' : f.title
          return name
        })
        const failStr = failNames.join('、')
        const moreCount =
          res.failList.length > 5 ? ` 等${res.failList.length}个` : ''
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
      addIconMatchLog({
        time: Date.now(),
        scope: 'missing',
        total: res.total,
        success: res.matched,
        failed: res.failList.length,
        failedTitles: res.failList.map((item) => item.title)
      })
    } catch (e) {
      console.error('[Settings] refreshMissingIcons failed:', e)
      showResultToast(
        {
          variant: 'error',
          title: '图标补全失败',
          description: '请稍后重试，或检查网络和权限'
        },
        6500
      )
    } finally {
      setMatching(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsBlock
        title="图标补全"
        desc={
          <>
            待补全图标：
            <span className="font-semibold text-foreground">
              {missingCount}
            </span>{' '}
            个
          </>
        }
      >
        <Button
          className="w-full"
          variant="secondary"
          disabled={matching || missingCount === 0}
          onClick={matchMissing}
        >
          {matching && <Loader2 className="mr-2 size-4 animate-spin" />}
          {matching
            ? '补全中...'
            : missingCount === 0
              ? '已全部补全'
              : '一键补全图标'}
        </Button>
      </SettingsBlock>

      <ResultToast
        open={resultToast.visible}
        variant={resultToast.variant}
        title={resultToast.title}
        description={resultToast.description}
        actionLabel={resultToast.actionLabel}
        onClose={closeResultToast}
        onAction={resultToast.onAction}
      />
    </div>
  )
}
