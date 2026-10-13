import type { Bookmark, Group, SubGroup } from '@/types/bookmark'
import type { JsonImportSuccess } from './types'
import { DEFAULT_SUB_NAME, uid, asObject, asNonEmptyString, asNumber, toTs, isSupportedBookmarkUrl, sanitizeIcon } from './validation'
import { ensureBaseGroups, syncBookmarkLocations } from './groups'


export const normalizeSystemBackup = (payload: Record<string, unknown>): JsonImportSuccess => {
  const now = Date.now()
  const warnings: string[] = []
  let skipped = 0

  const rawBookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : []
  const rawGroups = Array.isArray(payload.groups) ? payload.groups : []

  const bookmarks: Bookmark[] = []
  const bookmarkById = new Map<string, Bookmark>()

  rawBookmarks.forEach((item) => {
    const record = asObject(item)
    if (!record) {
      skipped++
      return
    }

    const rawUrl = asNonEmptyString(record.url)
    if (!rawUrl || !isSupportedBookmarkUrl(rawUrl)) {
      skipped++
      return
    }

    let id = asNonEmptyString(record.id) || uid('bm')
    if (bookmarkById.has(id)) {
      warnings.push(`检测到重复书签 ID（${id}），已忽略后续重复项`)
      skipped++
      return
    }

    const title = asNonEmptyString(record.title) || rawUrl
    const createdAt = toTs(record.createdAt, now)
    const updatedAt = toTs(record.updatedAt, createdAt)
    const tags = Array.isArray(record.tags)
      ? record.tags.map(value => asNonEmptyString(value)).filter((value): value is string => !!value)
      : []

    const bookmark: Bookmark = {
      id,
      title,
      url: rawUrl,
      desc: asNonEmptyString(record.desc) || '',
      tags,
      icon: sanitizeIcon(record.icon, title),
      pinned: !!record.pinned,
      allowUniversal: !!record.allowUniversal,
      iconMatchedAt: asNumber(record.iconMatchedAt) ?? undefined,
      iconMatchFailedAt: asNumber(record.iconMatchFailedAt) ?? undefined,
      iconMatchFailedReason: asNonEmptyString(record.iconMatchFailedReason) ?? undefined,
      createdAt,
      updatedAt,
      isDeleted: !!record.isDeleted
    }

    bookmarkById.set(id, bookmark)
    bookmarks.push(bookmark)
  })

  const groups: Group[] = []
  const groupById = new Map<string, Group>()
  rawGroups.forEach(item => {
    const record = asObject(item)
    if (!record) return

    const groupId = asNonEmptyString(record.id) || uid('g')
    const groupName = asNonEmptyString(record.name) || '未命名分组'
    const createdAt = toTs(record.createdAt, now)
    const updatedAt = toTs(record.updatedAt, createdAt)
    const childrenRaw = Array.isArray(record.children) ? record.children : []

    const group: Group = groupById.get(groupId) || {
      id: groupId,
      name: groupName,
      children: [],
      createdAt,
      updatedAt,
      isDeleted: !!record.isDeleted
    }

    const subById = new Map(group.children.map(sub => [sub.id, sub]))
    childrenRaw.forEach(subItem => {
      const subRecord = asObject(subItem)
      if (!subRecord) return
      const subId = asNonEmptyString(subRecord.id) || uid('sg')
      const subName = asNonEmptyString(subRecord.name) || DEFAULT_SUB_NAME
      const subCreatedAt = toTs(subRecord.createdAt, now)
      const subUpdatedAt = toTs(subRecord.updatedAt, subCreatedAt)
      const rawBookmarkIds = Array.isArray(subRecord.bookmarkIds) ? subRecord.bookmarkIds : []
      const bookmarkIds = Array.from(new Set(
        rawBookmarkIds
          .map(value => asNonEmptyString(value))
          .filter((value): value is string => !!value && bookmarkById.has(value))
      ))

      const existing = subById.get(subId)
      if (existing) {
        const existingIds = new Set(existing.bookmarkIds)
        bookmarkIds.forEach(bookmarkId => {
          if (!existingIds.has(bookmarkId)) existing.bookmarkIds.push(bookmarkId)
        })
        existing.updatedAt = Math.max(existing.updatedAt || 0, subUpdatedAt)
        return
      }

      const sub: SubGroup = {
        id: subId,
        name: subName,
        bookmarkIds,
        createdAt: subCreatedAt,
        updatedAt: subUpdatedAt,
        isDeleted: !!subRecord.isDeleted
      }
      group.children.push(sub)
      subById.set(sub.id, sub)
    })

    if (!group.children.length) {
      group.children.push({
        id: uid('sg'),
        name: DEFAULT_SUB_NAME,
        bookmarkIds: [],
        createdAt: now,
        updatedAt: now
      })
    }

    if (!groupById.has(groupId)) {
      groups.push(group)
      groupById.set(groupId, group)
    }
  })

  ensureBaseGroups(groups, now)
  syncBookmarkLocations(groups, bookmarks)

  return {
    ok: true,
    source: 'goose-marks',
    sourceLabel: '鹅的书签备份',
    data: { groups, bookmarks },
    warnings,
    stats: {
      groups: groups.length,
      bookmarks: bookmarks.length,
      skipped
    }
  }
}
