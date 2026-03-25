import { ref } from 'vue'

type CategoryEditorRequest = {
  groupId: string
  requestId: number
}

const pendingCategoryEditorRequest = ref<CategoryEditorRequest | null>(null)

export function useCategoryEditor() {
  const openCategoryEditor = (groupId: string) => {
    pendingCategoryEditorRequest.value = {
      groupId,
      requestId: Date.now()
    }
  }

  const clearCategoryEditorRequest = (requestId: number) => {
    if (pendingCategoryEditorRequest.value?.requestId === requestId) {
      pendingCategoryEditorRequest.value = null
    }
  }

  return {
    pendingCategoryEditorRequest,
    openCategoryEditor,
    clearCategoryEditorRequest
  }
}
