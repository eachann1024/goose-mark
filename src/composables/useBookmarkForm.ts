
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { onClickOutside, useEventListener, createSharedComposable } from '@vueuse/core'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { ensureIconForBookmark, iconToDisplayUrl } from '@/services/iconCache'
import type { Bookmark, IconSource, BookmarkLocation } from '@/types/bookmark'
import { useAI } from './useAI'
import { useShare } from './useShare'
import { addBehaviorLog } from '@/lib/debugReport'
import { notify } from '@/lib/notify'

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
  const { checkUrl, isUrlAccessible, isCheckingUrl, isGenerating, aiError, generateMetadata, checkAiAvailable } = useAI()

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
  
  const iconLoading = ref(false)
  const iconFetchFailed = ref(false)
  const titleFetchFailed = ref(false)
  
  const dialogOrigin = ref<{ x: string; y: string } | null>(null)

  // 撤回功能：保存 AI 调用前的原始值
  const originalBeforeAI = ref<{
    title: string
    desc: string
  } | null>(null)

  let previewTimer: ReturnType<typeof setTimeout> | null = null
  let titleTimer: ReturnType<typeof setTimeout> | null = null
  const { updateShare } = useShare()

  // 通用的自动更新分享函数
  // 支持多个位置，会更新所有涉及的分享
  const autoUpdateShareForLocations = (locations: BookmarkLocation[]) => {
    // 已更新的 shareId 集合，避免重复更新
    const updatedShareIds = new Set<string>()
    
    for (const loc of locations) {
      const group = store.groups.find(g => g.id === loc.groupId)
      if (!group) continue
      
      // 1. 优先检查主分组是否有 shareId
      if (group.shareId && !updatedShareIds.has(group.shareId)) {
        void updateShare(group.shareId, 'group', loc.groupId)
        updatedShareIds.add(group.shareId)
        // 主分组分享包含所有子分组，不需要再单独更新该分组下的子分组分享
        continue
      }
      
      // 2. 如果主分组没有 shareId，检查子分组是否有 shareId
      const subGroup = group.children.find(c => c.id === loc.subGroupId)
      if (subGroup?.shareId && !updatedShareIds.has(subGroup.shareId)) {
        void updateShare(subGroup.shareId, 'subGroup', loc.groupId, loc.subGroupId)
        updatedShareIds.add(subGroup.shareId)
      }
    }
  }

  // Computed
  const isEditing = computed(() => !!editingId.value)
  const maxDescLen = 200

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

  const fetchPageTitle = async (url: string): Promise<string | null> => {
    const utoolsApi = window.utools as unknown as UToolsExtendedApi | undefined
    if (!utoolsApi?.ubrowser) return null

    try {
      const result = await utoolsApi.ubrowser
        .goto(url)
        .wait(2000)
        .evaluate(() => {
          const title = (document.title || document.querySelector('title')?.textContent || '').trim()
          return title || null
        })
        .run({ width: 1024, height: 768, show: false })
      return result && result.length > 0 ? (result[0] as string | null) : null
    } catch (e) {
      // 静默失败
      return null
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
    
    if (editingId.value) return
    
    if (!val) {
      if (previewTimer) clearTimeout(previewTimer)
      if (titleTimer) clearTimeout(titleTimer)
      previewIcon.value = null
      titleFetchFailed.value = false
      iconLoading.value = false
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
    if (!draft.title) {
      if (hostname) draft.title = hostname
    }
  
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(async () => {
      iconLoading.value = true
      iconFetchFailed.value = false
      try {
        const icon = await ensureIconForBookmark({
          id: 'temp',
          title: draft.title || val,
          url: val,
          desc: draft.desc,
          tags: []
        }, true)
        previewIcon.value = icon ?? null
        iconFetchFailed.value = !icon || icon.type === 'text'
      } catch {
        previewIcon.value = null
        iconFetchFailed.value = true
      } finally {
        iconLoading.value = false
      }
    }, 300)
  
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = setTimeout(async () => {
      const currentTitle = draft.title.trim()
      const shouldUpdate = !currentTitle || currentTitle === hostname
      if (!shouldUpdate) return
      titleFetchFailed.value = false
      
      let targetUrl = val
  
      if (/{[^}]+}/.test(targetUrl)) {
        try {
          const temp = targetUrl.replace(/{[^}]+}/g, 'x')
          const u = new URL(/^https?:\/\//i.test(temp) ? temp : 'https://' + temp)
          targetUrl = u.origin
        } catch {
          targetUrl = targetUrl.replace(/{[^}]+}/g, '')
        }
      }
  
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl
      }
      
      const pageTitle = await fetchPageTitle(targetUrl)
      if (pageTitle) {
        const latest = draft.title.trim()
        if (!latest || latest === hostname) {
          draft.title = pageTitle
        }
        titleFetchFailed.value = false
      } else {
        titleFetchFailed.value = true
      }
    }, 600)
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
      titleFetchFailed.value = false
      iconFetchFailed.value = false
      formError.value = ''
      isSaving.value = false
      originalBeforeAI.value = null
    }
  })

  // Paste Listener
  useEventListener(window, 'paste', (e: ClipboardEvent) => {
    if (!showAdd.value) return
    
    // Ignore if pasting into input/textarea
    const active = document.activeElement as HTMLElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      return
    }
    
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return
  
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
         e.preventDefault() 
         const file = item.getAsFile()
         if (file) {
           const reader = new FileReader()
           reader.onload = (evt) => {
              const result = evt.target?.result as string
              if (result) {
                previewIcon.value = {
                  type: 'remote',
                  src: result,
                  fetchedAt: Date.now()
                }
              }
           }
           reader.readAsDataURL(file)
         }
         return
      }
    }
  })

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
    titleFetchFailed,
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
  }
}

// 使用 createSharedComposable 确保全局只有一个实例
// 这样所有组件共享同一份状态，且 watchers 只注册一次
export const useBookmarkForm = createSharedComposable(_useBookmarkForm)

