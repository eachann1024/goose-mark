import { useCallback, useState } from 'react'
import type { Bookmark } from '@/types/bookmark'

export interface ContextMenuState {
  show: boolean
  x: number
  y: number
  target: Bookmark | null
}

/**
 * 右键菜单状态（React 版）
 * 旧版 Vue reactive 对象 → useState；handler 用 useCallback 稳定引用。
 */
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    show: false,
    x: 0,
    y: 0,
    target: null
  })

  const handleContextMenu = useCallback((e: MouseEvent | React.MouseEvent, bookmark: Bookmark) => {
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, target: bookmark })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, show: false }))
  }, [])

  return { contextMenu, handleContextMenu, closeContextMenu }
}
