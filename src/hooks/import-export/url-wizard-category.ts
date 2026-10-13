import { TRASH_GROUP_ID } from '@/stores/bookmark'
import type { UrlWizardCategory, UrlWizardResolveResult } from './types'
import { DEFAULT_GROUP_ID, DEFAULT_SUB_ID, DEFAULT_GROUP_NAME, DEFAULT_SUB_NAME, TRASH_SUB_ID, MAX_CATEGORY_DEPTH, sanitizeIdPart } from './validation'


export const resolveUrlWizardCategory = (
  catId: string,
  categoryById: Map<string, UrlWizardCategory>,
  warnings: string[]
): UrlWizardResolveResult => {
  if (catId === 'cat@dustbin') {
    return {
      groupKey: `group:${TRASH_GROUP_ID}`,
      groupName: '回收站',
      subKey: `sub:${TRASH_SUB_ID}`,
      subName: '已删除'
    }
  }

  if (!catId || catId === 'cat@default') {
    return {
      groupKey: `group:${DEFAULT_GROUP_ID}`,
      groupName: DEFAULT_GROUP_NAME,
      subKey: `sub:${DEFAULT_SUB_ID}`,
      subName: DEFAULT_SUB_NAME
    }
  }

  const visited = new Set<string>()
  const chain: UrlWizardCategory[] = []
  let current = categoryById.get(catId)
  let depth = 0

  while (current && depth < MAX_CATEGORY_DEPTH) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    chain.unshift(current)
    if (!current.pid || !current.pid.startsWith('cat_')) break
    current = categoryById.get(current.pid)
    depth++
  }

  if (!chain.length) {
    warnings.push(`检测到未知分类 ID（${catId}），已归入“${DEFAULT_GROUP_NAME} / ${DEFAULT_SUB_NAME}”`)
    return {
      groupKey: `group:${DEFAULT_GROUP_ID}`,
      groupName: DEFAULT_GROUP_NAME,
      subKey: `sub:${DEFAULT_SUB_ID}`,
      subName: DEFAULT_SUB_NAME
    }
  }

  const root = chain[0]
  const subPath = chain.slice(1).map(item => item.name)
  return {
    groupKey: `group:wzj-g-${sanitizeIdPart(root.id)}`,
    groupName: root.name,
    subKey: subPath.length
      ? `sub:wzj-s-${sanitizeIdPart(chain[chain.length - 1].id)}`
      : `sub:wzj-s-${sanitizeIdPart(root.id)}-default`,
    subName: subPath.length ? subPath.join(' / ') : DEFAULT_SUB_NAME
  }
}


export const parseTimestampFromId = (id: string): number | null => {
  const match = id.match(/_(\d{10,})$/)
  if (!match) return null
  const raw = Number(match[1])
  if (!Number.isFinite(raw) || raw <= 0) return null
  return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw)
}
