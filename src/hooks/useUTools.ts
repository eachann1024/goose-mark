import { useCallback } from 'react'
import { getAIAvailability } from '@/lib/aiProvider'
import { selectAiSettings, useSettingsStore } from '@/stores/settings'

/** uTools 动态入口同步 / 进入文本解析 / 窗口控制。 */

const FEATURE_PREFIX = 'bm_tpl:'
/** AI 保存全局入口：AI 可用时注册，否则移除。 */
export const AI_SAVE_FEATURE_CODE = 'ai_save'
/** 历史 AI / 快捷保存特性码：仅用于清理，不再注册。 */
const LEGACY_FEATURE_CODES = new Set(['ai_quick_save', 'ai_aggressive_save', 'quick_save'])

const AI_SAVE_FEATURE = {
  code: AI_SAVE_FEATURE_CODE,
  explain: 'AI 保存到书签',
  cmds: [
    'AI 保存书签',
    {
      type: 'regex',
      label: 'AI 保存到书签',
      match: '/(https?:\\/\\/|www\\.)\\S+|^\\s*[\\w-]+(\\.[\\w-]+)+(:\\d+)?([\\/?#]\\S*)?\\s*$/i',
      minLength: 4,
      maxLength: 4096
    }
  ]
}

const syncFeaturesImpl = async () => {
  const ut = window.utools
  if (!ut?.getFeatures || !ut?.removeFeature) return
  try {
    const features = ut.getFeatures()
    for (const feature of features) {
      if (feature.code.startsWith(FEATURE_PREFIX) || LEGACY_FEATURE_CODES.has(feature.code)) ut.removeFeature(feature.code)
    }
    const aiReady = getAIAvailability(selectAiSettings(useSettingsStore.getState())).ok
    const registered = features.some((f) => f.code === AI_SAVE_FEATURE_CODE)
    if (aiReady && !registered) ut.setFeature?.(AI_SAVE_FEATURE)
    else if (!aiReady && registered) ut.removeFeature(AI_SAVE_FEATURE_CODE)
  } catch (error) {
    console.warn('[uTools] 同步快捷入口失败:', error)
  }
}

const getEnterTextImpl = (payload: unknown): string => {
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) {
    const first = payload[0] as unknown
    if (typeof first === 'string') return first
    if (first && typeof first === 'object') {
      const value =
        (first as { text?: unknown; value?: unknown; title?: unknown }).text ??
        (first as { text?: unknown; value?: unknown; title?: unknown }).value ??
        (first as { text?: unknown; value?: unknown; title?: unknown }).title
      return typeof value === 'string' ? value : ''
    }
    return ''
  }
  if (!payload || typeof payload !== 'object') return ''
  const candidate = payload as { text?: unknown; value?: unknown; title?: unknown }
  const text = candidate.text ?? candidate.value ?? candidate.title
  if (typeof text === 'string') return text
  if ('text' in payload) {
    return typeof candidate.text === 'string' ? candidate.text : ''
  }
  return ''
}

const getWindowType = () => {
  try {
    return window.utools?.getWindowType?.()
  } catch {
    return undefined
  }
}

const isDetachedWindowNowImpl = () => {
  const type = getWindowType()
  return type === 'detach' || type === 'browser'
}

const setExpendHeightImpl = (height: number) => {
  if (typeof window.utools?.setExpendHeight === 'function') {
    window.utools.setExpendHeight(height)
  }
}

export function useUTools() {
  const syncFeatures = useCallback(syncFeaturesImpl, [])
  const getEnterText = useCallback((payload: unknown) => getEnterTextImpl(payload), [])
  const isDetachedWindowNow = useCallback(() => isDetachedWindowNowImpl(), [])
  const setExpendHeight = useCallback((height: number) => setExpendHeightImpl(height), [])

  return {
    FEATURE_PREFIX,
    syncFeatures,
    getEnterText,
    isDetachedWindowNow,
    setExpendHeight
  }
}
