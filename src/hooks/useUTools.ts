import { useCallback } from 'react'

/** uTools 旧入口清理 / 进入文本解析 / 窗口控制。 */

const FEATURE_PREFIX = 'bm_tpl:'
/** 历史 AI / 快捷保存特性码：仅用于清理，不再注册。 */
const LEGACY_FEATURE_CODES = new Set(['ai_quick_save', 'ai_aggressive_save', 'quick_save'])

// ponytail: 只保留主入口；旧动态书签/AI 入口在下次同步时移除，需要快捷键时走主界面操作。
const syncFeaturesImpl = async () => {
  const ut = window.utools
  if (!ut?.getFeatures || !ut?.removeFeature) return
  try {
    for (const feature of ut.getFeatures()) {
      if (feature.code.startsWith(FEATURE_PREFIX) || LEGACY_FEATURE_CODES.has(feature.code)) ut.removeFeature(feature.code)
    }
  } catch (error) {
    console.warn('[uTools] 清理旧快捷入口失败:', error)
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
