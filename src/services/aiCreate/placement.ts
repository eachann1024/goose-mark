import type { Group, SubGroup } from '@/types/bookmark'
import { TRASH_GROUP_ID, useBookmarkStore } from '@/stores/bookmark'
import type { AICreatePermissions } from './settings'

export interface PlacementRequest {
  groupId: string | null
  subGroupId: string | null
  newGroupName: string | null
  newSubGroupName: string | null
}

export interface Placement {
  groupId: string
  subGroupId: string
  groupName: string
  subGroupName: string
  createdGroup: boolean
  createdSub: boolean
}

const clean = (value: string | null) => (value || '').trim()
const liveGroups = () => useBookmarkStore.getState().groups.filter((g) => g.id !== TRASH_GROUP_ID)
const findSub = (group: Group, req: PlacementRequest, name: string): SubGroup | undefined =>
  group.children.find((s) => s.id === req.subGroupId) ?? (name ? group.children.find((s) => s.name === name) : undefined)

function build(group: Group, sub: SubGroup, createdGroup = false, createdSub = false): Placement {
  return { groupId: group.id, subGroupId: sub.id, groupName: group.name, subGroupName: sub.name, createdGroup, createdSub }
}

function fallback(): Placement {
  const store = useBookmarkStore.getState()
  for (const group of liveGroups()) {
    if (group.children[0]) return build(group, group.children[0])
  }
  const existing = liveGroups()[0]
  if (existing) {
    const sub = store.addSubGroup('默认', existing.id)
    if (sub) return build(existing, sub, false, true)
  }
  const group = store.addGroup('默认')
  return build(group, group.children[0], true, true)
}

/** 校验并落实分组位置；addGroup/addSubGroup 会切换激活分组，结束后恢复。 */
export function resolvePlacement(req: PlacementRequest, permissions: AICreatePermissions): Placement {
  const store = useBookmarkStore.getState()
  const { activeGroupId, activeSubGroupId } = store
  try {
    const subName = clean(req.newSubGroupName)
    const groupName = clean(req.newGroupName)
    const groups = liveGroups()

    let group = groups.find((g) => g.id === req.groupId)
    if (!group && req.subGroupId) group = groups.find((g) => g.children.some((s) => s.id === req.subGroupId))
    if (!group && groupName) group = groups.find((g) => g.name === groupName)

    if (group) {
      const sub = findSub(group, req, subName)
      if (sub) return build(group, sub)
      if (subName && permissions.allowCreateSubGroup) {
        const created = store.addSubGroup(subName, group.id)
        if (created) return build(group, created, false, true)
      }
      if (group.children[0]) return build(group, group.children[0])
      return fallback()
    }

    if (groupName && permissions.allowCreateGroup) {
      const created = store.addGroup(groupName)
      let sub = created.children[0]
      if (subName) {
        store.updateSubGroup(created.id, sub.id, subName)
        sub = { ...sub, name: subName }
      }
      return build(created, sub, true, !!subName)
    }
    return fallback()
  } finally {
    useBookmarkStore.setState({ activeGroupId, activeSubGroupId })
  }
}
