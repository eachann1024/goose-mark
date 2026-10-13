export type MenuTarget =
  | { type: 'group'; groupId: string }
  | { type: 'sub'; groupId: string; subId: string }

type MenuMode = 'menu' | 'move' | 'confirmDelete'

export interface NavMenuState {
  open: boolean
  x: number
  y: number
  target: MenuTarget | null
  mode: MenuMode
}
