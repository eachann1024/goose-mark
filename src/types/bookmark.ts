export type IconSource =
  | { type: 'file'; path: string; hash?: string; fetchedAt?: number; bgColor?: string }
  | { type: 'remote'; src: string; fetchedAt?: number; bgColor?: string }
  | { type: 'text'; value: string; bgColor?: string }

export interface BookmarkLocation {
  groupId: string
  subGroupId: string
}

export interface Bookmark {
  id: string
  title: string
  url: string
  desc?: string
  tags: string[]
  icon?: IconSource
  pinned?: boolean
  locations?: BookmarkLocation[]  // 支持多分组，可选以保持向后兼容
  allowUniversal?: boolean // 是否注册为 uTools 全局搜索（主输入框任意内容匹配）
}

export interface SubGroup {
  id: string
  name: string
  bookmarkIds: string[]  // 改为 ID 引用，书签数据提升到顶层
}

export interface Group {
  id: string
  name: string
  children: SubGroup[]
}
