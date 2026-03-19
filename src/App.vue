<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { useSync } from '@/composables/useSync'
import { onUnmounted } from 'vue'

import type { Bookmark, Group, SubGroup } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import OnboardingBanner from '@/components/OnboardingBanner.vue'
import QuickSaveDialog from '@/components/QuickSaveDialog.vue'
import { parseHtmlBookmarks, isHtmlBookmarkFile } from '@/lib/htmlBookmarkParser'
import { resolveBookmarkLaunchUrl } from '@/lib/utils'
import { ensureIconForBookmark, fetchPageMeta } from '@/services/iconCache'
import { parseJsonImportText, applyImportDataToStore } from '@/composables/useImportExport'

// Stores
const store = useBookmarkStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const { toastState, closeToast, showToast, tooltipProviderKey, onMainViewSwitch } = useUIManager()

// Composables
const { tab, isDark, toggleDark, isUTools, isMac } = useAppState()
const { isSyncing, syncError } = useSync()
const { generateMetadata } = useAI()
const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu()
const {
  openBookmarkLink: originalOpenBookmarkLink,
  openUrl,
  openUrlInUtoolsBrowser,
  copyBookmarkUrl,
  handleRemove,
  confirmDelete,
  emptyTrash,
  handleReorder,
  showDeleteConfirm,
  confirmDeleteId,
  getTemplateLabel
} = useBookmarkOperations()

const openBookmarkLink = (bookmark: Bookmark) => {
  originalOpenBookmarkLink(bookmark, { useUiQuery: false })
}

// 暂停/恢复 watcher 的标记
const isSyncPaused = ref(false)

const UTOOLS_PLUGIN_ENTER_EVENT = 'goose-marks:plugin-enter'
const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
const UTOOLS_SEARCH_INPUT_EVENT = 'goose-marks:utools-search'
const UTOOLS_SEARCH_SYNC_EVENT = 'goose-marks:utools-search-sync'
const UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT = 'goose-marks:restore-default-search-input'


const {
  showAdd,
  openAdd,
  openAddWithUrl,
  openEdit,
} = useBookmarkForm()

const {
  syncFeatures,
  getEnterText,
  isDetachedWindowNow,
  FEATURE_PREFIX,
  setExpendHeight
} = useUTools()

const {
  canUseLocalMirror,
  canPickMirrorDirectory,
  pickMirrorDirectory,
  inspectMirrorDirectory,
  activateMirrorDirectory,
  hydrateMirrorDirectoryForDevice,
  shouldPromptMirrorDirectorySelection
} = useLocalDataMirror()

type PendingMirrorDecision = {
  directoryPath: string
  filePath: string
  canRead: boolean
}

const {
  activeNotice: activeFeatureNotice,
  isLocalModeIntroPending,
  ensureLocalModeIntroNotice,
  ensureLocalModeDevicePathNotice,
  markLocalModeIntroViewed,
  markLocalModeIntroIgnored,
  markDevicePathConfigured,
  markDevicePathIgnored,
  markLocalModeSettingsVisited
} = useFeatureNoticeCenter()

const settingsActiveTab = ref<'general' | 'categories' | 'tools' | 'data' | 'local-mode' | 'about'>('general')
const showMirrorDecisionDialog = ref(false)
const mirrorDecisionLoading = ref(false)
const pendingMirrorDecision = ref<PendingMirrorDecision | null>(null)

const openLocalModeSettings = () => {
  tab.value = 'settings'
  settingsActiveTab.value = 'local-mode'
  markLocalModeSettingsVisited()
}

const closeMirrorDecisionDialog = (force = false) => {
  if (mirrorDecisionLoading.value && !force) return
  showMirrorDecisionDialog.value = false
  pendingMirrorDecision.value = null
}

const handleMirrorDirectoryActivation = (directoryPath: string, action: 'overwrite' | 'read') => {
  const result = activateMirrorDirectory(directoryPath, action)
  if (!result.ok) {
    showToast({
      title: action === 'read' ? '读取失败' : '覆盖失败',
      description: action === 'read' ? '现有 snapshot.json 无法读取，请改用覆盖。' : '旧文件备份失败，未覆盖原文件。',
      variant: 'error'
    })
    return false
  }

  markDevicePathConfigured()
  showToast({
    title: action === 'read' ? '已读取现有快照' : '已设置同步文件夹',
    description: action === 'overwrite' && result.backupPath
      ? `已备份旧文件：${result.backupPath}`
      : directoryPath,
    variant: 'success'
  })
  return true
}

const confirmMirrorDecision = (action: 'overwrite' | 'read') => {
  const pending = pendingMirrorDecision.value
  if (!pending) return
  mirrorDecisionLoading.value = true
  try {
    if (handleMirrorDirectoryActivation(pending.directoryPath, action)) {
      closeMirrorDecisionDialog(true)
    }
  } finally {
    mirrorDecisionLoading.value = false
  }
}

const refreshLocalModePathNotice = (firstOpenOnly = false) => {
  const required = shouldPromptMirrorDirectorySelection()
  if (firstOpenOnly) {
    ensureLocalModeDevicePathNotice(required && isLocalModeIntroPending.value)
    return
  }
  ensureLocalModeDevicePathNotice(required)
}

const handleFeatureNoticeView = async () => {
  const notice = activeFeatureNotice.value
  if (!notice) return

  if (notice.id === 'local-mode-intro') {
    markLocalModeIntroViewed()
    openLocalModeSettings()
    return
  }

  if (!canUseLocalMirror()) {
    showToast({ title: '当前环境不支持浏览器拓展数据', variant: 'warning' })
    markDevicePathIgnored()
    return
  }

  if (!canPickMirrorDirectory()) {
    showToast({
      title: '当前环境不支持直接选择目录',
      description: '请在设置 > 浏览器拓展中手动配置路径',
      variant: 'warning'
    })
    markDevicePathIgnored()
    openLocalModeSettings()
    return
  }

  const selected = await pickMirrorDirectory()
  if (!selected) {
    markDevicePathIgnored()
    return
  }

  const inspection = inspectMirrorDirectory(selected)
  if (inspection.hasExistingFile) {
    pendingMirrorDecision.value = {
      directoryPath: selected,
      filePath: inspection.filePath,
      canRead: inspection.canReadExistingFile
    }
    showMirrorDecisionDialog.value = true
    return
  }

  handleMirrorDirectoryActivation(selected, 'overwrite')
}

const handleFeatureNoticeIgnore = () => {
  const notice = activeFeatureNotice.value
  if (!notice) return

  if (notice.id === 'local-mode-intro') {
    markLocalModeIntroIgnored()
    return
  }

  markDevicePathIgnored()
}

const getLatestUpdatedAt = (data: { groups?: Group[]; bookmarks?: Bookmark[] }) => {
  let max = 0
  const groups = data.groups || []
  const bookmarks = data.bookmarks || []
  groups.forEach((group) => {
    max = Math.max(max, group.updatedAt || group.createdAt || 0)
    group.children?.forEach((sub: SubGroup) => {
      max = Math.max(max, sub.updatedAt || sub.createdAt || 0)
    })
  })
  bookmarks.forEach((bookmark) => {
    max = Math.max(max, bookmark.updatedAt || bookmark.createdAt || 0)
  })
  return max
}

// 防抖定时器引用
let syncTimeout: NodeJS.Timeout | null = null

// Shared State
const selectedIndex = ref(-1)


const handleSelectGroup = async (groupId: string) => {
  store.selectGroup(groupId)
  tab.value = "bookmarks"
}


// Window Height Watcher
watch(() => settingsStore.windowHeight, (h) => {
  setExpendHeight(h)
})

const canUseSubInput = computed(() => {
  if (!isUTools.value) return false
  try {
     return !isDetachedWindowNow()
  } catch {
     return false
  }
})

const handleSearchSubInput = ({ text }: { text: string }) => {
  store.setSearch(text)
}

const {
  clearSubInput,
  activateTemplateSubInput,
} = useUToolsSubInputController({
  isUTools,
  canUseSubInput,
  getDefaultValue: () => store.search,
  onDefaultInput: handleSearchSubInput,
})

const suppressSearchOverlay = ref(false)

const {
  localSearchInputRef,
  searchViewOpen,
  searchValue,
  searchResults,
  activeBookmarks,
  searchAutoExitText,
  openSearchView,
  closeSearchView,
} = useSearch(tab, selectedIndex, {
  canUseSubInputRef: canUseSubInput,
  focusSubInput: focusDefaultSearchInput,
  syncSubInputValue: syncDefaultSearchInputValue,
  suppressAutoOpenOverlayRef: suppressSearchOverlay,
})

// SearchOverlay 组件 ref
const searchOverlayRef = ref<{ 
  focus: () => void;
  localSearchInputRef?: HTMLInputElement | null 
} | null>(null)

const focusUToolsNativeInput = () => {
  if (!isUTools.value) return
  nextTick(() => {
    requestAnimationFrame(() => {
      window.utools?.subInputFocus?.()
      window.setTimeout(() => window.utools?.subInputFocus?.(), 80)
      window.setTimeout(() => window.utools?.subInputFocus?.(), 220)
    })
  })
}

function syncDefaultSearchInputValue(text: string) {
  if (!canUseSubInput.value || activeTemplateBookmark.value) return false
  window.dispatchEvent(new CustomEvent(UTOOLS_SEARCH_SYNC_EVENT, {
    detail: { text: typeof text === 'string' ? text : '' }
  }))
  return true
}

function restoreDefaultSearchInput() {
  if (!canUseSubInput.value || activeTemplateBookmark.value) return false
  window.dispatchEvent(new CustomEvent(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT))
  syncDefaultSearchInputValue(store.search)
  return true
}

function focusDefaultSearchInput(forceRemount = false) {
  if (!canUseSubInput.value) return false
  if (forceRemount) {
    restoreDefaultSearchInput()
  }
  focusUToolsNativeInput()
  return true
}

const activateHomeSearch = ({ openSearch = false, forceRemount = false } = {}) => {
  if (activeTemplateBookmark.value) return
  if (tab.value !== 'bookmarks') {
    tab.value = 'bookmarks'
  }

  if (forceRemount) {
    restoreDefaultSearchInput()
  }

  if (openSearch) {
    openSearchView()
    return
  }

  if (canUseSubInput.value) {
    focusDefaultSearchInput()
  }
}

const openSearchOverlay = (forceRemount = false) => {
  suppressSearchOverlay.value = false
  openSearchView({ focusInput: true })
  if (forceRemount && canUseSubInput.value) {
    focusDefaultSearchInput(true)
  }
}

const activateSearchInputOnly = (forceRemount = false) => {
  if (activeTemplateBookmark.value) return
  suppressSearchOverlay.value = true
  if (forceRemount && canUseSubInput.value) {
    focusDefaultSearchInput(true)
  }
}

const focusMainSearchInput = (forceRemount = false) => {
  if (tab.value !== 'bookmarks') return
  nextTick(() => {
    requestAnimationFrame(() => {
      if (canUseSubInput.value) {
        activateHomeSearch({ forceRemount })
        return
      }

      if (isUTools.value) {
        focusUToolsNativeInput()
      }
    })
  })
}

// 当搜索视图打开时，同步并聚焦输入框
watch(searchViewOpen, (isOpen, wasOpen) => {
  if (!isOpen) {
    suppressSearchOverlay.value = false
    if (wasOpen) {
      focusMainSearchInput(true)
    }
    return
  }

  if (canUseSubInput.value) {
    focusMainSearchInput(true)
    return
  }

  if (isUTools.value) {
    focusMainSearchInput(true)
    return
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      const overlay = searchOverlayRef.value
      if (overlay && typeof overlay.focus === 'function') {
        // 1. 调用组件的 focus 方法确保聚焦
        overlay.focus()

        // 2. 同步 DOM 元素给 useSearch (用于其他逻辑)
        // 注意：被 expose 的 ref 会自动解包，所以这里直接获取即可
        const inputEl = overlay.localSearchInputRef
        if (inputEl instanceof HTMLInputElement) {
          localSearchInputRef.value = inputEl
          // 通过 blur/focus 恢复插入光标闪烁，再把光标放回末尾。
          inputEl.blur()
          inputEl.focus()
          const len = inputEl.value?.length ?? 0
          try { inputEl.setSelectionRange(len, len) } catch {}
        }
      }
    })
  })
})


// Keyboard
const {
  setBookmarkGridRef,
  showCmdHints,
  hintKeyById,
  hideCmdHints,
  handleLocalSearchKey,
} = useKeyboard(
  selectedIndex,
  activeBookmarks,
  searchViewOpen,
  isMac,
  showAdd,
  showDeleteConfirm,
  ref(false),
  tab,
  openBookmarkLink,
  // 新增参数：分组快捷键切换
  computed(() => store.groups),
  computed(() => store.activeGroupId),
  (groupId: string) => {
    store.selectGroup(groupId)
    tab.value = "bookmarks"
  }
)

// hintKeyById 包装函数供模板使用
const getHintKey = (id: string) => hintKeyById.value[id]

// Group Helpers
const activeGroup = computed(() => store.groups.find(g => g.id === store.activeGroupId))
const activeSubGroups = computed(() => activeGroup.value?.children ?? [])
const shouldShowSubs = computed(() => activeSubGroups.value.length > 1)
// 星空定时器引用
let starTimers: { dim?: number; light?: number; meteor?: number } = {}

// 监听背景设置，同步到 body 类名 + 创建/销毁星空
watch([
  () => settingsStore.easterEggEnabled,
  () => settingsStore.useSolidBackground,
  () => settingsStore.lightBackgroundStyle,
  isDark
], ([enabled, useSolid, lightStyle, dark]) => {
  const existing = document.getElementById('stars-container')

  // 清理之前的状态
  document.body.classList.remove(
    'easter-egg-active',
    'solid-background',
    'light-white-background',
    'light-utools-background'
  )
  existing?.remove()
  Object.values(starTimers).forEach(t => t && clearTimeout(t))
  starTimers = {}

  if (!dark) {
    document.body.classList.add(lightStyle === 'utools' ? 'light-utools-background' : 'light-white-background')
    return
  }

  if (useSolid) {
    // 使用纯色背景
    document.body.classList.add('solid-background')
  } else if (enabled) {
    // 使用星空背景
    document.body.classList.add('easter-egg-active')
    const container = document.createElement('div')
    container.id = 'stars-container'
    container.className = 'stars-container'
    // 创建星星
    for (let i = 0; i < 200; i++) {
      const star = document.createElement('div')
      star.className = 'star'
      star.style.left = `${Math.random() * 100}%`
      star.style.top = `${Math.random() * 100}%`
      const size = Math.random() * 2 + 1
      star.style.width = `${size}px`
      star.style.height = `${size}px`
      star.style.setProperty('--duration', `${Math.random() * 15 + 12}s`)
      star.style.setProperty('--delay', `${Math.random() * 5}s`)
      container.appendChild(star)
    }
    document.body.prepend(container)

    // 每 3 秒随机熄灭 1-5 颗星星
    starTimers.dim = window.setInterval(() => {
      const stars = Array.from(container.querySelectorAll('.star:not(.dimmed)')) as HTMLElement[]
      if (stars.length > 50) {
        const count = Math.floor(Math.random() * 5) + 1
        for (let i = 0; i < count && stars.length > 50; i++) {
          const idx = Math.floor(Math.random() * stars.length)
          const target = stars.splice(idx, 1)[0]
          target.classList.add('dimming')
          setTimeout(() => {
            target.classList.remove('dimming')
            target.classList.add('dimmed')
          }, 2000)
        }
      }
    }, 3000)

    // 每 5 秒随机亮起 1-5 颗星星（重新随机位置）
    starTimers.light = window.setInterval(() => {
      const dimmed = Array.from(container.querySelectorAll('.star.dimmed')) as HTMLElement[]
      if (dimmed.length > 0) {
        const count = Math.min(Math.floor(Math.random() * 5) + 1, dimmed.length)
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(Math.random() * dimmed.length)
          const target = dimmed.splice(idx, 1)[0]
          // 随机新位置
          target.style.left = `${Math.random() * 100}%`
          target.style.top = `${Math.random() * 100}%`
          const size = Math.random() * 2 + 1
          target.style.width = `${size}px`
          target.style.height = `${size}px`
          target.classList.remove('dimmed')
          target.classList.add('lighting')
          setTimeout(() => target.classList.remove('lighting'), 1500)
        }
      }
    }, 5000)

    // 每 10-30 秒创建一颗流星
    const createMeteor = () => {
      const meteor = document.createElement('div')
      meteor.className = 'meteor'
      meteor.style.left = `${Math.random() * 80 + 10}%`
      meteor.style.top = `${Math.random() * 30}%`
      container.appendChild(meteor)
      setTimeout(() => meteor.remove(), 4000)
      starTimers.meteor = window.setTimeout(createMeteor, (Math.random() * 20 + 10) * 1000)
    }
    starTimers.meteor = window.setTimeout(createMeteor, (Math.random() * 10 + 5) * 1000)
  }
}, { immediate: true })

const visibleGroups = computed(() => store.groups.filter(g => g.id !== TRASH_GROUP_ID))
const isTrashActive = computed(() => store.activeGroupId === TRASH_GROUP_ID)
const currentSubGroup = computed(() => 
  activeSubGroups.value.find(s => s.id === store.activeSubGroupId)
)

// 更新页面标题
const updatePageTitle = () => {
  const baseTitle = '鹅的书签'
  const parts: string[] = []

  if (tab.value === 'settings') {
    parts.push('设置')
  } else if (isTrashActive.value) {
    parts.push('回收站')
  } else {
    // 添加子分组名称
    if (currentSubGroup.value && shouldShowSubs.value) {
      parts.push(currentSubGroup.value.name)
    }
    // 添加分组名称
    if (activeGroup.value && activeGroup.value.id !== TRASH_GROUP_ID) {
      parts.push(activeGroup.value.name)
    }
  }

  // 如果有部分，则组合标题；否则使用基础标题
  document.title = parts.length > 0 ? `${parts.join(' - ')} - ${baseTitle}` : baseTitle
}

// Coordination Watchers
watch(() => store.search, () => {
  hideCmdHints()
})
watch(() => tab.value, (nextTab, prevTab) => {
  hideCmdHints()
  onMainViewSwitch()
  updatePageTitle()

  if (nextTab === 'bookmarks' && prevTab !== 'bookmarks' && !searchViewOpen.value) {
    focusMainSearchInput(true)
  }
})

watch([() => store.activeGroupId, () => store.activeSubGroupId], () => {
  selectedIndex.value = -1
  hideCmdHints()
  updatePageTitle()
})


// 书签点击逻辑：左键打开，右键复制
const handleBookmarkClick = (bookmark: Bookmark) => {
  openBookmarkLink(bookmark)
}

const handleBookmarkRightClick = (e: MouseEvent, bookmark: Bookmark) => {
  e.preventDefault()
  copyBookmarkUrl(bookmark)
}

const handleContextMenuWrapper = (e: MouseEvent, bookmark: Bookmark) => {
  console.log('[ContextMenu] triggered:', bookmark?.title, 'at', e.clientX, e.clientY)
  e.preventDefault()
  e.stopPropagation() // 阻止冒泡，避免触发 document 的 click/contextmenu 导致菜单立即关闭
  handleContextMenu(e, bookmark)
}

// 书签拖拽到子分组的处理
const handleBookmarkDrop = (bookmarkId: string, toSubId: string) => {
  const moved = store.moveBookmarkToSubGroup(
    bookmarkId,
    store.activeGroupId,
    store.activeSubGroupId,
    store.activeGroupId,
    toSubId
  )
  if (moved) {
    showToast({ title: '书签已移动', variant: 'success', duration: 1500 })
  }
}

const handleContextMenuAction = (action: string) => {
  const bookmark = contextMenu.target
  if (!bookmark) return

  switch (action) {
    case 'open':
      openBookmarkLink(bookmark)
      break
    case 'openInUtoolsBrowser':
      const url = resolveBookmarkLaunchUrl(bookmark.url)
      if (!url) return
      openUrlInUtoolsBrowser(url)
      break
    case 'copy':
      copyBookmarkUrl(bookmark)
      break
    case 'edit':
      openEdit(bookmark)
      break
    case 'remove':
      handleRemove(bookmark)
      break
  }
}


// 引导导入书签
const handleOnboardingImport = async (file: File) => {
  try {
    const text = await file.text()
    
    if (isHtmlBookmarkFile(text)) {
      // HTML 格式：直接解析并导入
      const result = parseHtmlBookmarks(text)
      if (result.stats.totalBookmarks === 0) {
        showToast({ title: '导入失败', description: '未在文件中找到有效书签', variant: 'error' })
        return
      }
      
      // 简化导入：所有顶级文件夹都导入
      const now = Date.now()
      const uid = () => crypto.randomUUID()
      let addedGroups = 0
      let addedBookmarks = 0
      
      // 1. 处理根层级的书签（不在任何文件夹中）
      const rootBookmarks = result.flatBookmarks.filter(b => b.folderPath.length === 0)
      if (rootBookmarks.length > 0) {
        const newGroupId = uid()
        const subId = uid()
        const newBookmarks: Bookmark[] = rootBookmarks.map(b => ({
          id: uid(), title: b.title, url: b.url, desc: '', tags: [],
          createdAt: b.addDate || now, updatedAt: now,
          locations: [{ groupId: newGroupId, subGroupId: subId }]
        }))
        
        const newGroup = { 
          id: newGroupId, 
          name: '导入书签', 
          createdAt: now, 
          updatedAt: now, 
          children: [{ id: subId, name: '未分类', bookmarkIds: newBookmarks.map(b => b.id), createdAt: now, updatedAt: now }]
        }
        
        const trashIdx = store.groups.findIndex(g => g.id === TRASH_GROUP_ID)
        if (trashIdx !== -1) {
          store.groups.splice(trashIdx, 0, newGroup)
        } else {
          store.groups.push(newGroup)
        }
        store.bookmarks.push(...newBookmarks)
        addedGroups++
        addedBookmarks += newBookmarks.length
      }

      // 2. 处理文件夹结构
      result.folders.forEach(folder => {
        const newGroupId = uid()
        const newBookmarks: Bookmark[] = []
        const children: typeof store.groups[0]['children'] = []
        
        // 当前文件夹的书签放入默认子分组
        if (folder.bookmarks.length > 0) {
          const subId = uid()
          folder.bookmarks.forEach(b => {
            const bookmark: Bookmark = {
              id: uid(), title: b.title, url: b.url, desc: '', tags: [],
              createdAt: b.addDate || now, updatedAt: now,
              locations: [{ groupId: newGroupId, subGroupId: subId }]
            }
            newBookmarks.push(bookmark)
          })
          children.push({ id: subId, name: '未分类', bookmarkIds: newBookmarks.map(b => b.id), createdAt: now, updatedAt: now })
        }
        
        // 递归扁平化子文件夹
        const flattenFolder = (f: typeof folder, prefix: string): void => {
          const name = prefix ? `${prefix}/${f.name}` : f.name
          if (f.bookmarks.length > 0) {
            const subId = uid()
            f.bookmarks.forEach(b => {
              const bookmark: Bookmark = {
                id: uid(), title: b.title, url: b.url, desc: '', tags: [],
                createdAt: b.addDate || now, updatedAt: now,
                locations: [{ groupId: newGroupId, subGroupId: subId }]
              }
              newBookmarks.push(bookmark)
            })
            children.push({ id: subId, name, bookmarkIds: newBookmarks.slice(-f.bookmarks.length).map(b => b.id), createdAt: now, updatedAt: now })
          }
          f.children.forEach(child => flattenFolder(child, name))
        }
        folder.children.forEach(child => flattenFolder(child, ''))
        
        if (children.length === 0) {
          children.push({ id: uid(), name: '未分类', bookmarkIds: [], createdAt: now, updatedAt: now })
        }
        
        const trashIdx = store.groups.findIndex(g => g.id === TRASH_GROUP_ID)
        const newGroup = { id: newGroupId, name: folder.name, createdAt: now, updatedAt: now, children }
        if (trashIdx !== -1) {
          store.groups.splice(trashIdx, 0, newGroup)
        } else {
          store.groups.push(newGroup)
        }
        store.bookmarks.push(...newBookmarks)
        addedGroups++
        addedBookmarks += newBookmarks.length
      })
      
      showToast({ title: '导入成功', description: `新增 ${addedGroups} 个分组、${addedBookmarks} 个书签`, variant: 'success' })
      settingsStore.dismissOnboarding()
      // 异步触发图标获取
      store.refreshMissingIcons()
    } else {
      const parsed = parseJsonImportText(text)
      if (!parsed.ok) {
        showToast({ title: '导入失败', description: parsed.message, variant: 'error' })
        return
      }

      const mode = parsed.source === 'goose-marks' ? 'overwrite' : 'merge'
      const summary = applyImportDataToStore(store, parsed.data, mode)
      const skippedText = parsed.stats.skipped > 0 ? `，跳过 ${parsed.stats.skipped} 条无效数据` : ''

      if (mode === 'overwrite') {
        showToast({
          title: '导入成功',
          description: `${parsed.sourceLabel}：分组 ${summary.after.groups} / 书签 ${summary.after.bookmarks}${skippedText}`,
          variant: 'success'
        })
      } else {
        showToast({
          title: '导入成功',
          description: `${parsed.sourceLabel}：新增分组 ${summary.added.groups} / 新增书签 ${summary.added.bookmarks}${skippedText}`,
          variant: 'success'
        })
      }

      if (parsed.warnings.length > 0) {
        console.warn('[App] Import warnings:', parsed.warnings)
      }

      settingsStore.dismissOnboarding()
      // 异步触发图标获取
      store.refreshMissingIcons()
    }
  } catch (e) {
    console.error('[App] Import failed:', e)
    showToast({ title: '文件解析失败', variant: 'error' })
  }
}



const activeTemplateBookmark = ref<Bookmark | null>(null)
const templateQuery = ref('')
const showQuickSaveDialog = ref(false)

// 验证 URL 是否有效（用于快速保存）
const isValidUrl = (text: string): boolean => {
  if (!text || text.trim().length === 0) return false
  try {
    // 确保有协议前缀
    let urlStr = text.trim()
    if (!urlStr.match(/^https?:\/\//i)) {
      urlStr = `https://${urlStr}`
    }
    const url = new URL(urlStr)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// 处理快速保存（超级面板 / 当前浏览器 / 弹窗）
const handleQuickSave = async (from: string, payload: any) => {
  let urlToSave = ''

  // 1. 从 payload 获取 URL
  if (typeof payload === 'string') {
    urlToSave = payload
  } else if (payload && typeof payload === 'object' && 'text' in payload) {
    urlToSave = String(payload.text)
  }

  // 2. 如果 payload 没有 URL，尝试从浏览器获取
  if (!urlToSave) {
    try {
      const utoolsApi = window.utools as any
      if (typeof utoolsApi?.readCurrentBrowserUrl === 'function') {
        urlToSave = await utoolsApi.readCurrentBrowserUrl()
      }
    } catch (e) {
      console.warn('[quick_save] 获取浏览器 URL 失败:', e)
    }
  }

  urlToSave = urlToSave.trim()

  // 验证是否是有效 URL
  if (urlToSave && isValidUrl(urlToSave)) {
    // 通过 proxy API 获取页面元信息
    const meta = await fetchPageMeta(urlToSave)
    const pageTitle = meta.title || ''
    const pageDesc = meta.description || ''

    // 快速保存到"快速收集"分组（含去重逻辑）
    const bookmark = store.quickSaveBookmark(urlToSave, pageTitle, pageDesc)
    const isNew = bookmark.title === urlToSave

    showToast({
      title: isNew ? '已保存' : '已添加到快速收集',
      description: bookmark.title,
      variant: 'success'
    })

    // 退出插件
    window.utools?.outPlugin()
    return
  } else {
    console.warn('[quick_save] 无效 URL:', { payload, urlToSave, from })
    showToast({ title: '未检测到有效链接', variant: 'warning' })
    return
  }
}

// 快速保存书签（弹窗入口）
const quickSaveBookmark = async (url: string) => handleQuickSave('dialog', url)

// Template Mode - Execute Search
const executeTemplateSearch = () => {
  const bookmark = activeTemplateBookmark.value
  if (!bookmark) return
  
  const query = templateQuery.value.trim()
  if (!query) return
  
  // 替换模板变量
  let url = bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query))
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  
  showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
  openUrl(url)
  
  if (settingsStore.autoCloseWindow && isDetachedWindowNow()) {
    window.utools?.outPlugin()
  } else {
    window.utools?.hideMainWindow?.()
    exitTemplateMode()
  }
}

// Template Mode - Keydown Handler
const handleTemplateKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && activeTemplateBookmark.value) {
    e.preventDefault()
    executeTemplateSearch()
  }
}

// Template Mode Actions
const enterTemplateMode = (bookmark: Bookmark) => {
  activeTemplateBookmark.value = bookmark
  templateQuery.value = ''
  isSyncPaused.value = true // 进入模式时暂停同步
  
  // Clean UI
  searchViewOpen.value = false
  showAdd.value = false
  showDeleteConfirm.value = false
  
  // Set uTools sub input
  const label = getTemplateLabel(bookmark.url)
  const mounted = activateTemplateSubInput({
    onChange: ({ text }) => {
    templateQuery.value = text
    },
    placeholder: `搜索 ${bookmark.title}${label ? ` (${label})` : ''}，回车打开`,
    focus: true,
  })
  if (!mounted) return
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleTemplateKeydown)
}

const exitTemplateMode = () => {
  // 移除键盘事件监听
  window.removeEventListener('keydown', handleTemplateKeydown)
  
  activeTemplateBookmark.value = null
  templateQuery.value = ''
  isSyncPaused.value = false // 退出模式时恢复同步
  
  // Restore default sub input
  restoreDefaultSearchInput()
}

const handleStorageSync = ((e: any) => {
  const { key, value } = e.detail
  if (!value) return
  try {
    const data = JSON.parse(value)
    if (key === 'settings' && data && typeof data === 'object') {
      const localMirrorDirectory = settingsStore.localMirrorDirectory
      const nextSettings = { ...(data as Record<string, unknown>) }
      delete nextSettings.localMirrorDirectory
      settingsStore.$patch(nextSettings)
      settingsStore.setLocalMirrorDirectory(localMirrorDirectory)
      hydrateMirrorDirectoryForDevice()
      refreshLocalModePathNotice(true)
    }
    if (key === 'bookmark') {
      const incomingStamp = getLatestUpdatedAt(data)
      const localStamp = getLatestUpdatedAt({ groups: store.groups, bookmarks: store.bookmarks })
      if (incomingStamp >= localStamp) {
        const preferredGroupId = store.activeGroupId
        const preferredSubGroupId = store.activeSubGroupId
        const nextGroups = Array.isArray((data as { groups?: unknown }).groups) ? (data as { groups: Group[] }).groups : store.groups
        const nextBookmarks = Array.isArray((data as { bookmarks?: unknown }).bookmarks) ? (data as { bookmarks: Bookmark[] }).bookmarks : store.bookmarks
        store.$patch({
          groups: nextGroups,
          bookmarks: nextBookmarks
        })
        store.ensureValidSelection(preferredGroupId, preferredSubGroupId)
      }
    }
  } catch {}
}) as EventListener

const handleUToolsSearchInputEvent = (event: Event) => {
  if (activeTemplateBookmark.value) return
  const detail = (event as CustomEvent<{ text?: string }>).detail
  store.setSearch(typeof detail?.text === 'string' ? detail.text : '')
}

type UToolsPluginEnterPayload = {
  code?: unknown
  payload?: unknown
  from?: unknown
  type?: unknown
}

type PendingUToolsPluginEnterEvent = {
  serial: number
  params: UToolsPluginEnterPayload
}

const RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS = 1000
let recentDynamicTemplateEnterAt = 0
const UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE = /^[\s\/|:：\-—–]+/

type UniversalBookmarkMatch = {
  bookmark: Bookmark
  query: string
  exact: boolean
}

const getUToolsPluginEnterParams = (input: unknown): UToolsPluginEnterPayload => {
  if (!input || typeof input !== 'object') return {}
  const detail = input as UToolsPluginEnterPayload & { params?: unknown }
  if (detail.params && typeof detail.params === 'object') {
    return detail.params as UToolsPluginEnterPayload
  }
  return detail
}

const findUniversalBookmarkMatch = (payloadText: string): UniversalBookmarkMatch | null => {
  const candidates = store.bookmarks
    .filter((bookmark): bookmark is Bookmark => {
      return bookmark.allowUniversal === true
        && !store.isBookmarkInTrash(bookmark)
        && typeof bookmark.title === 'string'
        && !!bookmark.title.trim()
    })
    .sort((left, right) => right.title.trim().length - left.title.trim().length)

  for (const bookmark of candidates) {
    const title = bookmark.title.trim()
    if (!title) continue

    if (payloadText === title) {
      return { bookmark, query: '', exact: true }
    }

    if (!payloadText.startsWith(title)) continue

    const suffix = payloadText.slice(title.length)
    if (!suffix) continue
    if (!UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE.test(suffix)) continue

    const query = suffix.replace(UNIVERSAL_BOOKMARK_PAYLOAD_SPLIT_RE, '').trim()
    return {
      bookmark,
      query,
      exact: query.length === 0,
    }
  }

  return null
}

const openResolvedUrl = (url: string) => {
  showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
  openUrl(url)

  if (settingsStore.autoCloseWindow && isDetachedWindowNow()) {
    window.utools?.outPlugin()
    return
  }

  if (!isDetachedWindowNow()) {
    window.utools?.hideMainWindow?.()
  }
}

const syncTheme = () => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', !!isDark.value)
}

const handleUToolsPluginEnterEvent = (event: Event) => {
  try {
    const params = getUToolsPluginEnterParams((event as CustomEvent<UToolsPluginEnterPayload>).detail)
    const code = params?.code
    const isTemplateFeature = typeof code === 'string' && code.startsWith(FEATURE_PREFIX)
    const enterType = typeof params?.type === 'string' ? params.type : ''
    const payloadText = getEnterText(params?.payload).trim()

    if (code === 'save_link') {
      let urlToSave = ''
      const payload = params?.payload

      if (typeof payload === 'string') {
        urlToSave = payload
      } else if (payload && typeof payload === 'object' && 'text' in payload) {
        urlToSave = String(payload.text)
      }

      urlToSave = urlToSave.trim()

      if (urlToSave && isValidUrl(urlToSave)) {
        onMainViewSwitch()
        activeTemplateBookmark.value = null
        syncTheme()
        syncFeatures(store.bookmarks)
        restoreDefaultSearchInput()
        store.setSearch('')
        openAddWithUrl(urlToSave)
        return
      }

      console.warn('[save_link] 无效 URL:', { payload, urlToSave })
      showToast({ title: '未检测到有效链接', variant: 'warning' })
      return
    }

    if (code === 'quick_save') {
      const from = (params as any)?.from || 'main'
      const payload = params?.payload
      handleQuickSave(from, payload)
      return
    }

    if (code === 'quick_save_dialog') {
      onMainViewSwitch()
      showQuickSaveDialog.value = true
      return
    }

    if (!isTemplateFeature) {
      if (code === 'bookmarks' && payloadText) {
        const match = findUniversalBookmarkMatch(payloadText)
        if (match) {
          recentDynamicTemplateEnterAt = Date.now()
          if (match.exact) {
            const hasTemplate = /{[^}]+}/.test(match.bookmark.url)
            if (hasTemplate) {
              enterTemplateMode(match.bookmark)
              return
            }
          }

          const resolvedUrl = resolveBookmarkLaunchUrl(match.bookmark.url, match.query)
          if (resolvedUrl) {
            openResolvedUrl(resolvedUrl)
            return
          }

          showToast({ title: '未检测到有效链接', variant: 'warning' })
          return
        }
      }

      if (code === 'bookmarks' && recentDynamicTemplateEnterAt > 0 && (Date.now() - recentDynamicTemplateEnterAt) <= RECENT_DYNAMIC_TEMPLATE_ENTER_WINDOW_MS) {
        recentDynamicTemplateEnterAt = 0
        return
      }

      onMainViewSwitch()
      activeTemplateBookmark.value = null
      syncTheme()
      syncFeatures(store.bookmarks)
      closeSearchView({ restoreFocus: false })
      store.setSearch('')
      activateSearchInputOnly()
      return
    }

    syncTheme()
    const id = (code as string).slice(FEATURE_PREFIX.length)
    const bookmark = store.bookmarks.find(b => b.id === id)

    if (!bookmark) {
      window.utools?.outPlugin()
      return
    }

    const hasTemplate = /{[^}]+}/.test(bookmark.url)
    const isInTemplateMode = activeTemplateBookmark.value?.id === id
    const payloadQuery = getEnterText(params?.payload).trim()
    const query = isInTemplateMode ? templateQuery.value.trim() : payloadQuery

    if (hasTemplate) {
      const shouldEnterTemplateMode = enterType === 'over'
        ? !payloadQuery && !isInTemplateMode
        : (!payloadQuery || payloadQuery === bookmark.title) && !isInTemplateMode
      if (shouldEnterTemplateMode) {
        recentDynamicTemplateEnterAt = Date.now()
        enterTemplateMode(bookmark)
        return
      }
    }

    let url = hasTemplate ? bookmark.url.replace(/{[^}]+}/g, encodeURIComponent(query)) : bookmark.url
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    showToast({ title: '正在打开...', variant: 'success', duration: 1000 })
    openUrl(url)

    if (settingsStore.autoCloseWindow && isDetachedWindowNow()) {
      window.utools?.outPlugin()
    } else {
      if (!isDetachedWindowNow()) {
        window.utools?.hideMainWindow?.()
      }
      if (activeTemplateBookmark.value) {
        exitTemplateMode()
      }
    }

    recentDynamicTemplateEnterAt = Date.now()
  } finally {
    window.__gooseMarksLastHandledPluginEnterSerial = window.__gooseMarksLastPluginEnterSerial || 0
  }
}

const replayPendingUToolsPluginEnterEvent = () => {
  const pendingEvents = (window.__gooseMarksPendingPluginEnterEvents || []) as PendingUToolsPluginEnterEvent[]
  if (pendingEvents.length === 0) return

  const selectedEvent = [...pendingEvents].reverse().find(entry => {
    const code = entry?.params?.code
    return typeof code === 'string' && code.startsWith(FEATURE_PREFIX)
  }) ?? pendingEvents[pendingEvents.length - 1]

  if (!selectedEvent) return

  handleUToolsPluginEnterEvent({
    detail: selectedEvent.params
  } as CustomEvent<UToolsPluginEnterPayload>)
  window.__gooseMarksPendingPluginEnterEvents = []
}

const handleUToolsPluginOutEvent = () => {
  suppressSearchOverlay.value = false
  clearSubInput()
}

// Lifecycle
onMounted(async () => {
  hydrateMirrorDirectoryForDevice()
  ensureLocalModeIntroNotice()
  refreshLocalModePathNotice(true)

  window.addEventListener('contextmenu', (e) => {
    // 允许书签卡片触发自定义行为（已经在 handleContextMenuWrapper 中处理）
    // 但阻止所有默认浏览器菜单
    e.preventDefault()
  }, true) // Use capture to ensure we catch it before most others

  // 监听 URL 变化（popstate 事件）
  window.addEventListener('popstate', () => {
    updatePageTitle()
  })

  // 初始化标题
  updatePageTitle()

  statsStore.recordUse('open')
  
  if (window.utools) {
    syncFeatures(store.bookmarks)
    window.addEventListener('storage-sync', handleStorageSync as EventListener)
    window.addEventListener(UTOOLS_SEARCH_INPUT_EVENT, handleUToolsSearchInputEvent as EventListener)
    window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, handleUToolsPluginEnterEvent as EventListener)
    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, handleUToolsPluginOutEvent as EventListener)
    replayPendingUToolsPluginEnterEvent()
  }
})

watch(() => store.bookmarks, () => {
  if (isSyncPaused.value) return // 暂停时跳过同步
  syncFeatures(store.bookmarks)
}, { deep: true })

// 组件卸载时清理定时器
onUnmounted(() => {
  if (window.utools) {
    window.removeEventListener('storage-sync', handleStorageSync as EventListener)
    window.removeEventListener(UTOOLS_SEARCH_INPUT_EVENT, handleUToolsSearchInputEvent as EventListener)
    window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, handleUToolsPluginEnterEvent as EventListener)
    window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, handleUToolsPluginOutEvent as EventListener)
  }
  clearSubInput()
  if (syncTimeout) {
    clearTimeout(syncTimeout)
    syncTimeout = null
  }
})

// Highlight State
const highlightedBookmarkId = ref<string | null>(null)

// 定位逻辑
const handleLocate = async (bookmark: Bookmark) => {
  if (bookmark.locations && bookmark.locations.length > 0) {
    const loc = bookmark.locations[0]
    
    // 1. 先关闭搜索
    if (searchViewOpen.value) {
       closeSearchView()
       // 等待 UI 更新 (Overlay 消失动画)
       await new Promise(resolve => setTimeout(resolve, 300))
    }

    // 2. 切换位置
    store.selectGroup(loc.groupId)
    if (loc.subGroupId) {
      store.selectSubGroup(loc.subGroupId)
    }
    
    // 3. 切换到书签 tab
    tab.value = 'bookmarks'

    // 4. 设置高亮
    highlightedBookmarkId.value = bookmark.id
    
    // 5. 4秒后清除高亮
    setTimeout(() => {
      highlightedBookmarkId.value = null
    }, 4000)
    
  } else {
    showToast({ title: '无法定位', description: '该书签没有关联的位置信息', variant: 'error' })
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="100">
  <TemplateSearch 
    v-if="activeTemplateBookmark" 
    :bookmark="activeTemplateBookmark" 
    :query="templateQuery" 
  />
  <div 
    v-else 
    class="min-h-screen h-screen flex flex-col text-foreground overflow-hidden transition-all duration-500 bg-background app-container" 
    @contextmenu.prevent
  >
    <!-- Top Navigation for Groups -->
    <header
      class="sticky top-0 z-30 flex flex-col gap-2 p-6 transition-colors duration-300"
    >
       <GroupTabs
         :visible-groups="visibleGroups"
         :active-group-id="store.activeGroupId"
         :tab="tab"
         :is-u-tools="isUTools"
         :is-trash-active="isTrashActive"
         :group-layout="settingsStore.groupTabsLayout"
         :searching="searchViewOpen"
         @update:tab="tab = $event"
         @select-group="handleSelectGroup"
         @select-trash="store.selectGroup(TRASH_GROUP_ID); tab = 'bookmarks'"
         @toggle-dark="toggleDark()"
         @open-search="openSearchOverlay()"
       />
    </header>

    <!-- Search Overlay -->
    <SearchOverlay
      ref="searchOverlayRef"
      :open="searchViewOpen && !suppressSearchOverlay"
      :is-u-tools="isUTools"
      :search-value="searchValue"
      :active-bookmarks="activeBookmarks"
      :selected-index="selectedIndex"
      :enable-sub-input="canUseSubInput"
      :store-search="store.search"
      :search-auto-exit-text="searchAutoExitText"
      :show-cmd-hints="showCmdHints"
      :hint-key-by-id="hintKeyById"
      :grid-columns="settingsStore.gridColumns"
      :set-grid-ref="setBookmarkGridRef"
      @update:search-value="searchValue = $event"
      @close="closeSearchView"
      @refocus="focusMainSearchInput(true)"
      @keydown="handleLocalSearchKey"
      @edit="(b, el) => openEdit(b, el)"
      @open="openBookmarkLink"
      @contextmenu="handleBookmarkRightClick"
      @reorder="handleReorder"
      @locate="handleLocate"
    />

    <!-- Main Content with Sub-groups sidebar -->
    <main class="flex-1 min-h-0 flex px-6 pb-6 gap-4 overflow-y-auto no-scrollbar">
      <SubGroupSidebar
        :show="tab === 'bookmarks' && shouldShowSubs"
        :active-sub-groups="activeSubGroups"
        :active-sub-group-id="store.activeSubGroupId"
        :active-group-id="store.activeGroupId"
        @select="store.selectSubGroup"
        @drop="handleBookmarkDrop"
      />

      <BookmarksGrid
        v-if="tab === 'bookmarks'"
        :bookmarks="activeBookmarks"
        :selected-index="selectedIndex"
        :is-trash-active="isTrashActive"
        :columns="settingsStore.gridColumns"
        :set-grid-ref="setBookmarkGridRef"
        :show-command-hints="showCmdHints"
        :hint-key-by-id="hintKeyById"
        :highlighted-id="highlightedBookmarkId"
        @remove="handleRemove"
        @edit="openEdit"
        @open="openBookmarkLink"
        @contextmenu="handleContextMenuWrapper"
        @reorder="handleReorder"
        @add="(el) => openAdd(el)"
        @emptyTrash="emptyTrash"
        @locate="handleLocate"
      >
        <template #header>
          <OnboardingBanner
            v-if="!isTrashActive"
            @import="handleOnboardingImport"
          />
        </template>
      </BookmarksGrid>

      <section v-else class="flex-1 min-h-0">
        <SettingsLayout v-model:active-tab="settingsActiveTab" />
      </section>
    </main>
    

    <!-- Bookmark Context Menu -->
    <ContextMenu
      v-if="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :is-trash="isTrashActive"
      :is-u-tools="isUTools"
      @close="closeContextMenu"
      @action="handleContextMenuAction"
    />

    <!-- Quick Save Dialog -->
    <QuickSaveDialog
      v-model:open="showQuickSaveDialog"
      @save="quickSaveBookmark"
    />

    <!-- Bookmark Form Dialog -->
    <BookmarkFormDialog
      v-model:open="showAdd"
      :is-u-tools="isUTools"
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteConfirmDialog
      v-model:open="showDeleteConfirm"
      :is-trash-active="isTrashActive"
      @confirm="confirmDelete"
    />


  </div>
  
    <FeatureNoticeCenter
      :notice="activeFeatureNotice"
      @view="handleFeatureNoticeView"
      @ignore="handleFeatureNoticeIgnore"
    />

    <MirrorDirectoryDecisionDialog
      :open="showMirrorDecisionDialog"
      :directory-path="pendingMirrorDecision?.directoryPath || ''"
      :file-path="pendingMirrorDecision?.filePath || ''"
      :can-read="pendingMirrorDecision?.canRead ?? false"
      :loading="mirrorDecisionLoading"
      @update:open="value => !value && closeMirrorDecisionDialog()"
      @read="confirmMirrorDecision('read')"
      @overwrite="confirmMirrorDecision('overwrite')"
    />

    <ResultToast
      :open="toastState.visible"
      :title="toastState.title"
      :description="toastState.description"
      :variant="toastState.variant"
      :action-label="toastState.actionLabel"
      :origin="toastState.origin"
      @close="closeToast"
      @action="toastState.onAction?.()"
    />
  </TooltipProvider>
</template>

<style>
/* 全局彩蛋适配样式 - 星空背景 */
html.dark body.easter-egg-active {
  background: #050505 !important;
  background-attachment: fixed !important;
}

/* 纯色背景样式 */
html.dark body.solid-background {
  background-color: #2F3133 !important;
}

html.dark body.solid-background .app-container,
html.dark body.solid-background #app {
  background-color: transparent !important;
}

/* 浅色模式背景样式 */
html:not(.dark) body.light-white-background {
  --background: 0 0% 100%;
  background-color: #FFFFFF !important;
}

html:not(.dark) body.light-utools-background {
  --background: 0 0% 95.7%;
  background-color: #F4F4F4 !important;
}

/* 星空容器 */
html.dark body.easter-egg-active .stars-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  animation: stars-rotate 1200s linear infinite;
  transform-origin: center center;
  pointer-events: none;
  z-index: 0;
}

@keyframes stars-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 星星 */
html.dark body.easter-egg-active .star {
  position: absolute;
  width: 2px;
  height: 2px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 3px rgba(255, 255, 255, 0.8);
  animation: twinkle var(--duration, 15s) ease-in-out infinite;
  animation-delay: var(--delay, 0s);
}

/* 熄灭动画 - 缓慢渐隐 */
html.dark body.easter-egg-active .star.dimming {
  animation: star-dim 2s ease-out forwards;
}

@keyframes star-dim {
  0% { opacity: 1; transform: scale(1); }
  30% { opacity: 0.7; transform: scale(1.1); }
  100% { opacity: 0; transform: scale(0.5); }
}

/* 熄灭状态 */
html.dark body.easter-egg-active .star.dimmed {
  opacity: 0 !important;
  transform: scale(0);
  animation: none;
}

/* 亮起动画 - 直接出现，轻微闪烁 */
html.dark body.easter-egg-active .star.lighting {
  animation: star-light 1.5s ease-out forwards;
}

@keyframes star-light {
  0% { opacity: 0; transform: scale(0.5); }
  20% { opacity: 1; transform: scale(1.3); box-shadow: 0 0 6px 2px rgba(255, 255, 255, 0.8); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes twinkle {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* 流星 */
html.dark body.easter-egg-active .meteor {
  position: absolute;
  width: 3px;
  height: 3px;
  background: linear-gradient(135deg, white 0%, transparent 70%);
  border-radius: 50%;
  box-shadow: 0 0 6px 2px rgba(255, 255, 255, 0.6);
  animation: meteor-fall 4s linear forwards;
}

html.dark body.easter-egg-active .meteor::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80px;
  height: 1px;
  background: linear-gradient(90deg, rgba(255,255,255,0.8), transparent);
  transform: rotate(-135deg) translateX(-50%);
  transform-origin: 0 0;
}

@keyframes meteor-fall {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translate(250px, 250px) scale(0.3);
    opacity: 0;
  }
}

/* 彩蛋模式：容器透明以显示背景图 */
html.dark body.easter-egg-active .app-container,
html.dark body.easter-egg-active #app {
  background-color: transparent !important;
}

/* 彩蛋模式：书签卡片背景参考子分组样式 */
html.dark body.easter-egg-active .bookmark-card-wrapper > div {
  background-color: hsl(var(--primary) / 0.05) !important;
}

/* 深色模式：主分组选中背景与 hover 保持一致 */
html.dark body.easter-egg-active .main-group-tab[data-active="true"] {
  background-color: hsl(var(--accent)) !important;
  color: hsl(var(--accent-foreground)) !important;
}

/* 彩蛋模式：顶部导航栏透明 */
html.dark body.easter-egg-active header {
  background-color: transparent !important;
}

/* 彩蛋模式：子分组按钮透明背景 */
html.dark body.easter-egg-active .subgroup-sort-item button {
  background-color: transparent !important;
}

html.dark body.easter-egg-active .subgroup-sort-item button:hover,
html.dark body.easter-egg-active .subgroup-sort-item button[data-active="true"] {
  background-color: hsl(var(--accent)) !important;
  color: hsl(var(--accent-foreground)) !important;
}

/* 彩蛋模式：仅主应用内 Card 组件透明背景（不影响 Teleport 全局提示层） */
html.dark body.easter-egg-active .app-container .rounded-xl.border.bg-card,
html.dark body.easter-egg-active .app-container [class*="rounded-xl"][class*="border"][class*="bg-card"] {
  background-color: hsl(var(--primary) / 0.08) !important;
  border-color: hsl(var(--primary) / 0.15) !important;
}

/* 彩蛋模式：Button default 变体透明背景 */
html.dark body.easter-egg-active button[class*="bg-primary"][class*="text-primary-foreground"],
html.dark body.easter-egg-active .button-default,
html.dark body.easter-egg-active [role="button"][class*="bg-primary"] {
  background-color: hsl(var(--primary) / 0.15) !important;
  color: hsl(var(--primary)) !important;
  border-color: hsl(var(--primary) / 0.2) !important;
}

/* 彩蛋模式：设置侧边栏透明 */
html.dark body.easter-egg-active nav[class*="bg-card"],
html.dark body.easter-egg-active nav[class*="bg-card/30"] {
  background-color: hsl(var(--primary) / 0.05) !important;
  border-color: hsl(var(--primary) / 0.1) !important;
}

/* 彩蛋模式：提示/通知类组件透明 */
html.dark body.easter-egg-active [class*="bg-primary/5"],
html.dark body.easter-egg-active [class*="bg-primary/10"],
html.dark body.easter-egg-active .bg-primary\5,
html.dark body.easter-egg-active .bg-primary\10 {
  background-color: hsl(var(--primary) / 0.1) !important;
}

/* 彩蛋模式：FaqNotice 和 OnboardingBanner 背景 */
html.dark body.easter-egg-active [class*="from-primary/5"][class*="to-primary/10"],
html.dark body.easter-egg-active [class*="bg-gradient-to-br"][class*="from-primary"] {
  background: linear-gradient(to bottom right, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.15)) !important;
  border-color: hsl(var(--primary) / 0.15) !important;
}

/* 彩蛋模式：outline 按钮透明背景 */
html.dark body.easter-egg-active button[class*="border-input"][class*="bg-background"],
html.dark body.easter-egg-active button[class*="variant-outline"],
html.dark body.easter-egg-active [class*="variant-outline"] {
  background-color: hsl(var(--primary) / 0.05) !important;
  border-color: hsl(var(--primary) / 0.2) !important;
  color: hsl(var(--primary)) !important;
}

/* uTools 环境：仅主应用内 Card 使用深色背景（不覆盖 Teleport 全局提示层） */
body.easter-egg-active .app-container .rounded-xl.border.bg-card,
body.easter-egg-active .app-container [class*="rounded-xl"][class*="bg-card"] {
  background-color: #3A3C3E !important;
  color: #ffffff !important;
}

/* uTools 环境：强制设置侧边栏使用深色背景 */
body.easter-egg-active nav button[class*="bg-accent"],
body.easter-egg-active nav button[class*="bg-primary"],
body.easter-egg-active nav [class*="bg-accent"],
body.easter-egg-active nav [class*="bg-primary"] {
  background-color: #505357 !important;
}
</style>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
/* 彩蛋相关样式已移至全局 style */
</style>
