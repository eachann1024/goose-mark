import { ref } from 'vue'

import type { Group, SubGroup, Bookmark } from '@/types/bookmark'

const API_BASE_URL = import.meta.env.VITE_SHARE_API_URL || 'http://43.142.149.157:3001/api/share'

// 模块级缓存：已验证失效的 shareId，避免重复请求
const invalidatedShareIds = new Set<string>()

export interface ShareData {
  group?: Pick<Group, 'id' | 'name'>
  subGroups: SubGroup[]
  bookmarks: Bookmark[]
}

export interface ShareResponse {
  shareId: string
  type: 'subGroup' | 'group'
  sourceId: string
  active: boolean
  createdAt: number
  updatedAt: number
  data: ShareData
}

export function useShare() {
  const isSharing = ref(false)
  const isLoadingShare = ref(false)
  const shareError = ref<string | null>(null)
  
  const store = useBookmarkStore()

  // 构建分享链接
  const buildShareUrl = (shareId: string) => {
    const baseUrl = import.meta.env.VITE_SHARE_BASE_URL || 'http://43.142.149.157:3001'
    return `${baseUrl}/s/${shareId}`
  }

  // 收集子分组数据
  const collectSubGroupData = (groupId: string, subGroupId: string): ShareData | null => {
    const group = store.groups.find(g => g.id === groupId)
    const subGroup = group?.children.find(c => c.id === subGroupId)
    if (!group || !subGroup) return null

    const bookmarks = subGroup.bookmarkIds
      .map(id => store.bookmarks.find(b => b.id === id))
      .filter((b): b is Bookmark => !!b)

    return {
      group: { id: group.id, name: group.name },
      subGroups: [subGroup],
      bookmarks
    }
  }

  // 收集主分组数据（包含所有子分组）
  const collectGroupData = (groupId: string): ShareData | null => {
    const group = store.groups.find(g => g.id === groupId)
    if (!group) return null

    const allBookmarkIds = new Set<string>()
    group.children.forEach(sub => {
      sub.bookmarkIds.forEach(id => allBookmarkIds.add(id))
    })

    const bookmarks = Array.from(allBookmarkIds)
      .map(id => store.bookmarks.find(b => b.id === id))
      .filter((b): b is Bookmark => !!b)

    return {
      group: { id: group.id, name: group.name },
      subGroups: group.children,
      bookmarks
    }
  }

  // 创建分享
  const createShare = async (type: 'subGroup' | 'group', groupId: string, subGroupId?: string): Promise<string | null> => {
    isSharing.value = true
    shareError.value = null
    try {
      const sourceId = type === 'subGroup' ? subGroupId! : groupId
      const data = type === 'subGroup' 
        ? collectSubGroupData(groupId, subGroupId!)
        : collectGroupData(groupId)
      
      if (!data) {
        shareError.value = '找不到要分享的内容'
        return null
      }

      const res = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, sourceId, data })
      })
      
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('请求过于频繁，请稍后再试（5分钟内限 10 次）')
        }
        if (res.status === 413) {
            throw new Error('分享内容过大（上限 5MB）')
        }
        throw new Error('创建分享失败')
      }
      
      const { shareId } = await res.json()
      
      // 保存 shareId 到本地
      store.setShareId(type, groupId, subGroupId, shareId)
      
      return buildShareUrl(shareId)
    } catch (e: unknown) {
      shareError.value = e instanceof Error ? e.message : '创建分享失败'
      return null
    } finally {
      isSharing.value = false
    }
  }

  // 更新分享数据（内容变更时调用）
  const updateShare = async (shareId: string, type: 'subGroup' | 'group', groupId: string, subGroupId?: string): Promise<boolean> => {
    try {
      // 根据调用时传入的类型收集数据，确保数据范围正确
      // 注意：这里使用传入的 type 而不是服务器返回的 type，因为：
      // 1. 如果服务器上的 type 是 'subGroup' 但我们调用时传的是 'group'，说明要更新整个主分组
      // 2. 如果服务器上的 type 是 'group' 但我们调用时传的是 'subGroup'，说明只需更新单个子分组
      const data = type === 'subGroup'
        ? collectSubGroupData(groupId, subGroupId!)
        : collectGroupData(groupId)
      
      if (!data) {
        console.warn(`[updateShare] 无法收集数据: shareId=${shareId}, type=${type}, groupId=${groupId}, subGroupId=${subGroupId}`)
        return false
      }

      const res = await fetch(`${API_BASE_URL}/${shareId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      })
      
      return res.ok
    } catch (e) {
      console.error(`[updateShare] 更新失败: ${shareId}`, e)
      return false
    }
  }

  // 取消分享
  const cancelShare = async (shareId: string, type: 'subGroup' | 'group', groupId: string, subGroupId?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/${shareId}`, {
        method: 'DELETE'
      })
      
      if (res.ok) {
        store.clearShareId(type, groupId, subGroupId)
        invalidatedShareIds.add(shareId) // 加入失效缓存
        return { success: true }
      }
      
      // 404 表示服务端已无此分享记录，视为已取消，清理本地状态
      if (res.status === 404) {
        store.clearShareId(type, groupId, subGroupId)
        invalidatedShareIds.add(shareId) // 加入失效缓存
        return { success: true }
      }
      
      // 其他错误
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || `请求失败: ${res.status}` }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : '网络错误' }
    }
  }
  
  // 验证分享状态（用于切换分组时检查）
  const validateShareStatus = async (shareId: string): Promise<'active' | 'canceled' | 'not_found' | 'error'> => {
    // 如果已在失效缓存中，直接返回
    if (invalidatedShareIds.has(shareId)) {
      return 'not_found'
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/${shareId}`)
      
      if (res.ok) {
        const data = await res.json()
        return data.active ? 'active' : 'canceled'
      }
      
      if (res.status === 404) {
        invalidatedShareIds.add(shareId)
        return 'not_found'
      }
      if (res.status === 410) {
        invalidatedShareIds.add(shareId)
        return 'canceled'
      }
      
      return 'error'
    } catch {
      return 'error'
    }
  }
  
  // 验证分组的分享状态并清理失效的（切换分组时调用）
  const validateAndCleanGroupShares = async (groupId: string): Promise<void> => {
    const group = store.groups.find(g => g.id === groupId)
    if (!group) return
    
    // 收集需要验证的 shareIds
    const toValidate: { shareId: string; type: 'group' | 'subGroup'; subGroupId?: string }[] = []
    
    // 检查主分组 shareId
    if (group.shareId && !invalidatedShareIds.has(group.shareId)) {
      toValidate.push({ shareId: group.shareId, type: 'group' })
    }
    
    // 检查子分组 shareIds
    group.children.forEach(sub => {
      if (sub.shareId && !invalidatedShareIds.has(sub.shareId)) {
        toValidate.push({ shareId: sub.shareId, type: 'subGroup', subGroupId: sub.id })
      }
    })
    
    if (toValidate.length === 0) return
    
    // 并行验证所有 shareIds
    const results = await Promise.all(
      toValidate.map(async item => {
        const status = await validateShareStatus(item.shareId)
        return { ...item, status }
      })
    )
    
    // 清理失效的 shareIds
    results.forEach(({ shareId, type, subGroupId, status }) => {
      if (status === 'not_found' || status === 'canceled') {
        store.clearShareId(type, groupId, subGroupId)
        invalidatedShareIds.add(shareId)
      }
    })
  }

  // 加载分享数据（访问分享链接时）
  const loadShare = async (shareId: string): Promise<{ active: boolean; data?: ShareData; canceled?: boolean } | null> => {
    isLoadingShare.value = true
    shareError.value = null
    try {
      const res = await fetch(`${API_BASE_URL}/${shareId}`)
      
      if (res.status === 410) {
        return { active: false, canceled: true }
      }
      
      if (!res.ok) {
        if (res.status === 404) {
          shareError.value = '分享不存在'
        }
        return null
      }
      
      const shareData: ShareResponse = await res.json()
      return { active: true, data: shareData.data }
    } catch (e: unknown) {
      shareError.value = e instanceof Error ? e.message : '加载分享失败'
      return null
    } finally {
      isLoadingShare.value = false
    }
  }

  // 复制分享链接
  const copyShareLink = async (shareId: string): Promise<boolean> => {
    try {
      const url = buildShareUrl(shareId)
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }

  // 加载结果类型
  type LoadShareResult =
    | { success: true; existing?: true }
    | { success: false; error: string }
    | { conflict: true; shareId: string; shareName: string; existingGroupId: string; existingGroupName: string; isSubGroupImport?: boolean; existingSubGroupId?: string; data?: ShareData; isNameConflict?: boolean; targetGroup?: { id: string; name: string }; sourceGroup?: { id: string; name: string } }

  // 加载分享数据并应用到 store（用于访问分享链接）
  const loadShareData = async (shareId: string, conflictAction?: 'update' | 'keep' | 'duplicate'): Promise<LoadShareResult> => {
    // 记录 store 的初始状态
    const initState = {
      shareId,
      groupsCount: store.groups.length,
      groups: store.groups.map(g => ({ id: g.id, name: g.name, childrenCount: g.children.length, children: g.children.map(c => c.name) })),
      bookmarksCount: store.bookmarks.length
    }
    console.log('[loadShareData] Store 初始状态', JSON.stringify(initState, null, 2))
    
    const result = await loadShare(shareId)
    if (!result) return { success: false, error: shareError.value || '加载失败' }
    
    if (result.canceled) {
      shareError.value = '此分享已被取消'
      return { success: false, error: '此分享已被取消' }
    }
    
    if (!result.data) {
      return { success: false, error: '分享内容为空' }
    }

    const shareName = result.data.group?.name || '分享内容'

    const shareGroupId = result.data.group?.id
    const shareSubGroups = result.data.subGroups

    let existingMainGroup = store.findGroupBySourceShareId(shareId)
    const existingMainGroupById = shareGroupId ? store.groups.find(g => g.id === shareGroupId) : null

    let existingSubGroup: { groupId: string; subGroupId: string } | null = null
    let allSubGroupsExist = false

    if (shareSubGroups && shareSubGroups.length > 0) {
      allSubGroupsExist = true
      for (const shareSub of shareSubGroups) {
        const groupToCheck = existingMainGroup || existingMainGroupById || null
        if (groupToCheck) {
          const matchedSub = groupToCheck.children.find(
            c => c.id === shareSub.id || c.sourceShareId === shareId
          )
          if (matchedSub) {
            existingSubGroup = { groupId: groupToCheck.id, subGroupId: matchedSub.id }
          } else {
            allSubGroupsExist = false
          }
        } else {
          for (const group of store.groups) {
            const matchedSub = group.children.find(
              c => c.id === shareSub.id || c.sourceShareId === shareId
            )
            if (matchedSub) {
              existingSubGroup = { groupId: group.id, subGroupId: matchedSub.id }
              break
            }
          }
          allSubGroupsExist = false
        }
      }
    }

    if (existingMainGroup && allSubGroupsExist) {
      store.activeGroupId = existingMainGroup.id
      // 使用循环中找到的子分组 ID，而非总是跳转到第一个子分组
      store.activeSubGroupId = existingSubGroup?.subGroupId || existingMainGroup.children[0]?.id || ''
      return { success: true, existing: true } as const
    }

    if (existingSubGroup) {
      store.activeGroupId = existingSubGroup.groupId
      store.activeSubGroupId = existingSubGroup.subGroupId
      return { success: true, existing: true } as const
    }
    
    // 构建 groups 结构
    const groups = result.data.group 
      ? [{ 
          id: result.data.group.id, 
          name: result.data.group.name, 
          children: result.data.subGroups 
        }]
      : [{ 
          id: 'shared', 
          name: '分享内容', 
          children: result.data.subGroups 
        }]
    
    const dataToApply = { groups, bookmarks: result.data.bookmarks }
    
    // 处理冲突动作
    if (conflictAction === 'keep') {
      // 保留本地版本，不做任何操作
      return { success: true }
    }
    
    if (conflictAction === 'update' && existingMainGroup) {
      store.updateFromShare(existingMainGroup.id, dataToApply)
      store.activeGroupId = existingMainGroup.id
      store.activeSubGroupId = existingMainGroup.children[0]?.id || ''
      return { success: true }
    }
    
    // duplicate 或无冲突的情况
    // 始终使用智能合并模式（检测同名分组并合并子分组）
    // 这样可以确保多次打开分享链接时，同名分组会自动合并
    if (!store.isReadOnly) {
      const mergeData = {
        shareId,
        shareName,
        existingGroups: store.groups.map(g => ({ id: g.id, name: g.name, children: g.children.map(c => c.name) }))
      }
      console.log('[loadShareData] 使用智能合并模式', JSON.stringify(mergeData, null, 2))
      const result = store.importFromShareSmart(dataToApply, shareId, shareName)

      if (result) {
        if ('conflict' in result && result.conflict) {
          // 同名分组但来源不同，返回冲突信息
          return {
            conflict: true,
            shareId,
            shareName: result.sourceGroup.name,
            existingGroupId: result.targetGroup.id,
            existingGroupName: result.targetGroup.name,
            isNameConflict: true,
            targetGroup: { id: result.targetGroup.id, name: result.targetGroup.name },
            sourceGroup: { id: result.sourceGroup.id, name: result.sourceGroup.name }
          }
        }

        const mergedResult = result as { group: Group; subGroupId: string; merged: boolean }
        const resultData = {
          groupId: mergedResult.group.id,
          groupName: mergedResult.group.name,
          subGroupId: mergedResult.subGroupId,
          merged: mergedResult.merged,
          allSubGroups: mergedResult.group.children.map((c: any) => c.name)
        }
        console.log('[loadShareData] 智能合并结果', JSON.stringify(resultData, null, 2))
        store.activeGroupId = mergedResult.group.id
        store.activeSubGroupId = mergedResult.subGroupId

        // 立即刷新 localStorage，确保数据被保存（避免防抖延迟导致数据丢失）
        // 等待下一个 tick，让 Pinia 的 persist 插件有机会保存
        await new Promise(resolve => setTimeout(resolve, 0))
        // 立即刷新待写入的数据
        utoolsStorage.flushItem('bookmark')
        console.log('[loadShareData] 数据已立即保存到 localStorage')
      } else {
        // 如果智能导入失败（理论上不应该），回退到快照模式
        console.warn('[loadShareData] 智能合并失败，回退到快照模式')
        store.loadFromSnapshot(dataToApply, true)
      }
    } else {
      // 只读模式，使用快照模式
      store.loadFromSnapshot(dataToApply, true)
    }
    return { success: true }
  }

  // 创建全库快照分享链接（供设置面板使用）
  const createShareLink = async (): Promise<string | null> => {
    isSharing.value = true
    shareError.value = null
    try {
      // 收集所有非回收站分组的数据
      const TRASH_GROUP_ID = 'g-trash'
      const allGroups = store.groups.filter(g => g.id !== TRASH_GROUP_ID)
      const allBookmarkIds = new Set<string>()
      allGroups.forEach(g => {
        g.children.forEach(sub => {
          sub.bookmarkIds.forEach(id => allBookmarkIds.add(id))
        })
      })
      const allBookmarks = Array.from(allBookmarkIds)
        .map(id => store.bookmarks.find(b => b.id === id))
        .filter((b): b is Bookmark => !!b)

      const data: ShareData = {
        subGroups: allGroups.flatMap(g => g.children),
        bookmarks: allBookmarks
      }

      const res = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'snapshot', sourceId: 'full', data })
      })

      if (!res.ok) throw new Error('创建分享失败')

      const { shareId } = await res.json()
      return buildShareUrl(shareId)
    } catch (e: unknown) {
      shareError.value = e instanceof Error ? e.message : '创建分享失败'
      return null
    } finally {
      isSharing.value = false
    }
  }

  // 检查分享更新（优先使用轻量级接口）
  const checkForUpdate = async (shareId: string, lastSyncedAt: number, throwOnError = false): Promise<boolean> => {
    try {
      // 优先使用轻量级检查接口
      const checkRes = await fetch(`${API_BASE_URL}/${shareId}/check`)

      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (!checkData.active) {
          if (throwOnError) throw new Error('分享已被分享者取消')
          return false
        }
        return checkData.updatedAt > lastSyncedAt
      }

      // 如果轻量级接口失败（404/410 等），抛出错误
      if (checkRes.status === 404) {
        if (throwOnError) throw new Error('分享已失效（分享者已删除）')
        return false
      }
      if (checkRes.status === 410) {
        if (throwOnError) throw new Error('分享已被分享者取消')
        return false
      }

      // 其他错误，回退到完整接口
      const res = await fetch(`${API_BASE_URL}/${shareId}`)

      if (!res.ok) {
        if (throwOnError) {
            if (res.status === 429) throw new Error('请求过于频繁，请稍后再试')
            throw new Error(`请求失败: ${res.status}`)
        }
        return false
      }

      const shareData: ShareResponse = await res.json()
      if (!shareData.active) {
        if (throwOnError) throw new Error('分享已被分享者取消')
        return false
      }

      // 注意：server 端的 updatedAt 是分享记录的更新时间
      return shareData.updatedAt > lastSyncedAt
    } catch (e) {
      if (throwOnError) throw e
      return false
    }
  }

  // 获取分享数据（不自动导入）
  const getShareData = async (shareId: string): Promise<{ data: ShareResponse; error?: never } | { data?: never; error: string } | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/${shareId}`)
      
      if (res.status === 404) {
        return { error: '分享不存在' }
      }
      if (res.status === 410) {
        return { error: '分享已被取消' }
      }
      if (!res.ok) {
        return { error: `请求失败: ${res.status}` }
      }
      
      const shareData = await res.json()
      if (!shareData.active) {
        return { error: '分享已失效' }
      }
      return { data: shareData }
    } catch (e) {
      return { error: e instanceof Error ? e.message : '网络错误' }
    }
  }

  return {
    isSharing,
    isLoadingShare,
    shareError,
    createShare,
    createShareLink,
    updateShare,
    cancelShare,
    loadShare,
    loadShareData,
    copyShareLink,
    buildShareUrl,
    checkForUpdate,
    getShareData,
    validateShareStatus,
    validateAndCleanGroupShares
  }
}
