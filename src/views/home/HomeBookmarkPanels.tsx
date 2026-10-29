import type * as React from 'react'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import type { Group } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import { type HomeGroup, type HomeItem } from './viewModel'
import SidebarNav from './SidebarNav'
import { Fav, BookmarkCard } from './BookmarkCard'
import { bookmarkCollision } from './BookmarkDragParts'
import { SearchResultsSurface } from './SearchResultsSurface'
import { ListContent } from './ListContent'
import { GridContent } from './GridContent'
import { TrashContent } from './TrashContent'
import { type HomeNavigationBindings, type HomeSearchBindings, type HomeBookmarkBindings } from './homeInteractionTypes'
import type { SearchViewMode } from '@/stores/settings'
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core'
import type { ViewMode } from './homeTypes'
import { Ico } from './icon'

export function HomeBookmarkPanels({
  isSearching,
  dndSensors,
  handleDndDragStart,
  handleDndDragEnd,
  homeGroups,
  activeGroupId,
  activeSubId,
  screen,
  setActiveSubId,
  centerSidebar,
  setScreen,
  view,
  scrollToSection,
  fireToast,
  handleActiveSubIdFix,
  sidebarCenterSignal,
  groups,
  contentRef,
  searchViewMode,
  openCtx,
  searchVal,
  searchResultItems,
  searchGroups,
  gridColumns,
  selectedId,
  universalFallbackItems,
  aiCreateItem,
  setSearchViewMode,
  setSelectedId,
  openHomeItem,
  clearSearch,
  keptGroups,
  activeDragItem,
  onViewChange,
  onInspect,
}: Pick<HomeNavigationBindings, 'activeGroupId' | 'activeSubId' | 'screen' | 'setActiveSubId' | 'setScreen' | 'view' | 'selectedId' | 'setSelectedId'> &
  Pick<HomeSearchBindings, 'isSearching' | 'searchViewMode' | 'searchVal' | 'clearSearch'> &
  Pick<HomeBookmarkBindings, 'homeGroups' | 'fireToast' | 'openHomeItem'> & {
  dndSensors: SensorDescriptor<SensorOptions>[]
  handleDndDragStart: (event: DragStartEvent) => void
  handleDndDragEnd: (event: DragEndEvent) => void
  centerSidebar: () => void
  scrollToSection: (groupId: string, subId: string) => void
  handleActiveSubIdFix: (subId: string, groupId: string) => void
  sidebarCenterSignal: number
  groups: Group[]
  contentRef: React.RefObject<HTMLDivElement | null>
  openCtx: (e: React.MouseEvent) => void
  searchResultItems: HomeItem[]
  searchGroups: HomeGroup[]
  gridColumns: number
  universalFallbackItems: HomeItem[]
  aiCreateItem: HomeItem | null
  setSearchViewMode: (mode: SearchViewMode) => void
  keptGroups: HomeGroup[]
  activeDragItem: HomeItem | null
  onViewChange: (view: ViewMode) => void
  onInspect: (item: HomeItem) => void
}) {
  const activeGroup = homeGroups.find((g) => g.id === activeGroupId) ?? homeGroups[0]
  const subCount = activeGroup?.subs.length ?? 0
  const bookmarkCount = activeGroup?.subs.reduce((sum, sub) => sum + sub.items.length, 0) ?? 0
  const openMore = (e: React.MouseEvent, item: HomeItem) => {
    setSelectedId(item.id)
    openCtx(e)
  }
  return (
    <div className={`app-main${isSearching ? ' is-searching' : ''}`}>
          <DndContext
            sensors={dndSensors}
            collisionDetection={bookmarkCollision}
            onDragStart={handleDndDragStart}
            onDragEnd={handleDndDragEnd}
          >
          {/* Sidebar：搜索态隐藏，内容区占满全宽 */}
          {!isSearching && (
            <SidebarNav
              homeGroups={homeGroups}
              activeGroupId={activeGroupId}
              activeSubId={activeSubId}
              screen={screen}
              onOpenGroups={() => setScreen('groups')}
              onOpenTrash={() => setScreen('trash')}
              onSubClick={(groupId, subId) => {
                setActiveSubId(subId)
                centerSidebar() // 主动点击 → 侧栏高亮居中
                // 同步 store，让 MCP create_bookmark fallback 位置与界面一致
                useBookmarkStore.getState().selectGroup(groupId, subId)
                // 回收站中点侧栏 = 切回书签视图
                if (screen === 'trash') setScreen(view)
                // 列表 / 网格视图都滚动到对应分组段
                if (view === 'list' || view === 'grid') scrollToSection(groupId, subId)
              }}
              fireToast={fireToast}
              onActiveSubIdFix={handleActiveSubIdFix}
              centerSignal={sidebarCenterSignal}
            />
          )}

          {/* Center */}
          <div className="center">
            {screen !== 'trash' && !isSearching && (
              <div className="content-bar">
                <h1>{activeGroup?.name || '书签'}</h1>
                <span className="sum">{subCount} 个子分组 · {bookmarkCount} 个书签</span>
                <div className="seg" role="group" aria-label="视图">
                  <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => onViewChange('grid')}>
                    <Ico name="layout-grid" />宫格
                  </button>
                  <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => onViewChange('list')}>
                    <Ico name="list" />列表
                  </button>
                </div>
              </div>
            )}
            {screen === 'trash' ? (
              <TrashContent
                groups={groups}
                onToast={fireToast}
              />
            ) : isSearching ? (
              <div
                ref={contentRef}
                className="content search-content"
                data-view={searchViewMode}
                data-search-view={searchViewMode}
                tabIndex={-1}
                onContextMenu={openCtx}
              >
                <SearchResultsSurface
                  query={searchVal.trim()}
                  items={searchResultItems}
                  groups={searchGroups}
                  viewMode={searchViewMode}
                  columns={gridColumns}
                  selectedId={selectedId}
                  universalItems={universalFallbackItems}
                  aiItem={aiCreateItem}
                  onViewModeChange={setSearchViewMode}
                  onSelect={setSelectedId}
                  onOpen={openHomeItem}
                  onInspect={onInspect}
                  onMore={openMore}
                  onClear={clearSearch}
                />
              </div>
            ) : (
              <>
                {keptGroups.map((group) => {
                  const isActivePanel = group.id === (activeGroupId || keptGroups[0]?.id)
                  return (
                    <div
                      key={group.id}
                      ref={isActivePanel ? contentRef : undefined}
                      className="content"
                      data-view={view}
                      data-group-id={group.id}
                      // 非当前分组隐藏但保持挂载：图标不重载、滚动位置自然保留
                      hidden={!isActivePanel}
                      style={isActivePanel ? undefined : { display: 'none' }}
                      tabIndex={isActivePanel ? -1 : undefined}
                      onContextMenu={isActivePanel ? openCtx : undefined}
                    >
                      {view === 'grid' ? (
                        <GridContent
                          groups={[group]}
                          columns={gridColumns}
                          selectedId={selectedId}
                          onSelect={setSelectedId}
                          onOpen={openHomeItem}
                          onInspect={onInspect}
                          onMore={openMore}
                        />
                      ) : (
                        <ListContent
                          groups={[group]}
                          selectedId={selectedId}
                          onSelect={setSelectedId}
                          onOpen={openHomeItem}
                          onInspect={onInspect}
                          onMore={openMore}
                        />
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragItem ? (
              (isSearching ? searchViewMode === 'grid' : view === 'grid') ? (
                <div className="gcard drag-overlay">
                  <Fav item={activeDragItem} />
                  <div className="meta">
                    <div className="ttl">{activeDragItem.ttl}</div>
                    <div className="dsc">{activeDragItem.dsc || activeDragItem.host}</div>
                  </div>
                </div>
              ) : (
                <div className="drag-overlay">
                  <BookmarkCard item={activeDragItem} />
                </div>
              )
            ) : null}
          </DragOverlay>
          </DndContext>
        </div>
  )
}
