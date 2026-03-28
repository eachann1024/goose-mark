import PinyinMatch from 'pinyin-match'
import { trackEvent } from '@/services/analytics'
import { useSettingsStore } from '@/stores/settings'
import { useBookmarkStore } from '@/stores/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'
import type { Bookmark, BookmarkLocation, Group } from '@/types/bookmark'
import { resolveBookmarkLaunchUrl } from '@/lib/utils'

const MCP_TOOL_REQUEST_EVENT = 'goose-marks:mcp-tool-request'
const MCP_TOOL_RESPONSE_EVENT = 'goose-marks:mcp-tool-response'
const MCP_TOOL_READY_EVENT = 'goose-marks:mcp-tool-ready'

type McpToolName =
  | 'get_bookmark_tree'
  | 'list_groups'
  | 'list_bookmarks'
  | 'search_bookmarks'
  | 'get_bookmark'
  | 'open_bookmark'
  | 'create_group'
  | 'update_group'
  | 'remove_group'
  | 'create_sub_group'
  | 'update_sub_group'
  | 'remove_sub_group'
  | 'create_bookmark'
  | 'update_bookmark'
  | 'set_bookmark_locations'
  | 'remove_bookmark'
  | 'restore_bookmark'

type McpToolRequestDetail = {
  requestId: string
  tool: McpToolName
  params?: Record<string, unknown>
}

type McpToolResponseDetail = {
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}

type BookmarkListParams = {
  groupId?: unknown
  subGroupId?: unknown
  includeTrash?: unknown
  limit?: unknown
  offset?: unknown
}

type SearchBookmarksParams = {
  query?: unknown
  groupId?: unknown
  subGroupId?: unknown
  includeTrash?: unknown
  limit?: unknown
}

type BookmarkMutationParams = {
  bookmarkId?: unknown
  title?: unknown
  url?: unknown
  desc?: unknown
  tags?: unknown
  pinned?: unknown
  allowUniversal?: unknown
  locations?: unknown
}

type LocationInput = {
  groupId?: unknown
  subGroupId?: unknown
}

type UToolsOpenApi = {
  shellOpenExternal?: (url: string) => void
  ubrowser?: {
    goto(url: string): {
      run(options?: { width?: number; height?: number }): Promise<unknown[]>
    }
  }
  outPlugin?: (isKill?: boolean) => boolean
  getWindowType?: () => 'main' | 'detach' | 'browser'
}

let mcpBridgeInitialized = false

const toPlain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const asBoolean = (value: unknown, fallback = false) => typeof value === 'boolean' ? value : fallback

const asInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(numeric)))
}

const requireText = (value: unknown, label: string) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${label}不能为空`)
  return text
}

const optionalText = (value: unknown) => {
  if (value === undefined) return undefined
  return String(value ?? '').trim()
}

const normalizeTags = (value: unknown) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('tags 必须是字符串数组')
  const tags = value
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
  return Array.from(new Set(tags))
}

const getBookmarkLocationsSafe = (store: ReturnType<typeof useBookmarkStore>, bookmark: Bookmark) => {
  const current = Array.isArray(bookmark.locations) && bookmark.locations.length > 0
    ? bookmark.locations
    : store.getBookmarkLocations(bookmark.id)
  return current.map(loc => ({
    groupId: loc.groupId,
    subGroupId: loc.subGroupId,
  }))
}

const findGroup = (store: ReturnType<typeof useBookmarkStore>, groupId: string) => {
  return store.groups.find(group => group.id === groupId) || null
}

const findSubGroup = (store: ReturnType<typeof useBookmarkStore>, subGroupId: string, groupId?: string) => {
  if (groupId) {
    const group = findGroup(store, groupId)
    const sub = group?.children.find(item => item.id === subGroupId) || null
    return group && sub ? { group, sub } : null
  }

  for (const group of store.groups) {
    const sub = group.children.find(item => item.id === subGroupId)
    if (sub) return { group, sub }
  }

  return null
}

const assertNonTrashGroup = (groupId: string) => {
  if (groupId === TRASH_GROUP_ID) {
    throw new Error('回收站不支持此操作')
  }
}

const getDefaultLocation = (store: ReturnType<typeof useBookmarkStore>): BookmarkLocation => {
  const group = store.groups.find(item => item.id !== TRASH_GROUP_ID) || store.groups[0]
  const sub = group?.children[0]
  if (!group || !sub) {
    return { groupId: 'g-default', subGroupId: 'sg-default' }
  }
  return { groupId: group.id, subGroupId: sub.id }
}

const normalizeLocations = (store: ReturnType<typeof useBookmarkStore>, value: unknown, { allowTrash = false } = {}) => {
  if (!Array.isArray(value)) throw new Error('locations 必须是数组')
  if (value.length === 0) throw new Error('locations 不能为空')

  const seen = new Set<string>()
  const result: BookmarkLocation[] = []

  value.forEach((item, index) => {
    const payload = (item || {}) as LocationInput
    const groupId = requireText(payload.groupId, `locations[${index}].groupId`)
    const subGroupId = requireText(payload.subGroupId, `locations[${index}].subGroupId`)
    if (!allowTrash && (groupId === TRASH_GROUP_ID || subGroupId === 'sg-trash')) {
      throw new Error('locations 不支持直接写入回收站')
    }
    const matched = findSubGroup(store, subGroupId, groupId)
    if (!matched) {
      throw new Error(`未找到位置 ${groupId}/${subGroupId}`)
    }
    const key = `${groupId}:${subGroupId}`
    if (seen.has(key)) return
    seen.add(key)
    result.push({ groupId, subGroupId })
  })

  return result
}

const getLocationNames = (store: ReturnType<typeof useBookmarkStore>, locations: BookmarkLocation[]) => {
  return locations.map(location => {
    const group = findGroup(store, location.groupId)
    const sub = group?.children.find(item => item.id === location.subGroupId)
    return {
      groupId: location.groupId,
      groupName: group?.name || '',
      subGroupId: location.subGroupId,
      subGroupName: sub?.name || '',
    }
  })
}

const serializeBookmark = (store: ReturnType<typeof useBookmarkStore>, bookmark: Bookmark) => {
  const locations = getBookmarkLocationsSafe(store, bookmark)
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    desc: bookmark.desc ?? '',
    tags: [...(bookmark.tags || [])],
    pinned: bookmark.pinned === true,
    allowUniversal: bookmark.allowUniversal === true,
    hasTemplate: /{[^}]+}/.test(bookmark.url || ''),
    isInTrash: store.isBookmarkInTrash(bookmark),
    locations,
    locationNames: getLocationNames(store, locations),
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt,
    iconType: bookmark.icon?.type || null,
  }
}

const filterBookmarksByScope = (
  store: ReturnType<typeof useBookmarkStore>,
  bookmarks: Bookmark[],
  options: {
    groupId?: string
    subGroupId?: string
    includeTrash?: boolean
  },
) => {
  const includeTrash = options.includeTrash === true

  return bookmarks.filter(bookmark => {
    if (!includeTrash && store.isBookmarkInTrash(bookmark)) return false
    const locations = getBookmarkLocationsSafe(store, bookmark)
    if (!options.groupId && !options.subGroupId) return true

    return locations.some(location => {
      if (options.groupId && location.groupId !== options.groupId) return false
      if (options.subGroupId && location.subGroupId !== options.subGroupId) return false
      return true
    })
  })
}

const ensureScope = (store: ReturnType<typeof useBookmarkStore>, params: { groupId?: string; subGroupId?: string; includeTrash?: boolean }) => {
  if (params.groupId) {
    const group = findGroup(store, params.groupId)
    if (!group) throw new Error(`未找到分组 ${params.groupId}`)
    if (!params.includeTrash && group.id === TRASH_GROUP_ID) {
      throw new Error('查询回收站请显式传 includeTrash=true')
    }
  }

  if (params.subGroupId) {
    const matched = findSubGroup(store, params.subGroupId, params.groupId)
    if (!matched) throw new Error(`未找到子分组 ${params.subGroupId}`)
    if (!params.includeTrash && matched.group.id === TRASH_GROUP_ID) {
      throw new Error('查询回收站请显式传 includeTrash=true')
    }
  }
}

const openResolvedUrl = (settingsStore: ReturnType<typeof useSettingsStore>, url: string, bookmarkId: string, hasTemplate: boolean) => {
  trackEvent('bookmark_open', {
    source: 'mcp',
    openMethod: 'plugin',
    bookmarkId,
    hasTemplate,
    useUtoolsBrowser: settingsStore.preferUtoolsBrowser,
    autoCloseWindow: settingsStore.autoCloseWindow,
  })

  const utoolsApi = window.utools as unknown as UToolsOpenApi | undefined
  let opened = false

  if (settingsStore.preferUtoolsBrowser && utoolsApi?.ubrowser) {
    try {
      utoolsApi.ubrowser.goto(url).run({ width: 1280, height: 800 })
      opened = true
    } catch (error) {
      console.warn('[MCP] 内置浏览器打开失败', error)
    }
  }

  if (!opened) {
    if (utoolsApi?.shellOpenExternal) {
      utoolsApi.shellOpenExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  if (settingsStore.autoCloseWindow) {
    try {
      const windowType = utoolsApi?.getWindowType?.()
      if (windowType === 'detach' || windowType === 'browser') {
        utoolsApi?.outPlugin?.()
      }
    } catch (error) {
      console.warn('[MCP] 自动关闭窗口失败', error)
    }
  }
}

const buildGroupSummary = (store: ReturnType<typeof useBookmarkStore>, group: Group, includeTrash: boolean, includeBookmarks = false) => {
  const children = group.children.map(sub => {
    const items = sub.bookmarkIds
      .map(id => store.bookmarks.find(bookmark => bookmark.id === id))
      .filter((bookmark): bookmark is Bookmark => !!bookmark)
      .filter(bookmark => includeTrash || !store.isBookmarkInTrash(bookmark))

    return {
      id: sub.id,
      name: sub.name,
      count: items.length,
      ...(includeBookmarks ? { bookmarks: items.map(bookmark => serializeBookmark(store, bookmark)) } : {}),
    }
  })

  return {
    id: group.id,
    name: group.name,
    count: children.reduce((sum, sub) => sum + sub.count, 0),
    children,
  }
}

const executeMcpTool = async (
  store: ReturnType<typeof useBookmarkStore>,
  settingsStore: ReturnType<typeof useSettingsStore>,
  tool: McpToolName,
  rawParams: Record<string, unknown> = {},
) => {
  switch (tool) {
    case 'get_bookmark_tree': {
      const includeBookmarks = rawParams.includeBookmarks === undefined ? true : asBoolean(rawParams.includeBookmarks, true)
      const includeTrash = asBoolean(rawParams.includeTrash, false)
      const groups = store.groups
        .filter(group => includeTrash || group.id !== TRASH_GROUP_ID)
        .map(group => buildGroupSummary(store, group, includeTrash, includeBookmarks))

      return {
        groups,
        totalGroups: groups.length,
        totalBookmarks: groups.reduce((sum, group) => sum + group.count, 0),
      }
    }

    case 'list_groups': {
      const includeTrash = asBoolean(rawParams.includeTrash, false)
      const groups = store.groups
        .filter(group => includeTrash || group.id !== TRASH_GROUP_ID)
        .map(group => buildGroupSummary(store, group, includeTrash, false))

      return {
        groups,
        totalGroups: groups.length,
        totalSubGroups: groups.reduce((sum, group) => sum + group.children.length, 0),
        totalBookmarks: groups.reduce((sum, group) => sum + group.count, 0),
      }
    }

    case 'list_bookmarks': {
      const params = rawParams as BookmarkListParams
      const groupId = optionalText(params.groupId)
      const subGroupId = optionalText(params.subGroupId)
      const includeTrash = asBoolean(params.includeTrash, false)
      const limit = asInteger(params.limit, 100, 1, 500)
      const offset = asInteger(params.offset, 0, 0, Number.MAX_SAFE_INTEGER)

      ensureScope(store, { groupId, subGroupId, includeTrash })

      const filtered = filterBookmarksByScope(store, store.bookmarks, { groupId, subGroupId, includeTrash })
      const items = filtered.slice(offset, offset + limit).map(bookmark => serializeBookmark(store, bookmark))

      return {
        items,
        total: filtered.length,
        limit,
        offset,
      }
    }

    case 'search_bookmarks': {
      const params = rawParams as SearchBookmarksParams
      const query = requireText(params.query, 'query').toLowerCase()
      const groupId = optionalText(params.groupId)
      const subGroupId = optionalText(params.subGroupId)
      const includeTrash = asBoolean(params.includeTrash, false)
      const limit = asInteger(params.limit, 50, 1, 200)

      ensureScope(store, { groupId, subGroupId, includeTrash })

      const filtered = filterBookmarksByScope(store, store.bookmarks, { groupId, subGroupId, includeTrash })
        .filter(bookmark => {
          const haystack = [bookmark.title, bookmark.desc ?? '', bookmark.url, (bookmark.tags || []).join(' ')]
            .join(' ')
            .toLowerCase()
          return haystack.includes(query) || !!PinyinMatch.match(haystack, query)
        })

      return {
        query,
        items: filtered.slice(0, limit).map(bookmark => serializeBookmark(store, bookmark)),
        total: filtered.length,
        limit,
      }
    }

    case 'get_bookmark': {
      const bookmarkId = requireText(rawParams.bookmarkId, 'bookmarkId')
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId)
      if (!bookmark) throw new Error(`未找到书签 ${bookmarkId}`)
      return {
        bookmark: serializeBookmark(store, bookmark),
      }
    }

    case 'open_bookmark': {
      const bookmarkId = requireText(rawParams.bookmarkId, 'bookmarkId')
      const query = optionalText(rawParams.query) || ''
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId)
      if (!bookmark) throw new Error(`未找到书签 ${bookmarkId}`)
      const hasTemplate = /{[^}]+}/.test(bookmark.url || '')
      if (hasTemplate && !query.trim()) {
        throw new Error('模板书签必须提供 query')
      }

      const url = resolveBookmarkLaunchUrl(bookmark.url, query)
      if (!url) throw new Error('书签地址无效，无法打开')

      store.updateBookmark(bookmark.id, {})
      openResolvedUrl(settingsStore, url, bookmark.id, hasTemplate)

      return {
        opened: true,
        bookmarkId: bookmark.id,
        url,
        hasTemplate,
      }
    }

    case 'create_group': {
      const name = requireText(rawParams.name, 'name')
      const firstSubGroupName = optionalText(rawParams.firstSubGroupName)
      const group = store.addGroup(name)

      if (firstSubGroupName && group.children[0]) {
        store.updateSubGroup(group.id, group.children[0].id, firstSubGroupName)
      }

      return {
        group: buildGroupSummary(store, findGroup(store, group.id)!, false, false),
      }
    }

    case 'update_group': {
      const groupId = requireText(rawParams.groupId, 'groupId')
      const name = requireText(rawParams.name, 'name')
      assertNonTrashGroup(groupId)
      const group = findGroup(store, groupId)
      if (!group) throw new Error(`未找到分组 ${groupId}`)
      store.updateGroup(groupId, name)
      return {
        group: buildGroupSummary(store, findGroup(store, groupId)!, false, false),
      }
    }

    case 'remove_group': {
      const groupId = requireText(rawParams.groupId, 'groupId')
      assertNonTrashGroup(groupId)
      const removed = store.removeGroup(groupId)
      if (!removed) throw new Error(`未找到分组 ${groupId}`)
      return {
        removed: true,
        groupId,
      }
    }

    case 'create_sub_group': {
      const groupId = requireText(rawParams.groupId, 'groupId')
      const name = requireText(rawParams.name, 'name')
      assertNonTrashGroup(groupId)
      const group = findGroup(store, groupId)
      if (!group) throw new Error(`未找到分组 ${groupId}`)
      const subGroup = store.addSubGroup(name, groupId)
      if (!subGroup) throw new Error('创建子分组失败')
      return {
        groupId,
        subGroup: toPlain(subGroup),
      }
    }

    case 'update_sub_group': {
      const groupId = requireText(rawParams.groupId, 'groupId')
      const subGroupId = requireText(rawParams.subGroupId, 'subGroupId')
      const name = requireText(rawParams.name, 'name')
      assertNonTrashGroup(groupId)
      const matched = findSubGroup(store, subGroupId, groupId)
      if (!matched) throw new Error(`未找到子分组 ${subGroupId}`)
      store.updateSubGroup(groupId, subGroupId, name)
      return {
        groupId,
        subGroup: toPlain(findSubGroup(store, subGroupId, groupId)!.sub),
      }
    }

    case 'remove_sub_group': {
      const groupId = requireText(rawParams.groupId, 'groupId')
      const subGroupId = requireText(rawParams.subGroupId, 'subGroupId')
      assertNonTrashGroup(groupId)
      const removed = store.removeSubGroup(groupId, subGroupId)
      if (!removed) throw new Error(`未找到子分组 ${subGroupId}`)
      return {
        removed: true,
        groupId,
        subGroupId,
      }
    }

    case 'create_bookmark': {
      const params = rawParams as BookmarkMutationParams
      const title = requireText(params.title, 'title')
      const url = requireText(params.url, 'url')
      const desc = optionalText(params.desc)
      const tags = normalizeTags(params.tags) ?? []
      const pinned = params.pinned === undefined ? undefined : asBoolean(params.pinned)
      const allowUniversal = params.allowUniversal === undefined ? undefined : asBoolean(params.allowUniversal)
      const locations = params.locations === undefined
        ? [getDefaultLocation(store)]
        : normalizeLocations(store, params.locations)

      const bookmark = store.addBookmark({
        title,
        url,
        desc,
        tags,
        pinned,
        allowUniversal,
      }, locations)

      return {
        bookmark: serializeBookmark(store, bookmark),
      }
    }

    case 'update_bookmark': {
      const params = rawParams as BookmarkMutationParams
      const bookmarkId = requireText(params.bookmarkId, 'bookmarkId')
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId)
      if (!bookmark) throw new Error(`未找到书签 ${bookmarkId}`)

      const updater: Partial<Bookmark> = {}
      if (params.title !== undefined) updater.title = requireText(params.title, 'title')
      if (params.url !== undefined) updater.url = requireText(params.url, 'url')
      if (params.desc !== undefined) updater.desc = optionalText(params.desc) ?? ''
      if (params.tags !== undefined) updater.tags = normalizeTags(params.tags) ?? []
      if (params.pinned !== undefined) updater.pinned = asBoolean(params.pinned)
      if (params.allowUniversal !== undefined) updater.allowUniversal = asBoolean(params.allowUniversal)

      store.updateBookmark(bookmarkId, updater)

      return {
        bookmark: serializeBookmark(store, store.bookmarks.find(item => item.id === bookmarkId)!),
      }
    }

    case 'set_bookmark_locations': {
      const params = rawParams as BookmarkMutationParams
      const bookmarkId = requireText(params.bookmarkId, 'bookmarkId')
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId)
      if (!bookmark) throw new Error(`未找到书签 ${bookmarkId}`)
      const locations = normalizeLocations(store, params.locations)
      store.updateBookmarkLocations(bookmarkId, locations)
      return {
        bookmark: serializeBookmark(store, store.bookmarks.find(item => item.id === bookmarkId)!),
      }
    }

    case 'remove_bookmark': {
      const bookmarkId = requireText(rawParams.bookmarkId, 'bookmarkId')
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId)
      if (!bookmark) throw new Error(`未找到书签 ${bookmarkId}`)
      const alreadyInTrash = store.isBookmarkInTrash(bookmark)
      store.removeBookmark(bookmarkId)
      return {
        removed: true,
        bookmarkId,
        mode: alreadyInTrash ? 'permanent' : 'trash',
      }
    }

    case 'restore_bookmark': {
      const bookmarkId = requireText(rawParams.bookmarkId, 'bookmarkId')
      const bookmark = store.bookmarks.find(item => item.id === bookmarkId)
      if (!bookmark) throw new Error(`未找到书签 ${bookmarkId}`)
      store.restoreBookmark(bookmarkId)
      return {
        bookmark: serializeBookmark(store, store.bookmarks.find(item => item.id === bookmarkId)!),
      }
    }
  }
}

export function initMcpToolsBridge() {
  if (typeof window === 'undefined') return

  if (mcpBridgeInitialized) {
    window.__gooseMarksMcpReady = true
    window.dispatchEvent(new CustomEvent(MCP_TOOL_READY_EVENT))
    return
  }

  const store = useBookmarkStore()
  const settingsStore = useSettingsStore()

  const handleToolRequest = async (event: Event) => {
    const customEvent = event as CustomEvent<McpToolRequestDetail>
    const detail = customEvent.detail
    if (!detail?.requestId || !detail.tool) return

    let response: McpToolResponseDetail

    try {
      const result = await executeMcpTool(store, settingsStore, detail.tool, detail.params || {})
      response = {
        requestId: detail.requestId,
        ok: true,
        result,
      }
    } catch (error) {
      response = {
        requestId: detail.requestId,
        ok: false,
        error: error instanceof Error ? error.message : '工具执行失败',
      }
    }

    window.dispatchEvent(new CustomEvent<McpToolResponseDetail>(MCP_TOOL_RESPONSE_EVENT, {
      detail: response,
    }))
  }

  window.addEventListener(MCP_TOOL_REQUEST_EVENT, handleToolRequest as EventListener)
  window.__gooseMarksMcpReady = true
  window.dispatchEvent(new CustomEvent(MCP_TOOL_READY_EVENT))
  mcpBridgeInitialized = true
}
