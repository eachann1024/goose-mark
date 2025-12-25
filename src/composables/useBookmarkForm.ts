
import { onClickOutside, createSharedComposable } from '@vueuse/core'
import type { Bookmark, IconSource, BookmarkLocation } from '@/types/bookmark'
import { iconToDisplayUrl, fetchAndCacheIcon } from '@/services/iconCache'
import { useToast } from './useToast'


type UBrowserApi = {
  goto: (url: string) => {
    wait: (ms: number) => {
      evaluate: <T>(fn: () => T) => {
        run: (opts: { width: number; height: number; show: boolean }) => Promise<T[]>
      }
    }
  }
}

type UToolsExtendedApi = {
    ubrowser?: UBrowserApi
}

function _useBookmarkForm() {
  const store = useBookmarkStore()
  const statsStore = useStatsStore()
  const settingsStore = useSettingsStore()
  const { 
    checkUrl, isUrlAccessible, isCheckingUrl, isGenerating, aiError, generateMetadata, checkAiAvailable,
    suggestCategory, isSuggestingCategory 
  } = useAI()

  // 状态定义 - 在函数内部，但由于 createSharedComposable 只会执行一次
  const showAdd = ref(false)
  const modalTitle = ref('新建书签')
  const editingId = ref('')
  
  const draft = reactive({ 
    title: '', 
    url: '', 
    desc: '',
    allowUniversal: false
  })
  
  const draftLocations = ref<BookmarkLocation[]>([])
  const previewIcon = ref<IconSource | null>(null)
  
  const showCategorySelector = ref(false)
  const showIconSelector = ref(false)
  const categorySelectContainer = ref(null)
  
  const formError = ref('')
  const isSaving = ref(false)
  const showDeleteConfirmLocal = ref(false)
  
  const iconLoading = ref(false)
  const iconFetchFailed = ref(false)
  
  const isTitleDirty = ref(false)
  const isDescDirty = ref(false)
  const lastAutoHostname = ref('')
  const originalUrl = ref('') // 编辑时的原始 URL，用于判断是否需要重新获取图标

  const dialogOrigin = ref<{ x: string; y: string } | null>(null)

  // 撤回功能：保存 AI 调用前的原始值
  const originalBeforeAI = ref<{
    title: string
    desc: string
  } | null>(null)

  let fetchTimer: ReturnType<typeof setTimeout> | null = null
  const { scheduleShareUpdate } = useShare()
  const { showToast } = useToast()

  // AI 分类建议
  const categorySuggestion = ref<{
    groupId: string
    groupName: string
    subGroupId: string
    subGroupName: string
    confidence: number
    reason: string
  } | null>(null)

  // 通用的自动更新分享函数
  // 支持多个位置，会更新所有涉及的分享
  const autoUpdateShareForLocations = (locations: BookmarkLocation[]) => {
    // 已调度的 shareId 集合，避免重复调度
    const scheduledKeys = new Set<string>()
    
    for (const loc of locations) {
      const group = store.groups.find(g => g.id === loc.groupId)
      if (!group) continue
      
      // 1. 优先检查主分组是否有 shareId
      if (group.shareId) {
        const key = `group:${group.id}`
        if (!scheduledKeys.has(key)) {
          scheduleShareUpdate('group', loc.groupId)
          scheduledKeys.add(key)
        }
        continue
      }
      
      // 2. 如果主分组没有 shareId，检查子分组是否有 shareId
      const subGroup = group.children.find(c => c.id === loc.subGroupId)
      if (subGroup?.shareId) {
        const key = `subGroup:${group.id}:${subGroup.id}`
        if (!scheduledKeys.has(key)) {
          scheduleShareUpdate('subGroup', loc.groupId, loc.subGroupId)
          scheduledKeys.add(key)
        }
      }
    }
  }

  // Computed
  const isEditing = computed(() => !!editingId.value)
  const maxDescLen = 300

  const previewIconStyle = computed(() => {
    if (previewIcon.value?.bgColor) {
      return { backgroundColor: previewIcon.value.bgColor }
    }
    return { backgroundColor: 'transparent' }
  })

  const previewText = computed(() => {
    const text = (draft.title || draft.url || '').trim()
    return text ? text.slice(0, 4) : 'ICON'
  })

  const previewIconUrl = computed(() => iconToDisplayUrl(previewIcon.value ?? undefined))

  const selectedLocationsLabel = computed(() => {
    if (draftLocations.value.length === 0) return ''
    return draftLocations.value.map(loc => {
      const group = store.groups.find(g => g.id === loc.groupId)
      const sub = group?.children.find(c => c.id === loc.subGroupId)
      return group && sub ? `${group.name} / ${sub.name}` : ''
    }).filter(Boolean).join(', ')
  })
  
  const isDraftTemplate = computed(() => /{[^}]+}/.test(draft.url))
  const getTemplateLabel = (url: string) => {
      const label = (url.match(/{([^}]+)}/)?.[1] ?? '').trim()
      return label || '搜索内容'
  }
  const draftTemplateLabel = computed(() => getTemplateLabel(draft.url))

  // Helpers
  const buildTextIcon = (): IconSource => {
    const base = (draft.title || draft.url).trim()
    const text = base ? base.slice(0, 4).toUpperCase() : '•'
    return { type: 'text', value: text }
  }

  const setDialogOrigin = (eventOrEl?: MouseEvent | HTMLElement) => {
    if (!eventOrEl) {
      dialogOrigin.value = null
      return
    }
    
    let rect: DOMRect | undefined
    if (eventOrEl instanceof MouseEvent) {
      const target = eventOrEl.currentTarget as HTMLElement
      rect = target?.getBoundingClientRect?.()
    } else if (eventOrEl instanceof HTMLElement) {
      rect = eventOrEl.getBoundingClientRect()
    }
    
    if (rect) {
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      dialogOrigin.value = {
        x: `${(centerX / window.innerWidth) * 100}%`,
        y: `${(centerY / window.innerHeight) * 100}%`
      }
    } else {
      dialogOrigin.value = null
    }
  }

  const askAI = async (showNotify = false) => {
    if (!draft.url) return

    const { available, reason } = checkAiAvailable()
    if (!available) {
      if (showNotify) notify(reason)
      formError.value = reason
      return
    }

    // 保存 AI 调用前的原始值（仅在首次调用时保存）
    if (!originalBeforeAI.value) {
      originalBeforeAI.value = {
        title: draft.title,
        desc: draft.desc
      }
    }

    addBehaviorLog('ask-ai', draft.url)
    const res = await generateMetadata(draft.url)
    if (res) {
        if (res.title) draft.title = res.title
        if (res.desc) draft.desc = res.desc
    } else if (aiError.value) {
        if (showNotify) notify(aiError.value)
        formError.value = aiError.value
    }
  }

  const undoTitle = () => {
    if (!originalBeforeAI.value) return
    draft.title = originalBeforeAI.value.title
  }

  const undoDesc = () => {
    if (!originalBeforeAI.value) return
    draft.desc = originalBeforeAI.value.desc
  }

  const hasAIGenerated = computed(() => !!originalBeforeAI.value)

  const onTitleInput = () => {
    isTitleDirty.value = true
  }

  const onDescInput = () => {
    isDescDirty.value = true
  }

  // AI 分类建议方法
  const askCategorySuggestion = async () => {
    if (!draft.url) return

    const { available, reason } = checkAiAvailable()
    if (!available) {
      showToast({ title: reason, variant: 'warning' })
      return
    }

    // 构建现有分组信息
    const existingGroups = store.groups
      .filter(g => g.id !== TRASH_GROUP_ID)
      .map(g => ({
        id: g.id,
        name: g.name,
        subGroups: g.children.map(c => ({ id: c.id, name: c.name }))
      }))

    if (existingGroups.length === 0) {
      showToast({ title: '请先创建分组', variant: 'warning' })
      return
    }

    addBehaviorLog('ask-category-suggestion', draft.url)
    const result = await suggestCategory(draft.url, existingGroups)
    
    if (result) {
      categorySuggestion.value = result
    } else if (aiError.value) {
      showToast({ title: aiError.value, variant: 'warning' })
    } else {
      showToast({ title: '未找到合适的分类建议', variant: 'info' })
    }
  }

  const applyCategorySuggestion = () => {
    if (!categorySuggestion.value) return
    
    draftLocations.value = [{
      groupId: categorySuggestion.value.groupId,
      subGroupId: categorySuggestion.value.subGroupId
    }]
    categorySuggestion.value = null
    showToast({ title: '已应用分类建议', variant: 'success' })
  }

  const dismissCategorySuggestion = () => {
    categorySuggestion.value = null
  }

  const requestDelete = () => {
    if (!editingId.value) return
    showDeleteConfirmLocal.value = true
  }

  const confirmDelete = () => {
    if (editingId.value) {
      addBehaviorLog('delete-bookmark', `id: ${editingId.value}`)
      store.removeBookmark(editingId.value)
      showAdd.value = false
    }
    showDeleteConfirmLocal.value = false
  }

  // Actions
  const openAdd = (eventOrEl?: MouseEvent | HTMLElement) => {
    setDialogOrigin(eventOrEl)
    editingId.value = ''
    modalTitle.value = '新建书签'
    draft.title = ''
    draft.url = ''
    draft.allowUniversal = false
    draft.desc = ''
    draftLocations.value = [{ groupId: store.activeGroupId, subGroupId: store.activeSubGroupId }]
    previewIcon.value = null
    formError.value = ''
    isTitleDirty.value = false
    isDescDirty.value = false
    lastAutoHostname.value = ''
    originalUrl.value = ''
    showAdd.value = true
  }

  const openEdit = (bookmark: Bookmark, eventOrEl?: MouseEvent | HTMLElement) => {
    setDialogOrigin(eventOrEl)
    editingId.value = bookmark.id
    modalTitle.value = '编辑书签'
    draft.title = bookmark.title || ''
    draft.url = bookmark.url
    draft.allowUniversal = bookmark.allowUniversal ?? false
    draft.desc = bookmark.desc || ''
    previewIcon.value = bookmark.icon ?? null
    formError.value = ''
    isTitleDirty.value = true // 编辑模式下默认认为已脏，不自动覆盖
    isDescDirty.value = true
    lastAutoHostname.value = ''
    originalUrl.value = bookmark.url // 保存原始 URL，用于判断是否需要重新获取图标
    
    draftLocations.value = store.getBookmarkLocations(bookmark.id)
    showAdd.value = true
  }

  const handleSave = async () => {
    formError.value = ''
    if (!draft.title.trim() || !draft.url.trim()) {
      formError.value = '标题和链接为必填项'
      return
    }
    if (draftLocations.value.length === 0) {
      formError.value = '请至少选择一个分类'
      return
    }

    if (isSaving.value) return
    isSaving.value = true

    try {
      addBehaviorLog(editingId.value ? 'edit-bookmark' : 'add-bookmark', `${draft.title} ${draft.url}`.trim())
      const iconToSave = previewIcon.value ?? buildTextIcon()

      if (editingId.value) {
        // 修改书签：获取旧位置和新位置，合并后检查分享
        const oldLocations = store.getBookmarkLocations(editingId.value)
        store.updateBookmark(editingId.value, {
          title: draft.title.trim(),
          url: draft.url.trim(),
          desc: draft.desc.trim(),
          allowUniversal: draft.allowUniversal,
          icon: iconToSave
        })
        store.updateBookmarkLocations(editingId.value, draftLocations.value)
        
        // 合并旧位置和新位置，确保所有相关分享都被更新
        const allLocations = [...oldLocations, ...draftLocations.value]
        // 去重
        const uniqueLocations = Array.from(
          new Map(allLocations.map(loc => [`${loc.groupId}:${loc.subGroupId}`, loc])).values()
        )
        autoUpdateShareForLocations(uniqueLocations)
      } else {
        const created = store.addBookmark(
          {
            title: draft.title.trim(),
            url: draft.url.trim(),
            desc: draft.desc.trim(),
            allowUniversal: draft.allowUniversal,
            tags: [],
            pinned: false,
            icon: iconToSave
          },
          draftLocations.value
        )
        if (created && iconToSave?.type === 'text') void store.refreshSingleIcon(created)
        statsStore.recordUse('add')
        
        const firstLoc = draftLocations.value[0]
        if (firstLoc) {
             store.setSearch('')
             store.selectGroup(firstLoc.groupId, firstLoc.subGroupId)
        }
        
        // 新增书签：检查新位置
        autoUpdateShareForLocations(draftLocations.value)
      }
      
      showAdd.value = false
    } finally {
      isSaving.value = false
    }
  }

  // Watchers & Listeners
  onClickOutside(categorySelectContainer, () => {
    showCategorySelector.value = false
  })

  // Smart Creation Logic
  watch(() => draft.url, async (val) => {
    checkUrl(val)
    
    if (!val) {
      if (fetchTimer) clearTimeout(fetchTimer)
      previewIcon.value = null
      iconLoading.value = false
      if (!isTitleDirty.value) draft.title = ''
      if (!isDescDirty.value) draft.desc = ''
      return
    }
  
    // 编辑模式下：如果 URL 没有变化，跳过自动获取图标和标题
    if (editingId.value && val === originalUrl.value) {
      return
    }
  
    const resolveHostname = () => {
      try {
        const cleanUrl = val.replace(/{[^}]+}/g, '')
        const u = new URL(cleanUrl.includes('://') ? cleanUrl : 'https://' + cleanUrl)
        return u.hostname
      } catch {
        return ''
      }
    }
    
    const hostname = resolveHostname()
    // 只要用户没手动改过标题，或者当前标题就是我们自动生成的上一个 hostname，就跟随最新的 hostname 变
    if (!isTitleDirty.value || draft.title === lastAutoHostname.value) {
      if (hostname) {
        draft.title = hostname
        lastAutoHostname.value = hostname
      }
    }
  
    if (fetchTimer) clearTimeout(fetchTimer)
    fetchTimer = setTimeout(async () => {
      iconLoading.value = true
      iconFetchFailed.value = false
      try {
        const fetched = await fetchAndCacheIcon(val, true)
        if (fetched) {
          const newIcon: any = { type: fetched.type }
          if ('src' in fetched) newIcon.src = fetched.src
          if ('path' in fetched) newIcon.path = fetched.path
          if ('value' in fetched) newIcon.value = fetched.value
          if ('bgColor' in fetched) newIcon.bgColor = fetched.bgColor
          if ('fetchedAt' in fetched) newIcon.fetchedAt = fetched.fetchedAt
          
          previewIcon.value = newIcon as IconSource
          iconFetchFailed.value = (fetched.type === 'text' || (fetched.type === 'remote' && !fetched.src))
          
          // 自动填充标题和描述（如果用户没改过）
          if (fetched.title && (!isTitleDirty.value || draft.title === lastAutoHostname.value)) {
            draft.title = fetched.title
          }
          if (fetched.description && !isDescDirty.value) {
            draft.desc = fetched.description
          }
        } else {
          previewIcon.value = null
          iconFetchFailed.value = true
          // 如果标题仍是 hostname，则提示
          const currentTitle = draft.title.trim()
          if (!currentTitle || currentTitle === hostname) {
            showToast({ title: '未能自动获取标题，请手动输入。', variant: 'info' })
          }
        }
      } catch {
        previewIcon.value = null
        iconFetchFailed.value = true
      } finally {
        iconLoading.value = false
      }
    }, 1000)
  })


  // Watchers to reset state
  watch(isDraftTemplate, (val) => {
    if (!val) {
      draft.allowUniversal = false
    }
  })

  watch(showAdd, (v) => {
    if (!v) {
      previewIcon.value = null
      showCategorySelector.value = false
      iconLoading.value = false
      editingId.value = ''
      iconFetchFailed.value = false
      formError.value = ''
      isSaving.value = false
      originalBeforeAI.value = null
      categorySuggestion.value = null
      originalUrl.value = ''
      if (fetchTimer) {
        clearTimeout(fetchTimer)
        fetchTimer = null
      }
    }
  })



  // 检测是否在 uTools 环境
  const isUToolsEnv = () => typeof window !== 'undefined' && !!(window as any).utools

  return {
    showAdd,
    modalTitle,
    editingId,
    draft,
    draftLocations,
    previewIcon,
    showCategorySelector,
    showIconSelector,
    categorySelectContainer,
    formError,
    isSaving,
    iconLoading,
    iconFetchFailed,
    dialogOrigin,
    isEditing,
    maxDescLen,
    previewIconStyle,
    previewText,
    previewIconUrl,
    selectedLocationsLabel,
    isDraftTemplate,
    draftTemplateLabel,
    openAdd,
    openEdit,
    handleSave,
    askAI,
    undoTitle,
    undoDesc,
    hasAIGenerated,
    isUrlAccessible,
    isCheckingUrl,
    isGenerating,
    isSuggestingCategory,
    categorySuggestion,
    showDeleteConfirmLocal,
    onTitleInput,
    onDescInput,
    askCategorySuggestion,
    applyCategorySuggestion,
    dismissCategorySuggestion,
    requestDelete,
    confirmDelete
  }
}

// 使用 createSharedComposable 确保全局只有一个实例
// 这样所有组件共享同一份状态，且 watchers 只注册一次
export const useBookmarkForm = createSharedComposable(_useBookmarkForm)

