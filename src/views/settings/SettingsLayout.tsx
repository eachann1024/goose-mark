import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  ArrowLeft,
  Settings,
  Sparkles,
  Folder,
  Database,
  CloudUpload,
  Info,
  MessageCircle,
  type LucideIcon
} from 'lucide-react'
import { useFeatureNoticeCenter } from '@/hooks/useFeatureNoticeCenter'
import { useAppTabStore } from '@/hooks/useAppState'
import GeneralSettings from './GeneralSettings'
import AISettings from './AISettings'
import CategoryManager from './CategoryManager'
import DataSettings from './DataSettings'
import LocalModeSettings from './LocalModeSettings'
import AboutSettings from './AboutSettings'

interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
  component: ComponentType
}

const sections: SettingsSection[] = [
  { id: 'general', label: '通用设置', icon: Settings, component: GeneralSettings },
  { id: 'ai', label: 'AI 助手', icon: Sparkles, component: AISettings },
  { id: 'categories', label: '分组管理', icon: Folder, component: CategoryManager },
  { id: 'data', label: '导入与备份', icon: Database, component: DataSettings },
  {
    id: 'local-mode',
    label: '浏览器拓展',
    icon: CloudUpload,
    component: LocalModeSettings
  },
  { id: 'about', label: '帮助与统计', icon: Info, component: AboutSettings }
]

const feedbackUrl = 'https://wj.qq.com/s2/25958391/c92b/'

/**
 * SettingsLayout：设置中心外壳（左侧吸顶 TOC + 右侧垂直滚动各 section + 滚动监听高亮）。
 * 对应旧 Vue views/settings/SettingsLayout.vue，功能等价；无埋点（原 trackEvent 已剥离）。
 */
export default function SettingsLayout() {
  const localModeMenuDotVisible = useFeatureNoticeCenter((f) =>
    f.localModeMenuDotVisible()
  )
  const markLocalModeSettingsVisited = useFeatureNoticeCenter(
    (f) => f.markLocalModeSettingsVisited
  )
  // 返回书签视图（uTools 模式顶部无原生返回，设置页必须自带返回入口）
  const setTab = useAppTabStore((s) => s.setTab)

  const [activeSectionId, setActiveSectionId] = useState('general')
  const isScrollingRef = useRef(false)
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`settings-section-${id}`)
    if (!el) return
    isScrollingRef.current = true
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSectionId(id)
    scrollTimeout.current = setTimeout(() => {
      isScrollingRef.current = false
    }, 600)
  }

  // IntersectionObserver 监听当前可见 section（与旧版 rootMargin/threshold 一致）
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('settings-section-', '')
            setActiveSectionId(id)
            if (id === 'local-mode') markLocalModeSettingsVisited()
            break
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )
    for (const section of sections) {
      const el = document.getElementById(`settings-section-${section.id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [markLocalModeSettingsVisited])

  const openFeedback = () => {
    try {
      if (window.utools?.shellOpenExternal) {
        window.utools.shellOpenExternal(feedbackUrl)
        return
      }
    } catch (error) {
      console.warn('[SettingsLayout] 打开快速反馈失败，尝试浏览器打开', error)
    }
    window.open(feedbackUrl, '_blank')
  }

  return (
    <div className="settings-layout flex h-full min-h-0">
      {/* Sticky TOC Sidebar */}
      <nav className="settings-nav flex w-[158px] shrink-0 flex-col px-2 py-3">
        {/* 返回书签：设置页唯一的返回入口（uTools 模式顶部无原生返回） */}
        <button
          type="button"
          className="settings-back mb-1.5 flex w-full items-center gap-[9px] rounded-[var(--radius-sm)] px-[11px] py-[9px] text-left text-[12.5px] font-semibold"
          onClick={() => setTab('bookmarks')}
        >
          <ArrowLeft className="size-[15px] shrink-0" />
          <span className="truncate">返回书签</span>
        </button>

        <div className="flex-1 space-y-[3px]">
          {sections.map((section) => {
            const Icon = section.icon
            const active = activeSectionId === section.id
            return (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-item flex w-full items-center gap-[9px] px-[11px] py-[9px] text-left text-[12.5px] font-medium ${
                  active ? 'settings-nav-item--active' : 'settings-nav-item--idle'
                }`}
                onClick={() => scrollToSection(section.id)}
              >
                <Icon className="settings-nav-item__icon size-[15px]" />
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{section.label}</span>
                  {section.id === 'local-mode' && localModeMenuDotVisible && (
                    <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
                  )}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="settings-feedback mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-[11px] py-[9px] text-[12.5px] font-semibold"
          onClick={openFeedback}
        >
          <MessageCircle className="size-4" />
          <span>快速反馈</span>
        </button>
      </nav>

      {/* Main Content: all sections laid out vertically */}
      <main className="flex-1 overflow-y-auto px-[30px] pb-[34px] pt-[18px] custom-scroll">
        <div className="w-full max-w-[760px] space-y-6">
          {sections.map((section) => {
            const Icon = section.icon
            const Component = section.component
            return (
              <div
                key={section.id}
                id={`settings-section-${section.id}`}
                className="settings-section"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Icon className="size-[17px] text-muted-foreground/60" />
                  <h2 className="font-serif-title text-[17px] font-semibold text-foreground">
                    {section.label}
                  </h2>
                </div>
                <Component />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
