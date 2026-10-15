import { normalizeAIConfidence, truncateAIText } from '@/lib/aiOutput'

export type AggressiveCategoryHit = {
  groupId: string
  groupName: string
  subGroupId: string
  subGroupName: string
  confidence: number
  reason: string
}

export function isHostLikeTitle(title: string, rawUrl: string) {
  const normalizedTitle = title
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
  if (!normalizedTitle) return false
  try {
    const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const host = new URL(safeUrl).hostname.toLowerCase().replace(/^www\./, '')
    return normalizedTitle === host
  } catch {
    return false
  }
}

export type ExistingGroup = {
  id: string
  name: string
  subGroups: { id: string; name: string }[]
}

export function matchCategories(
  rawList: unknown,
  existingGroups: ExistingGroup[]
): AggressiveCategoryHit[] {
  if (!Array.isArray(rawList) || existingGroups.length === 0) return []

  const hits: AggressiveCategoryHit[] = []
  const seen = new Set<string>()

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const groupName = typeof row.groupName === 'string' ? row.groupName.trim() : ''
    if (!groupName) continue

    const confidence = normalizeAIConfidence(row.confidence)
    if (confidence < 0.55) continue

    const matchedGroup = existingGroups.find((g) => g.name === groupName)
    if (!matchedGroup) continue

    const subName = typeof row.subGroupName === 'string' ? row.subGroupName.trim() : ''
    const matchedSub = subName
      ? matchedGroup.subGroups.find((s) => s.name === subName)
      : matchedGroup.subGroups[0]
    if (!matchedSub) continue

    const key = `${matchedGroup.id}:${matchedSub.id}`
    if (seen.has(key)) continue
    seen.add(key)

    hits.push({
      groupId: matchedGroup.id,
      groupName: matchedGroup.name,
      subGroupId: matchedSub.id,
      subGroupName: matchedSub.name,
      confidence,
      reason: truncateAIText(row.reason, 30)
    })

    if (hits.length >= 3) break
  }

  hits.sort((a, b) => b.confidence - a.confidence)
  return hits
}

