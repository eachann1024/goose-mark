import { useSettingsStore, WINDOW_HEIGHT_MIN, WINDOW_HEIGHT_MAX } from '@/stores/settings'
import { Ico } from './icon'
import { type ThemePref } from './homeTypes'
import { Seg } from './SettingsControls'

export function SettingsGeneral({ themePref, onThemeChange }: { themePref: ThemePref; onThemeChange?: (pref: ThemePref) => void }) {
  // settings store
  const homeViewMode = useSettingsStore((s) => s.homeViewMode)
  const setHomeViewMode = useSettingsStore((s) => s.setHomeViewMode)
  const density = useSettingsStore((s) => s.density)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const panelContinuous = useSettingsStore((s) => s.panelContinuous)
  const setPanelContinuous = useSettingsStore((s) => s.setPanelContinuous)
  const useUtoolsBrowser = useSettingsStore((s) => s.useUtoolsBrowser)
  const setUseUtoolsBrowser = useSettingsStore((s) => s.setUseUtoolsBrowser)
  const easterEggEnabled = useSettingsStore((s) => s.easterEggEnabled)
  const setEasterEggEnabled = useSettingsStore((s) => s.setEasterEggEnabled)
  const easterEggVariant = useSettingsStore((s) => s.easterEggVariant)
  const setEasterEggVariant = useSettingsStore((s) => s.setEasterEggVariant)
  const windowHeight = useSettingsStore((s) => s.windowHeight)
  const setWindowHeight = useSettingsStore((s) => s.setWindowHeight)

  // 主题：外观 seg 与 HomePage themePref 联动
  const themeSeg: '跟随' | '明亮' | '暗黑' =
    themePref === 'system' ? '跟随' : themePref === 'dark' ? '暗黑' : '明亮'
  const viewSeg: '列表' | '网格' = homeViewMode === 'grid' ? '网格' : '列表'
  const compact = density === 'compact'

  return (
    <>
      <div className="set-section" id="set-general">
        <h2><Ico name="settings" />通用设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">外观主题</div><div className="rd">跟随系统 / 明亮 / 暗黑</div></div>
            <Seg
              opts={['跟随', '明亮', '暗黑']}
              value={themeSeg}
              onChange={(v) => {
                if (v === '暗黑') onThemeChange?.('dark')
                else if (v === '明亮') onThemeChange?.('light')
                else onThemeChange?.('system')
              }}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">默认视图</div><div className="rd">呼出后展示的书签布局</div></div>
            <Seg
              opts={['列表', '网格']}
              value={viewSeg}
              onChange={(v) => setHomeViewMode(v === '网格' ? 'grid' : 'list')}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">紧凑密度</div><div className="rd">减小卡片间距，单屏显示更多</div></div>
            <div
              className={`g-switch${compact ? ' on' : ''}`}
              onClick={() => setDensity(compact ? 'regular' : 'compact')}
            />
          </div>
          {window.utools && (
            <>
              <div className="set-row">
                <div><div className="rt">使用 uTools 内置浏览器</div><div className="rd">默认用系统默认浏览器打开书签，开启后改用 uTools 内置浏览器</div></div>
                <div
                  className={`g-switch${useUtoolsBrowser ? ' on' : ''}`}
                  onClick={() => setUseUtoolsBrowser(!useUtoolsBrowser)}
                />
              </div>
              <div className="set-row">
                <div><div className="rt">面板连贯模式</div><div className="rd">再次唤起时保留所在分组与选中项；关闭则回到默认主页。列表滚动默认始终记住</div></div>
                <div
                  className={`g-switch${panelContinuous ? ' on' : ''}`}
                  onClick={() => setPanelContinuous(!panelContinuous)}
                />
              </div>
              <div className="set-row">
                <div><div className="rt">窗口高度</div><div className="rd">插件展开高度（{WINDOW_HEIGHT_MIN}–{WINDOW_HEIGHT_MAX}px），下次呼出自动恢复</div></div>
                <div className="stepper">
                  <button
                    className="stepper-btn"
                    disabled={windowHeight <= WINDOW_HEIGHT_MIN}
                    onClick={() => setWindowHeight(windowHeight - 20)}
                    aria-label="减小窗口高度"
                  ><Ico name="minus" /></button>
                  <span className="stepper-val">{windowHeight}px</span>
                  <button
                    className="stepper-btn"
                    disabled={windowHeight >= WINDOW_HEIGHT_MAX}
                    onClick={() => setWindowHeight(windowHeight + 20)}
                    aria-label="增大窗口高度"
                  ><Ico name="plus" /></button>
                </div>
              </div>
            </>
          )}
          <div className="set-row">
            <div><div className="rt">背景彩蛋</div><div className="rd">暗黑模式下的动态背景（可选）</div></div>
            <div
              className={`g-switch${easterEggEnabled ? ' on' : ''}`}
              onClick={() => setEasterEggEnabled(!easterEggEnabled)}
            />
          </div>
          {easterEggEnabled && (
            <div className="set-row">
              <div><div className="rt">彩蛋样式</div><div className="rd">星空或黑洞（引力透镜渲染）</div></div>
              <Seg
                opts={['星空', '黑洞']}
                value={easterEggVariant === 'blackhole' ? '黑洞' : '星空'}
                onChange={(v) => setEasterEggVariant(v === '黑洞' ? 'blackhole' : 'starry')}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
