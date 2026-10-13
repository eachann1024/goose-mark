import type { ParsedFolder, ParseResult, ParsedBookmark } from '@/lib/htmlBookmarkParser'
import type { Group, Bookmark, SubGroup } from '@/types/bookmark'
import type { ImportData, UrlWizardFolderNode } from './types'
import { DEFAULT_SUB_NAME, uid, isSupportedBookmarkUrl } from './validation'
import { ensureBaseGroups, syncBookmarkLocations } from './groups'


export const flattenHtmlFolders = (folder: ParsedFolder, pathPrefix = ''): UrlWizardFolderNode[] => {
  const result: UrlWizardFolderNode[] = []
  const currentName = pathPrefix ? `${pathPrefix}/${folder.name}` : folder.name

  if (folder.bookmarks.length > 0) {
    result.push({ name: currentName, bookmarks: folder.bookmarks })
  }

  folder.children.forEach(child => {
    result.push(...flattenHtmlFolders(child, currentName))
  })

  return result
}


export const importHtmlBookmarks = (parsed: ParseResult): ImportData => {
  const now = Date.now()
  const groups: Group[] = []
  const bookmarks: Bookmark[] = []

  const appendBookmark = (groupId: string, subId: string, item: ParsedBookmark) => {
    const id = uid('bm')
    bookmarks.push({
      id,
      title: item.title || item.url,
      url: item.url,
      desc: '',
      tags: [],
      createdAt: item.addDate || now,
      updatedAt: now,
      locations: [{ groupId, subGroupId: subId }]
    })
    return id
  }

  if (parsed.flatBookmarks.length > 0) {
    const groupId = uid('g')
    const subId = uid('sg')
    const ids = parsed.flatBookmarks
      .filter(bookmark => bookmark.folderPath.length === 0 && isSupportedBookmarkUrl(bookmark.url))
      .map(bookmark => appendBookmark(groupId, subId, bookmark))
    if (ids.length > 0) {
      groups.push({
        id: groupId,
        name: '导入书签',
        createdAt: now,
        updatedAt: now,
        children: [
          {
            id: subId,
            name: DEFAULT_SUB_NAME,
            bookmarkIds: ids,
            createdAt: now,
            updatedAt: now
          }
        ]
      })
    }
  }

  parsed.folders.forEach(folder => {
    const groupId = uid('g')
    const children: SubGroup[] = []
    const rootSubId = uid('sg')
    const rootIds = folder.bookmarks
      .filter(bookmark => isSupportedBookmarkUrl(bookmark.url))
      .map(bookmark => appendBookmark(groupId, rootSubId, bookmark))

    if (rootIds.length > 0) {
      children.push({
        id: rootSubId,
        name: DEFAULT_SUB_NAME,
        bookmarkIds: rootIds,
        createdAt: now,
        updatedAt: now
      })
    }

    folder.children.forEach(child => {
      const flatList = flattenHtmlFolders(child)
      flatList.forEach(flat => {
        const subId = uid('sg')
        const ids = flat.bookmarks
          .filter(bookmark => isSupportedBookmarkUrl(bookmark.url))
          .map(bookmark => appendBookmark(groupId, subId, bookmark))
        if (ids.length > 0) {
          children.push({
            id: subId,
            name: flat.name,
            bookmarkIds: ids,
            createdAt: now,
            updatedAt: now
          })
        }
      })
    })

    if (!children.length) {
      children.push({
        id: uid('sg'),
        name: DEFAULT_SUB_NAME,
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      })
    }

    groups.push({
      id: groupId,
      name: folder.name || '导入分组',
      createdAt: now,
      updatedAt: now,
      children
    })
  })

  ensureBaseGroups(groups, now)
  syncBookmarkLocations(groups, bookmarks)
  return { groups, bookmarks }
}
