import { useSettingsStore } from '@/stores/settings'
import { Ico } from './icon'
import { Seg } from './SettingsControls'

export function SettingsDisplay() {
  const gridColumns = useSettingsStore((s) => s.gridColumns)
  const setGridColumns = useSettingsStore((s) => s.setGridColumns)
  const gridIconSize = useSettingsStore((s) => s.gridIconSize)
  const setGridIconSize = useSettingsStore((s) => s.setGridIconSize)
  const listShowDescription = useSettingsStore((s) => s.listShowDescription)
  const setListShowDescription = useSettingsStore((s) => s.setListShowDescription)
  const listFullDescription = useSettingsStore((s) => s.listFullDescription)
  const setListFullDescription = useSettingsStore((s) => s.setListFullDescription)
  const descriptionSelectable = useSettingsStore((s) => s.descriptionSelectable)
  const setDescriptionSelectable = useSettingsStore((s) => s.setDescriptionSelectable)
  const cols = String(gridColumns)
  const iconSizeSeg: '小' | '中' | '大' = gridIconSize === 'small' ? '小' : gridIconSize === 'large' ? '大' : '中'

  return (
    <>
      <div className="set-section" id="set-list">
        <h2><Ico name="list" />列表设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">显示描述</div><div className="rd">在书签条目下方显示描述文字</div></div>
            <div
              className={`g-switch${listShowDescription ? ' on' : ''}`}
              onClick={() => setListShowDescription(!listShowDescription)}
            />
          </div>
          <div className={`set-row${listShowDescription ? '' : ' is-off'}`} aria-disabled={!listShowDescription}>
            <div><div className="rt">完整显示描述</div><div className="rd">描述完整换行展示，不截断为单行省略号</div></div>
            <div
              className={`g-switch${listFullDescription ? ' on' : ''}`}
              onClick={() => listShowDescription && setListFullDescription(!listFullDescription)}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">选中描述</div><div className="rd">hover 浮层仅展示描述，可拖选文字；离开 150ms 后关闭</div></div>
            <div
              className={`g-switch${descriptionSelectable ? ' on' : ''}`}
              onClick={() => setDescriptionSelectable(!descriptionSelectable)}
            />
          </div>
        </div>
      </div>

      <div className="set-section" id="set-grid">
        <h2><Ico name="layout-grid" />网格设置</h2>
        <div className="set-card">
          <div className="set-row">
            <div><div className="rt">网格列数</div><div className="rd">网格视图每行显示的书签数量</div></div>
            <Seg
              opts={['2', '3', '4', '5']}
              value={cols}
              onChange={(v) => setGridColumns(Number(v))}
            />
          </div>
          <div className="set-row">
            <div><div className="rt">图标大小</div><div className="rd">宫格卡片中书签图标的尺寸</div></div>
            <Seg
              opts={['小', '中', '大']}
              value={iconSizeSeg}
              onChange={(v) => setGridIconSize(v === '小' ? 'small' : v === '大' ? 'large' : 'medium')}
            />
          </div>
        </div>
      </div>
    </>
  )
}
