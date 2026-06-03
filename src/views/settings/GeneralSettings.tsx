import { Moon } from 'lucide-react'
import { ACCENT_PRESETS } from '@/constants/accent'
import { useSettingsStore } from '@/stores/settings'
import { useAppState } from '@/hooks/useAppState'
import { Button, Switch, SettingsBlock, SettingsRow } from './_ui'
import type { ViewMode, Density } from '@/stores/settings'

const viewModeOptions: Array<{ value: ViewMode; label: string }> = [
  { value: 'list', label: '列表' },
  { value: 'grid', label: '卡片' },
  { value: 'cards', label: '画报' }
]

// 搜索结果仅支持列表 / 卡片两态（画报模式仅主页可用）
const searchViewModeOptions: Array<{ value: 'list' | 'grid'; label: string }> = [
  { value: 'list', label: '列表' },
  { value: 'grid', label: '卡片' }
]

const densityOptions: Array<{ value: Density; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'regular', label: '常规' },
  { value: 'comfy', label: '舒适' }
]

const gridColumnsOptions = [2, 3, 4, 5]

/**
 * GeneralSettings：通用设置（视图 / 强调色 / 外观 / 窗口行为）。
 * 对应旧 Vue views/settings/GeneralSettings.vue，功能等价；无埋点。
 */
export default function GeneralSettings() {
  const s = useSettingsStore()
  const { isUTools, isDark } = useAppState()

  return (
    <div className="flex flex-col gap-3">
      {/* 视图 */}
      <SettingsBlock
        title="视图"
        desc="控制主页和搜索结果默认使用列表还是卡片模式"
      >
        <div className="space-y-4">
          <SettingsRow
            label="主页默认展示"
            hint="打开书签页时，默认进入的内容布局"
          >
            <div className="flex shrink-0 gap-2">
              {viewModeOptions.map((opt) => (
                <Button
                  key={`home-${opt.value}`}
                  size="sm"
                  variant={s.homeViewMode === opt.value ? 'default' : 'ghost'}
                  className="h-8 min-w-16 px-3"
                  onClick={() => s.setHomeViewMode(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="搜索结果默认展示"
            hint="进入搜索结果浮层时，默认展示方式会被记住"
          >
            <div className="flex shrink-0 gap-2">
              {searchViewModeOptions.map((opt) => (
                <Button
                  key={`search-${opt.value}`}
                  size="sm"
                  variant={s.searchViewMode === opt.value ? 'default' : 'ghost'}
                  className="h-8 min-w-16 px-3"
                  onClick={() => s.setSearchViewMode(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow label="卡片每行数量" hint="仅卡片模式生效">
            <div className="flex shrink-0 gap-1.5">
              {gridColumnsOptions.map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant={s.gridColumns === opt ? 'default' : 'ghost'}
                  className="h-8 w-10 shrink-0 px-0"
                  onClick={() => s.setGridColumns(opt)}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="默认收起详情栏"
            hint="列表模式下，点击直接打开书签而不先展示详情"
          >
            <Switch
              checked={s.previewPanelCollapsed}
              aria-label="默认收起详情栏"
              onChange={(checked) => s.setPreviewPanelCollapsed(checked)}
            />
          </SettingsRow>

          <SettingsRow
            label="信息密度"
            hint="控制列表/卡片中书签条目的行高与间距"
          >
            <div className="flex shrink-0 gap-2">
              {densityOptions.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={s.density === opt.value ? 'default' : 'ghost'}
                  className="h-8 min-w-16 px-3"
                  onClick={() => s.setDensity(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </SettingsRow>
        </div>
      </SettingsBlock>

      {/* 强调色 */}
      <SettingsBlock
        title="强调色"
        desc="主操作按钮、选中状态、链接等使用的颜色"
      >
        <SettingsRow label="主题颜色" hint="选中项目将带有环形描边高亮">
          <div className="flex shrink-0 gap-2.5">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                className="accent-swatch"
                style={{
                  background: preset.swatch,
                  boxShadow:
                    s.accentColor === preset.id
                      ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${preset.swatch}`
                      : 'none'
                }}
                onClick={() => s.setAccentColor(preset.id)}
              />
            ))}
          </div>
        </SettingsRow>
      </SettingsBlock>

      {/* 外观（仅深色模式） */}
      {isDark && (
        <SettingsBlock title="外观" desc="控制深色模式下的背景显示效果">
          <div className="flex gap-3">
            <Button
              variant={!s.useSolidBackground ? 'default' : 'ghost'}
              className="h-auto flex-1 justify-start gap-3 px-4 py-3"
              onClick={() => s.setUseSolidBackground(false)}
            >
              <div className="sky-preview shrink-0" aria-hidden="true">
                <span className="sky-preview__main" />
                <span className="sky-preview__dot sky-preview__dot--1" />
                <span className="sky-preview__dot sky-preview__dot--2" />
                <span className="sky-preview__dot sky-preview__dot--3" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">星空背景</div>
                <div className="text-xs text-muted-foreground">
                  旋转星点与随机流星
                </div>
              </div>
            </Button>
            <Button
              variant={s.useSolidBackground ? 'default' : 'ghost'}
              className="h-auto flex-1 justify-start gap-3 px-4 py-3"
              onClick={() => s.setUseSolidBackground(true)}
            >
              <div
                className="background-preview background-preview--dark shrink-0"
                aria-hidden="true"
              >
                <Moon className="size-5 text-white/85" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">纯色背景</div>
                <div className="text-xs text-muted-foreground">
                  沉浸纯净，更聚焦内容
                </div>
              </div>
            </Button>
          </div>
        </SettingsBlock>
      )}

      {/* 窗口行为（仅 uTools） */}
      {isUTools && (
        <SettingsBlock title="窗口行为" desc="控制独立窗口的关闭方式">
          <SettingsRow
            label="独立窗口自动关闭"
            hint="独立窗口打开书签后自动关闭当前窗口"
          >
            <Switch
              checked={s.autoCloseWindow}
              aria-label="独立窗口自动关闭"
              onChange={(checked) => s.setAutoCloseWindow(checked)}
            />
          </SettingsRow>
        </SettingsBlock>
      )}
    </div>
  )
}
