import type { Group, SubGroup, Bookmark } from '@/types/bookmark'
import type { JsonImportSuccess, JsonImportError, UrlWizardCategory } from './types'
import { uid, asObject, asNonEmptyString, sanitizeIdPart, isSupportedBookmarkUrl, sanitizeIcon } from './validation'
import { ensureBaseGroups, syncBookmarkLocations } from './groups'
import { resolveUrlWizardCategory, parseTimestampFromId } from './url-wizard-category'


export const isUrlWizardPayload = (payload: Record<string, unknown>) => {
  const db = payload.db
  if (!Array.isArray(db)) return false
  return db.some(item => {
    const record = asObject(item)
    if (!record) return false
    const id = asNonEmptyString(record._id) || ''
    if (id.startsWith('cat_') || id.startsWith('web_')) return true
    return Array.isArray(record.catIds) && typeof record.url === 'string'
  })
}


export const normalizeUrlWizardPayload = (payload: Record<string, unknown>): JsonImportSuccess | JsonImportError => {
  const db = Array.isArray(payload.db) ? payload.db : []
  const now = Date.now()
  const warnings: string[] = []

  const categoryById = new Map<string, UrlWizardCategory>()
  db.forEach(item => {
    const record = asObject(item)
    if (!record) return
    const id = asNonEmptyString(record._id)
    if (!id || !id.startsWith('cat_')) return
    const name = asNonEmptyString(record.label) || '未命名分类'
    const pid = asNonEmptyString(record.pid) || ''
    categoryById.set(id, { id, name, pid })
  })

  const groupByKey = new Map<string, Group>()
  const subByKey = new Map<string, SubGroup>()
  const bookmarks: Bookmark[] = []
  const bookmarkIds = new Set<string>()
  const dedupeUrlInSub = new Set<string>()
  let skipped = 0

  const getOrCreateGroup = (key: string, name: string): Group => {
    const cached = groupByKey.get(key)
    if (cached) return cached
    const id = key.startsWith('group:') ? key.slice(6) : `wzj-g-${uid('group')}`
    const group: Group = {
      id,
      name,
      children: [],
      createdAt: now,
      updatedAt: now
    }
    groupByKey.set(key, group)
    return group
  }

  const getOrCreateSub = (group: Group, key: string, name: string): SubGroup => {
    const mapKey = `${group.id}|${key}`
    const cached = subByKey.get(mapKey)
    if (cached) return cached
    const id = key.startsWith('sub:') ? key.slice(4) : `wzj-s-${uid('sub')}`
    const sub: SubGroup = {
      id,
      name,
      bookmarkIds: [],
      createdAt: now,
      updatedAt: now
    }
    group.children.push(sub)
    subByKey.set(mapKey, sub)
    return sub
  }

  db.forEach(item => {
    const record = asObject(item)
    if (!record) return
    const rawId = asNonEmptyString(record._id)
    if (!rawId || !rawId.startsWith('web_')) return

    const rawUrl = asNonEmptyString(record.url)
    if (!rawUrl || !isSupportedBookmarkUrl(rawUrl)) {
      skipped++
      return
    }

    const catIds = Array.isArray(record.catIds)
      ? record.catIds.map(value => asNonEmptyString(value)).filter((value): value is string => !!value)
      : []
    const targetCatId = catIds[0] || 'cat@default'
    const resolved = resolveUrlWizardCategory(targetCatId, categoryById, warnings)
    const group = getOrCreateGroup(resolved.groupKey, resolved.groupName)
    const sub = getOrCreateSub(group, resolved.subKey, resolved.subName)

    const bookmarkId = `wzj-b-${sanitizeIdPart(rawId)}`
    if (bookmarkIds.has(bookmarkId)) {
      skipped++
      return
    }

    const dedupeKey = `${sub.id}|${rawUrl}`
    if (dedupeUrlInSub.has(dedupeKey)) {
      skipped++
      return
    }

    const title = asNonEmptyString(record.title) || rawUrl
    const fallbackTs = parseTimestampFromId(rawId) || now
    const icon = sanitizeIcon(record.icon, title)

    const tags: string[] = []
    if (record.isOften === true) tags.push('常用')
    if (record.isFly === true) tags.push('快捷')

    const bookmark: Bookmark = {
      id: bookmarkId,
      title,
      url: rawUrl,
      desc: asNonEmptyString(record.desc) || '',
      tags,
      icon,
      createdAt: fallbackTs,
      updatedAt: fallbackTs
    }

    bookmarkIds.add(bookmarkId)
    dedupeUrlInSub.add(dedupeKey)
    bookmarks.push(bookmark)
    sub.bookmarkIds.push(bookmarkId)
  })

  const groups = Array.from(groupByKey.values())
  if (!bookmarks.length) {
    return {
      ok: false,
      message: '未在网址精灵 data.json 中找到可导入的网址数据（仅支持 http/https）'
    }
  }

  ensureBaseGroups(groups, now)
  syncBookmarkLocations(groups, bookmarks)

  return {
    ok: true,
    source: 'url-wizard',
    sourceLabel: '网址精灵 data.json',
    data: { groups, bookmarks },
    warnings: Array.from(new Set(warnings)),
    stats: {
      groups: groups.length,
      bookmarks: bookmarks.length,
      skipped
    }
  }
}
