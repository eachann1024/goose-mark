/**
 * @deprecated 请使用 useUIManager 替代
 * 保留此文件仅为向后兼容
 */
import { useUIManager } from './useUIManager'

export function useTooltipManager() {
  const tooltipProviderKey = useUIManager((s) => s.tooltipProviderKey)
  const hideAllTooltips = useUIManager((s) => s.hideAllTooltips)
  return { tooltipProviderKey, hideAllTooltips }
}
