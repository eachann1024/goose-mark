import { useMemo, type ReactNode } from 'react'
import { Bookmark, FolderOpen, Info } from 'lucide-react'
import { useBookmarkStore } from '@/stores/bookmark'
import { useStatsStore } from '@/stores/stats'
import { useAppState } from '@/hooks/useAppState'
import { SettingsBlock } from './_ui'
import ToolsSettings from './ToolsSettings'

/**
 * 帮助提示卡片（替代旧 Vue FaqNotice.vue）。
 */
function FaqNotice({
  title,
  description
}: {
  title: ReactNode
  description: ReactNode
}) {
  return (
    <div className="rounded-xl bg-white p-4 text-sm text-muted-foreground dark:bg-[hsl(var(--card))]">
      <div className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
        <Info className="size-5 shrink-0 text-muted-foreground" />
        <span>{title}</span>
      </div>
      <p className="whitespace-pre-line leading-relaxed">{description}</p>
    </div>
  )
}

/**
 * AboutSettings：帮助与统计（使用技巧 + 本地数据看板 + 七天本地使用趋势 + 图标工具）。
 * 对应旧 Vue views/settings/AboutSettings.vue。
 * 说明：已按要求移除任何埋点/统计上报；此处“七天趋势”仅读取本地 stats store 的
 * usageEvents（纯本地展示，无任何对外上报）。
 */
export default function AboutSettings() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const groups = useBookmarkStore((s) => s.groups)
  const usageEvents = useStatsStore((s) => s.usageEvents)
  const { isMac } = useAppState()

  const weekTrend = useMemo(() => {
    const days: { date: string; label: string; clicks: number }[] = []
    const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = weekLabels[d.getDay()]
      const clicks = usageEvents.filter(
        (e) => e.type === 'click' && e.timestamp.startsWith(dateStr)
      ).length
      days.push({ date: dateStr, label, clicks })
    }
    return days
  }, [usageEvents])

  const maxClicks = useMemo(
    () => Math.max(...weekTrend.map((d) => d.clicks), 1),
    [weekTrend]
  )

  const today = new Date().toISOString().slice(0, 10)
  const noClicks = maxClicks === 1 && weekTrend.every((d) => d.clicks === 0)

  return (
    <div className="flex flex-col gap-3">
      <FaqNotice
        title="使用技巧"
        description={`· 直接输入即可搜索，无需点击搜索按钮
 · 按 ${isMac ? '⌘' : 'Ctrl'}+数字键 快速打开对应书签，按住 ${
   isMac ? 'Option' : 'Alt'
 } 显示序号，配合数字键快速打开书签
 · 拖拽书签到侧边栏可移动到其他子分组
 · 🚀 模板书签：URL 含 {query} 的书签可快捷搜索，开启万能匹配后可直接在主输入框里匹配`}
      />

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="settings-block"
          style={{ gap: '0.5rem', padding: '0.875rem 1rem' }}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Bookmark className="size-5" />
            <span className="text-xs font-medium">书签总数</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {bookmarks.length}
          </p>
        </div>
        <div
          className="settings-block"
          style={{ gap: '0.5rem', padding: '0.875rem 1rem' }}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderOpen className="size-5" />
            <span className="text-xs font-medium">分组数量</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{groups.length}</p>
        </div>
      </div>

      {/* 七天趋势（本地） */}
      <SettingsBlock title="七天使用趋势">
        <div className="flex h-32 items-end justify-between gap-2">
          {weekTrend.map((day) => (
            <div
              key={day.date}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {day.clicks}
              </span>
              <div
                className={`w-full rounded-t-md transition-all duration-300 ${
                  day.date === today ? 'bg-foreground/55' : 'bg-foreground/18'
                }`}
                style={{
                  height: `${Math.max((day.clicks / maxClicks) * 100, 4)}%`
                }}
              />
              <span className="text-xs text-muted-foreground">{day.label}</span>
            </div>
          ))}
        </div>
        {noClicks && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            暂无点击数据，开始使用书签后将记录统计
          </p>
        )}
      </SettingsBlock>

      <ToolsSettings />
    </div>
  )
}
