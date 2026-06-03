import { create } from 'zustand'

type CategoryEditorRequest = {
  groupId: string
  requestId: number
}

/**
 * 分类编辑器跨组件请求（React / Zustand 版）
 * 旧版 Vue 用模块级 ref 共享 pending 请求，React 等价用模块级 Zustand store。
 */
interface CategoryEditorState {
  pendingCategoryEditorRequest: CategoryEditorRequest | null
  openCategoryEditor: (groupId: string) => void
  clearCategoryEditorRequest: (requestId: number) => void
}

export const useCategoryEditor = create<CategoryEditorState>((set, get) => ({
  pendingCategoryEditorRequest: null,

  openCategoryEditor: (groupId) => {
    set({ pendingCategoryEditorRequest: { groupId, requestId: Date.now() } })
  },

  clearCategoryEditorRequest: (requestId) => {
    if (get().pendingCategoryEditorRequest?.requestId === requestId) {
      set({ pendingCategoryEditorRequest: null })
    }
  }
}))
