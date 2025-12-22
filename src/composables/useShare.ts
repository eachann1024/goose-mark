import { ref } from 'vue'
import { useBookmarkStore } from '@/stores/bookmark'
import type { Group, Bookmark } from '@/types/bookmark'

const API_BASE_URL = import.meta.env.VITE_SHARE_API_URL || '/api/share'

export function useShare() {
  const isSharing = ref(false)
  const isLoadingShare = ref(false)
  const shareError = ref<string | null>(null)
  
  const store = useBookmarkStore()

  // Create a snapshot and upload it
  const createShareLink = async () => {
    isSharing.value = true
    shareError.value = null
    try {
      const payload = {
        groups: store.groups,
        bookmarks: store.bookmarks
      }
      
      // Determine the API URL (use absolute if in dev/plugin mode, relative if on same domain)
      // For now, we assume the user will configure VITE_SHARE_API_URL if needed, 
      // or it defaults to /api/share (relative) which works if served from same origin.
      // But if running in uTools (file://), we need an absolute URL.
      // Let's rely on a proper configured env var or prompt the user? 
      // For this MVP, let's assume we might need a full URL if running locally.
      // Actually, if running in uTools, we probably can't share directly unless we have a public server.
      // The user provided a Tencent Cloud server.
      
      let url = API_BASE_URL
      if (!url.startsWith('http')) {
        // adapting for dev/local usage
        // If we are in uTools/local dev, we might need the real server URL.
        // For now, let's assume relative path works on the deployed site.
        // If in uTools, this might fail without a full URL.
        // We will fallback to a hardcoded placeholder or prompt user later.
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) throw new Error('Failed to create share')
      
      const { id } = await res.json()
      
      // Construct the share link
      // If we are on the web, use window.location.origin
      // If in uTools, we need the "Web URL" where this is deployed.
      const baseUrl = window.location.origin.includes('file://') 
        ? 'http://your-deployed-domain.com' 
        : window.location.origin
        
      return `${baseUrl}/?shareId=${id}`
      
    } catch (e: any) {
      shareError.value = e.message
      return null
    } finally {
      isSharing.value = false
    }
  }

  // Load snapshot by ID
  const loadShareData = async (id: string) => {
    isLoadingShare.value = true
    shareError.value = null
    try {
      const url = `${API_BASE_URL}/${id}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load shared data')
      
      const data = await res.json()
      if (data && data.groups && data.bookmarks) {
        store.loadFromSnapshot(data)
        return true
      }
      return false
    } catch (e: any) {
        shareError.value = e.message
        return false
    } finally {
        isLoadingShare.value = false
    }
  }

  return {
    isSharing,
    isLoadingShare,
    shareError,
    createShareLink,
    loadShareData
  }
}
