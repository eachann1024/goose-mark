import { createDefaultSettingsState, normalizePersistedSettings, useSettingsStore, type SettingsState } from '@/stores/settings'

export type FileSettings = Omit<SettingsState, 'localMirrorDirectory'>

export function currentFileSettings(): FileSettings {
  const state = useSettingsStore.getState()
  const result = {} as FileSettings
  for (const key of Object.keys(createDefaultSettingsState()) as Array<keyof SettingsState>) {
    if (key !== 'localMirrorDirectory') Object.assign(result, { [key]: state[key] })
  }
  return structuredClone(result)
}

export function parseFileSettings(raw: unknown): FileSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('JSON 中的 settings 必须是设置对象')
  const defaults = createDefaultSettingsState()
  const patch: Partial<SettingsState> = {}
  for (const key of Object.keys(defaults) as Array<keyof SettingsState>) {
    if (key === 'localMirrorDirectory' || !Object.hasOwn(raw, key)) continue
    const value = (raw as Record<string, unknown>)[key]
    const expected = defaults[key]
    if (expected === null) {
      if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error(`设置 ${key} 无效`)
    } else if (Array.isArray(expected)) {
      if (!Array.isArray(value)) throw new Error(`设置 ${key} 无效`)
    } else if (typeof value !== typeof expected || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`设置 ${key} 无效`)
    } else if (typeof expected === 'object' && (!value || Array.isArray(value))) {
      throw new Error(`设置 ${key} 无效`)
    }
    Object.assign(patch, { [key]: value })
  }
  const input: Partial<SettingsState> = { ...defaults, ...patch }
  if (!Object.hasOwn(raw, 'aiProtocolConfigs')) delete input.aiProtocolConfigs
  const normalized = { ...defaults, ...normalizePersistedSettings(input) }
  normalized.gridColumns = Math.min(5, Math.max(2, Math.round(normalized.gridColumns)))
  normalized.windowHeight = Math.min(1000, Math.max(600, Math.round(normalized.windowHeight)))
  if (!['list', 'grid', 'cards'].includes(normalized.homeViewMode)) throw new Error('设置 homeViewMode 无效')
  if (!['compact', 'regular', 'comfy'].includes(normalized.density)) throw new Error('设置 density 无效')
  const { localMirrorDirectory: _localDirectory, ...settings } = normalized
  return settings
}
