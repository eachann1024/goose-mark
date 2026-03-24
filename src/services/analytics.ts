type AnalyticsValue = string | number | boolean | null | undefined

type AnalyticsProperties = Record<string, AnalyticsValue>

type ClarityCommand = (...args: unknown[]) => void

type IdentifyOptions = {
  friendlyName?: string
  tags?: AnalyticsProperties
}

const MAX_VALUE_LENGTH = 120

const toSafeString = (value: AnalyticsValue): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  const text = String(value).trim()
  if (!text) return null
  return text.length > MAX_VALUE_LENGTH ? text.slice(0, MAX_VALUE_LENGTH) : text
}

const normalizeProperties = (properties?: AnalyticsProperties) => {
  if (!properties) return {} as Record<string, string>
  return Object.entries(properties).reduce<Record<string, string>>((acc, [key, value]) => {
    const safeKey = String(key || '').trim()
    const safeValue = toSafeString(value)
    if (!safeKey || safeValue === null) return acc
    acc[safeKey] = safeValue
    return acc
  }, {})
}

const getClarity = (): ClarityCommand | null => {
  if (typeof window === 'undefined') return null
  const clarity = (window as Window & { clarity?: ClarityCommand }).clarity
  return typeof clarity === 'function' ? clarity : null
}

export const trackEvent = (eventName: string, properties?: AnalyticsProperties) => {
  const name = String(eventName || '').trim()
  if (!name) return

  const clarity = getClarity()
  if (!clarity) return

  const normalized = normalizeProperties(properties)

  try {
    clarity('event', name)
    Object.entries(normalized).forEach(([key, value]) => {
      clarity('set', `${name}_${key}`, value)
    })
  } catch (error) {
    console.warn('[Analytics] trackEvent failed:', name, error)
  }
}

export const identifyUser = (customUserId: string, options?: IdentifyOptions) => {
  const clarity = getClarity()
  const userId = String(customUserId || '').trim()
  if (!clarity || !userId) return

  const friendlyName = toSafeString(options?.friendlyName)
  const tags = normalizeProperties(options?.tags)

  try {
    clarity('identify', userId, undefined, undefined, friendlyName ?? undefined)
    Object.entries(tags).forEach(([key, value]) => {
      clarity('set', key, value)
    })
  } catch (error) {
    console.warn('[Analytics] identifyUser failed:', userId, error)
  }
}

export const useAnalytics = () => ({ trackEvent, identifyUser })

export type { AnalyticsProperties }
