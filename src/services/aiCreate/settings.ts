import { selectAiSettings, useSettingsStore } from '@/stores/settings'
import type { AISettingsLike } from '@/lib/aiProvider'

export interface AICreatePermissions {
  allowCreateGroup: boolean
  allowCreateSubGroup: boolean
}

/** 当前设置 → AI 调用配置与新建分组权限 */
export function getAICreateSettings(): { ai: AISettingsLike; permissions: AICreatePermissions } {
  const state = useSettingsStore.getState()
  return {
    ai: selectAiSettings(state),
    permissions: {
      allowCreateGroup: state.aiAllowCreateGroup,
      allowCreateSubGroup: state.aiAllowCreateSubGroup
    }
  }
}
