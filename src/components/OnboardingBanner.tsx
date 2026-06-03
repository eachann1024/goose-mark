import { useRef } from 'react'
import { BookmarkPlus, Download, Upload, X } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings'

/**
 * OnboardingBanner（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue 引导横幅：未关闭时显示，导入/导出书签，关闭后写 settings。
 * settingsStore.onboardingDismissed / dismissOnboarding 复用。uTools 环境优先
 * 原生文件选择器 + readFileSync/fs 回退，逻辑完整保留。i-ph-* 改 lucide-react。
 */
export interface OnboardingBannerProps {
  onImport: (file: File) => void
  onExport: () => void
}

export function OnboardingBanner({ onImport, onExport }: OnboardingBannerProps) {
  const onboardingDismissed = useSettingsStore((s) => s.onboardingDismissed)
  const dismissOnboarding = useSettingsStore((s) => s.dismissOnboarding)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (onboardingDismissed) return null

  const triggerImport = async () => {
    const fallbackToInput = () => fileInputRef.current?.click()

    // uTools 环境优先使用原生文件选择器
    if (window.utools?.showOpenDialog) {
      try {
        const paths = await window.utools.showOpenDialog({
          title: '选择书签文件',
          properties: ['openFile']
        })

        const selectedPath = paths?.[0]
        if (!selectedPath) return

        const fileName = selectedPath.split(/[\\/]/).pop() || 'bookmarks.html'
        let content: string | undefined

        try {
          content = window.utools.readFileSync?.(selectedPath, 'utf-8')
        } catch (e) {
          console.warn('[Onboarding] uTools readFileSync failed:', e)
        }

        // 部分环境 uTools 不暴露 readFileSync，尝试回退到 Node fs
        if (typeof content !== 'string') {
          try {
            const fs = window.require?.('fs') as
              | { readFileSync?: (path: string, encoding: string) => unknown }
              | undefined
            const raw = fs?.readFileSync?.(selectedPath, 'utf-8')
            if (typeof raw === 'string') {
              content = raw
            } else if (
              raw &&
              typeof (raw as { toString?: (encoding?: string) => string }).toString === 'function'
            ) {
              content = (raw as { toString: (encoding?: string) => string }).toString('utf-8')
            }
          } catch (e) {
            console.warn('[Onboarding] fs readFileSync fallback failed:', e)
          }
        }

        if (typeof content === 'string') {
          const file = new File([content], fileName, {
            type: fileName.toLowerCase().endsWith('.json') ? 'application/json' : 'text/html'
          })
          onImport(file)
          return
        }

        window.utools?.showNotification?.('读取文件失败，请重新选择')
        fallbackToInput()
      } catch (e) {
        console.error('[Onboarding] triggerImport failed:', e)
        fallbackToInput()
      }
      return
    }

    // Web 环境回退到 input
    fallbackToInput()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (file) onImport(file)
    input.value = ''
  }

  return (
    <div className="onboarding-banner rounded-xl border p-5 mb-4">
      <div className="flex items-start gap-4">
        <div className="onboarding-banner__icon shrink-0 w-12 h-12 rounded-xl flex items-center justify-center">
          <BookmarkPlus className="size-6 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground mb-1">欢迎使用《鹅的书签》✨</h3>
          <p className="text-sm text-muted-foreground mb-2">
            导入已有数据可以直接开始使用：支持浏览器导出的 HTML、鹅的书签备份 JSON、网址精灵导出的
            data.json。
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            导入浏览器 HTML，由于只支持两层文件夹结构，所以后续导入的书签会被合并到根文件夹下。
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={triggerImport}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Download className="size-4" />
              导入书签
            </button>
            <button
              type="button"
              onClick={onExport}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-muted/35 text-xs text-foreground shadow-sm hover:bg-muted/60 transition-colors"
            >
              <Upload className="size-4" />
              导出书签
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
          </div>
        </div>

        <button
          type="button"
          onClick={dismissOnboarding}
          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

export default OnboardingBanner
