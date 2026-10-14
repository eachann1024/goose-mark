import { create } from 'zustand'

type SharedJsonStatus = {
  phase: 'local' | 'connecting' | 'connected' | 'paused'
  sourceMode: 'folder' | 'legacy' | null
  path: string | null
  error: string | null
  busy: boolean
}

export const useSharedJsonStatus = create<SharedJsonStatus>(() => ({
  phase: 'local', sourceMode: null, path: null, error: null, busy: false
}))

export async function sourceAction(operation: () => Promise<boolean>) {
  if (useSharedJsonStatus.getState().busy) return false
  useSharedJsonStatus.setState({ busy: true })
  try { return await operation() }
  finally { useSharedJsonStatus.setState({ busy: false }) }
}
