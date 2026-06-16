/**
 * AboutPage — 帮助与统计跳页
 * 展示版本信息、使用统计数据、反馈入口
 */
import { useMemo } from 'react'
import { useStatsStore } from '@/stores/stats'
import { useBookmarkStore } from '@/stores/bookmark'
import { Ico } from './icon'

interface AboutPageProps {
  onBack: () => void
  onToast?: (title?: string) => void
}

export default function AboutPage({ onBack, onToast }: AboutPageProps) {
  const usageEvents = useStatsStore((s) => s.usageEvents)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const groups = useBookmarkStore((s) => s.groups)

  const stats = useMemo(() => {
    const opens = usageEvents.filter((e) => e.type === 'open').length
    const clicks = usageEvents.filter((e) => e.type === 'click').length
    const adds = usageEvents.filter((e) => e.type === 'add').length

    // 最近 7 天点击数
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentClicks = usageEvents.filter(
      (e) => e.type === 'click' && e.timestamp >= sevenDaysAgo
    ).length

    // 最常用书签（点击次数最多的前 3 个）
    const clickCount: Record<string, number> = {}
    for (const e of usageEvents) {
      if (e.type === 'click' && e.bookmarkId) {
        clickCount[e.bookmarkId] = (clickCount[e.bookmarkId] ?? 0) + 1
      }
    }
    const topIds = Object.entries(clickCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ id, count }))
    const topBookmarks = topIds.map(({ id, count }) => ({
      bookmark: bookmarks.find((b) => b.id === id),
      count,
    })).filter((x) => x.bookmark)

    // 分组数量（不含回收站）
    const groupCount = groups.filter((g) => g.id !== '__trash__').length
    const subGroupCount = groups
      .filter((g) => g.id !== '__trash__')
      .reduce((acc, g) => acc + g.children.length, 0)

    return { opens, clicks, adds, recentClicks, topBookmarks, groupCount, subGroupCount }
  }, [usageEvents, bookmarks, groups])

  const handleCopyEmail = () => {
    navigator.clipboard.writeText('each1026@gmail.com').then(() => {
      onToast?.('邮箱已复制：each1026@gmail.com')
    }).catch(() => {
      onToast?.('反馈邮箱：each1026@gmail.com')
    })
  }

  return (
    <div className="formpage" style={{ display: 'flex' }}>
      <div className="form-head">
        <button className="back-btn" onClick={onBack}>
          <Ico name="arrow-left" />
        </button>
        <span className="ic"><Ico name="info" /></span>
        <h1>帮助与统计</h1>
      </div>
      <div className="form-body" style={{ overflow: 'auto', flex: 1 }}>
        <div className="set-wrap" style={{ padding: '24px 0', gap: 24 }}>

          <div className="set-section">
            <h2><Ico name="bar-chart-2" />使用统计</h2>
            <div className="set-card">
              <div className="set-row">
                <div><div className="rt">书签总数</div><div className="rd">当前库中的书签数量</div></div>
                <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{bookmarks.length}</span>
              </div>
              <div className="set-row">
                <div><div className="rt">分组 / 子分组</div><div className="rd">当前的分类层级</div></div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{stats.groupCount} / {stats.subGroupCount}</span>
              </div>
              <div className="set-row">
                <div><div className="rt">累计打开次数</div><div className="rd">插件被唤起的总次数</div></div>
                <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{stats.opens}</span>
              </div>
              <div className="set-row">
                <div><div className="rt">累计点击书签</div><div className="rd">所有书签被打开的总次数</div></div>
                <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{stats.clicks}</span>
              </div>
              <div className="set-row">
                <div><div className="rt">近 7 天点击</div><div className="rd">最近一周内打开书签的次数</div></div>
                <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{stats.recentClicks}</span>
              </div>
              <div className="set-row">
                <div><div className="rt">新增书签</div><div className="rd">通过插件保存的书签次数</div></div>
                <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{stats.adds}</span>
              </div>
            </div>
          </div>

          {stats.topBookmarks.length > 0 && (
            <div className="set-section">
              <h2><Ico name="flame" />最常用书签</h2>
              <div className="set-card">
                {stats.topBookmarks.map(({ bookmark, count }, i) => (
                  bookmark && (
                    <div key={bookmark.id} className="set-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ fontSize: 12, color: 'var(--fg-faint)', width: 16, textAlign: 'center', flexShrink: 0 }}>#{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="rt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bookmark.title || bookmark.url}</div>
                          <div className="rd" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bookmark.url}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{count} 次</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <div className="set-section">
            <h2><Ico name="info" />关于</h2>
            <div className="set-card">
              <div className="set-row">
                <div><div className="rt">版本</div><div className="rd">鹅的书签 · goose-marks</div></div>
                <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>v0.1.0</span>
              </div>
              <div className="set-row">
                <div><div className="rt">技术栈</div><div className="rd">React 19 · Zustand · Tailwind v4 · uTools</div></div>
              </div>
            </div>
          </div>

          <div className="set-section">
            <h2><Ico name="message-square" />反馈</h2>
            <div className="set-card">
              <div className="set-row set-row-link" style={{ cursor: 'pointer' }} onClick={handleCopyEmail}>
                <div>
                  <div className="rt">发送邮件反馈</div>
                  <div className="rd">each1026@gmail.com · 点击复制</div>
                </div>
                <Ico name="copy" style={{ color: 'var(--fg-faint)', fontSize: 16, flexShrink: 0 }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
