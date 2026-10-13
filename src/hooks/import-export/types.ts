import type { Group, Bookmark } from '@/types/bookmark'
import type { ParsedBookmark } from '@/lib/htmlBookmarkParser'


export type ImportData = { groups: Group[]; bookmarks: Bookmark[] }

export type ImportMode = 'overwrite' | 'merge'


type JsonImportSource = 'goose-marks' | 'url-wizard'


export type JsonImportSuccess = {
  ok: true
  source: JsonImportSource
  sourceLabel: string
  data: ImportData
  warnings: string[]
  stats: {
    groups: number
    bookmarks: number
    skipped: number
  }
}


export type JsonImportError = {
  ok: false
  message: string
}


export type JsonImportResult = JsonImportSuccess | JsonImportError


// 导入目标 store 的结构契约（Zustand 版）。原 Pinia $patch 改为 setData，
// 由业务阶段的 bookmark store 提供（等价批量 set 数据契约字段）。
export type BookmarkStoreLike = {
  groups: Group[]
  bookmarks: Bookmark[]
  activeGroupId: string
  activeSubGroupId: string
  setData: (state: Partial<{
    groups: Group[]
    bookmarks: Bookmark[]
    activeGroupId: string
    activeSubGroupId: string
  }>) => void
  selectGroup: (groupId: string, subId?: string) => void
}


export type UrlWizardCategory = {
  id: string
  name: string
  pid: string
}


export type UrlWizardFolderNode = {
  name: string
  bookmarks: ParsedBookmark[]
}


export type UrlWizardResolveResult = {
  groupKey: string
  groupName: string
  subKey: string
  subName: string
}


export type ApplyImportSummary = {
  before: {
    groups: number
    bookmarks: number
  }
  after: {
    groups: number
    bookmarks: number
  }
  added: {
    groups: number
    bookmarks: number
  }
}
