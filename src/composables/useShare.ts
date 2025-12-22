import { ref } from 'vue'
import { useBookmarkStore } from '@/stores/bookmark'
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
      const data = type === 'subGroup'
        ? collectSubGroupData(groupId, subGroupId!)
        : collectGroupData(groupId)
      
      if (!data) return false

      const res = await fetch(`${API_BASE_URL}/${shareId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      })
      
      return res.ok
    } catch {
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

  // 加载分享数据并应用到 store（用于访问分享链接）
  const loadShareData = async (shareId: string): Promise<boolean> => {
    const result = await loadShare(shareId)
    if (!result) return false
    
    if (result.canceled) {
      shareError.value = '此分享已被取消'
      return false
    }
    
    if (result.data) {
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
      
      store.loadFromSnapshot({
        groups,
        bookmarks: result.data.bookmarks
      })
      return true
    }
    return false
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

  // 检查分享更新
  const checkForUpdate = async (shareId: string, lastSyncedAt: number, throwOnError = false): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/${shareId}`)
      
      if (!res.ok) {
        if (throwOnError) {
            if (res.status === 429) throw new Error('请求过于频繁，请稍后再试')
            throw new Error(`请求失败: ${res.status}`)
        }
        return false
      }
      
      const shareData: ShareResponse = await res.json()
      if (!shareData.active) return false
      
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
