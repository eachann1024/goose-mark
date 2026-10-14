import type * as React from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { InstantTooltip } from '@/components/ui/overflow-tooltip'
import { deferInlineRenameCommit, handleInlineRenameEnter } from '@/lib/inlineEditKeys'
import { Ico } from './icon'
import { type HomeGroup } from './viewModel'
import { type SearchSurface } from './homeRuntime'
import { type Screen } from './homeTypes'
import { SortableTab } from './BookmarkDragParts'
import { type HomeAggressivePanelOpener, type HomeSearchBindings } from './homeInteractionTypes'
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core'

export function HomeHeader({
  tabSensors,
  handleTabDragEnd,
  homeGroups,
  tabRenaming,
  tabRenameRef,
  tabRenameVal,
  setTabRenameVal,
  commitTabRename,
  setTabRenaming,
  isSearching,
  screen,
  activeGroupId,
  clearSearch,
  changeActiveGroup,
  openTabCtx,
  tabAdding,
  tabAddRef,
  tabAddVal,
  setTabAddVal,
  commitTabAdd,
  setTabAdding,
  startTabAdd,
  searchSurface,
  headerSearchRef,
  searchVal,
  applySearchVal,
  aiAggressiveSaveEnabled,
  aiEnabled,
  openAggressiveSavePanel,
  openNewBookmarkForm,
  avatarRef,
  paOpen,
  setPaOpen
}: Pick<HomeSearchBindings, 'isSearching' | 'clearSearch' | 'searchVal' | 'applySearchVal'> & {
  tabSensors: SensorDescriptor<SensorOptions>[]
  handleTabDragEnd: (event: DragEndEvent) => void
  homeGroups: HomeGroup[]
  tabRenaming: string | null
  tabRenameRef: React.RefObject<HTMLInputElement | null>
  tabRenameVal: string
  setTabRenameVal: React.Dispatch<React.SetStateAction<string>>
  commitTabRename: () => void
  setTabRenaming: React.Dispatch<React.SetStateAction<string | null>>
  activeGroupId: string
  screen: Screen
  changeActiveGroup: (groupId: string) => void
  openTabCtx: (e: React.MouseEvent, groupId: string) => void
  tabAdding: boolean
  tabAddRef: React.RefObject<HTMLInputElement | null>
  tabAddVal: string
  setTabAddVal: React.Dispatch<React.SetStateAction<string>>
  commitTabAdd: () => void
  setTabAdding: React.Dispatch<React.SetStateAction<boolean>>
  startTabAdd: () => void
  searchSurface: SearchSurface
  headerSearchRef: React.RefObject<HTMLInputElement | null>
  aiAggressiveSaveEnabled: boolean
  aiEnabled: boolean
  openAggressiveSavePanel: HomeAggressivePanelOpener
  openNewBookmarkForm: () => void
  avatarRef: React.RefObject<HTMLButtonElement | null>
  paOpen: boolean
  setPaOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <header className="app-header">
          {/* 一级分组 Tab 栏（可拖拽排序 + 右键管理） */}
          <DndContext sensors={tabSensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
            <SortableContext items={homeGroups.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
              <div className="group-tabs">
                {homeGroups.map((g) =>
                  tabRenaming === g.id ? (
                    <input
                      key={g.id}
                      ref={tabRenameRef}
                      className="group-tab-rename"
                      value={tabRenameVal}
                      onChange={(e) => setTabRenameVal(e.target.value)}
                      onKeyDown={(e) => {
                        handleInlineRenameEnter(e, commitTabRename)
                        if (e.key === 'Escape') setTabRenaming(null)
                      }}
                      onBlur={() => deferInlineRenameCommit(commitTabRename)}
                    />
                  ) : (
                    <SortableTab
                      key={g.id}
                      id={g.id}
                      name={g.name}
                      isActive={screen !== 'settings' && screen !== 'groups' && !isSearching && activeGroupId === g.id}
                      onTabClick={() => {
                        if (isSearching) clearSearch()
                        changeActiveGroup(g.id)
                      }}
                      onTabContextMenu={(e) => openTabCtx(e, g.id)}
                    />
                  )
                )}
                {/* 新建主分组：+ 虚线胶囊 → 就地内联输入 */}
                {tabAdding ? (
                  <input
                    ref={tabAddRef}
                    className="group-tab-rename"
                    placeholder="分组名称…"
                    value={tabAddVal}
                    onChange={(e) => setTabAddVal(e.target.value)}
                    onKeyDown={(e) => {
                      handleInlineRenameEnter(e, commitTabAdd)
                      if (e.key === 'Escape') setTabAdding(false)
                    }}
                    onBlur={() => deferInlineRenameCommit(commitTabAdd)}
                  />
                ) : (
                  <button className="tab-add" title="新建分组" onClick={startTabAdd}>
                    <Ico name="plus" />
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
          {/* 搜索框：仅浏览器独立调试显示；uTools（含独立窗）由顶部原生搜索承接 */}
          {searchSurface === 'inline' && (
            <div className="header-search">
              <Ico name="search" />
              <input
                ref={headerSearchRef}
                type="text"
                placeholder="搜索书签…"
                value={searchVal}
                onChange={(e) => applySearchVal(e.target.value)}
              />
              {isSearching && (
                <button className="search-clear" title="清空搜索 (Esc)" onClick={clearSearch}>
                  <Ico name="x" />
                </button>
              )}
            </div>
          )}
          {/* 方案 A：AI 保存开启时主操作独占胶囊；收集/设置仅图标
              InstantTooltip：0 延迟 + portal，顶栏优先向下，不够再自动翻面 */}
          <div className="header-actions">
            {aiAggressiveSaveEnabled && aiEnabled ? (
              <>
                <InstantTooltip label="AI 快速保存：粘贴网址自动归类">
                  <button
                    type="button"
                    className="collect-btn ag-collect-btn"
                    onClick={() => openAggressiveSavePanel()}
                  >
                    <Ico name="sparkles" />
                    AI 快速保存
                  </button>
                </InstantTooltip>
                <InstantTooltip label="手动收集">
                  <button
                    type="button"
                    className="header-icon-btn"
                    onClick={openNewBookmarkForm}
                  >
                    <Ico name="plus" />
                  </button>
                </InstantTooltip>
              </>
            ) : (
              <InstantTooltip label="手动填写网址与分组">
                <button
                  type="button"
                  className="collect-btn"
                  onClick={openNewBookmarkForm}
                >
                  <Ico name="plus" />
                  收集
                </button>
              </InstantTooltip>
            )}
            <InstantTooltip label="设置">
              <button
                type="button"
                ref={avatarRef}
                className={`header-icon-btn${paOpen ? ' on' : ''}`}
                aria-expanded={paOpen}
                onClick={() => setPaOpen((o) => !o)}
              >
                <Ico name="settings" />
              </button>
            </InstantTooltip>
          </div>
        </header>
  )
}
