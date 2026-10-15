import { createDefaultSettingsState, useSettingsStore, type SettingsState } from '@/stores/settings'

const backupPreferenceKeys = [
  'themePreference', 'gridColumns', 'preferLocalSnapshotOnStartup', 'homeViewMode', 'searchViewMode',
  'density', 'easterEggEnabled', 'easterEggVariant', 'skipFailedIconMatch', 'panelContinuous',
  'listShowDescription', 'listFullDescription', 'descriptionSelectable', 'listShowTags', 'uiScale',
  'gridIconSize', 'windowHeight', 'useUtoolsBrowser'
] as const satisfies readonly (keyof SettingsState)[]

type BackupPreferenceKey = typeof backupPreferenceKeys[number]
export type FileSettings = Partial<Pick<SettingsState, BackupPreferenceKey>>

export function currentFileSettings(): FileSettings {
  const state = useSettingsStore.getState()
  const result = {} as Record<string, unknown>
  for (const key of backupPreferenceKeys) result[key] = state[key]
  return structuredClone(result) as FileSettings
}

export function parseFileSettings(raw: unknown): FileSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('JSON 中的 settings 必须是设置对象')
  const defaults = createDefaultSettingsState()
  const patch: Partial<SettingsState> = {}
  for (const key of backupPreferenceKeys) {
    if (!Object.hasOwn(raw, key)) continue
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
  if (Object.hasOwn(raw, 'gridColumns')) patch.gridColumns = Math.min(5, Math.max(2, Math.round(patch.gridColumns!)))
  if (Object.hasOwn(raw, 'windowHeight')) patch.windowHeight = Math.min(1000, Math.max(600, Math.round(patch.windowHeight!)))
  if (patch.homeViewMode && !['list', 'grid', 'cards'].includes(patch.homeViewMode)) throw new Error('设置 homeViewMode 无效')
  if (patch.density && !['compact', 'regular', 'comfy'].includes(patch.density)) throw new Error('设置 density 无效')
  return patch
}
