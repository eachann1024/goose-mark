import type * as React from 'react'
import { useCallback, useEffect } from 'react'
import { type Screen } from './homeTypes'
import { SET_NAV } from './SettingsContent'

export function useHomeSettingsNavigation({
  screen,
  setMainRef,
  isSetScrollingRef,
  setSetNavIdx,
  setScrollTimeout
}: {
  screen: Screen
  setMainRef: React.RefObject<HTMLDivElement | null>
  isSetScrollingRef: React.RefObject<boolean>
  setSetNavIdx: React.Dispatch<React.SetStateAction<number>>
  setScrollTimeout: React.RefObject<ReturnType<typeof setTimeout> | null>
}) {

  // 设置页：IntersectionObserver 同步左侧高亮
  useEffect(() => {
    if (screen !== 'settings') return
    const container = setMainRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (isSetScrollingRef.current) return
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = SET_NAV.findIndex(([, , id]) => id === entry.target.id)
            if (idx >= 0) setSetNavIdx(idx)
            break
          }
        }
      },
      { root: container, rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )
    for (const [, , id] of SET_NAV) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [screen])

  const scrollToSetSection = useCallback((idx: number) => {
    const [, , id] = SET_NAV[idx]
    const el = document.getElementById(id)
    const container = setMainRef.current
    if (!el || !container) return
    isSetScrollingRef.current = true
    if (setScrollTimeout.current) clearTimeout(setScrollTimeout.current)
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    container.scrollTo({ top, behavior: 'auto' })
    setSetNavIdx(idx)
    setScrollTimeout.current = setTimeout(() => {
      isSetScrollingRef.current = false
    }, 600)
  }, [])

  return { scrollToSetSection }
}
