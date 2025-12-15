
import { reactive } from 'vue'
import type { Bookmark } from '@/types/bookmark'

export function useContextMenu() {
  const contextMenu = reactive({
    show: false,
    x: 0,
    y: 0,
    target: null as Bookmark | null
  })

  const handleContextMenu = (e: MouseEvent, bookmark: Bookmark) => {
    contextMenu.show = true
    contextMenu.x = e.clientX
    contextMenu.y = e.clientY
    contextMenu.target = bookmark
  }

  const closeContextMenu = () => {
    contextMenu.show = false
  }

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu
  }
}
