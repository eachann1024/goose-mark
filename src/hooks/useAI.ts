import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { useSettingsStore, selectAiSettings } from '@/stores/settings'
import { probeUrl } from '@/services/siteProbe'
import {
  AIProviderRequestError,
  getAIAvailability,
  runAIText,
  type AIMessage
} from '@/lib/aiProvider'

/**
 * AI 元信息 / 分类建议（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue ref 状态 → useState；useDebounceFn → 自定义 useRef + setTimeout 防抖。
 * 仅保留业务逻辑。
 * AI 配置从 settings store 实时读取（useSettingsStore.getState()），与旧版等价。
 */

const MODEL_ERROR_KEYWORDS = ['model', '模型', 'not found', 'unknown', 'unsupported', 'invalid', '不存在', '不可用', '无效']

export type MetadataSource = 'page' | 'ai' | 'network'

export interface GenerateMetadataInput {
  url: string
  title?: string
  desc?: string
  forceNetworkFallback?: boolean
}

export interface GenerateMetadataResult {
  title: string
  desc: string
  source: MetadataSource
  usedNetworkFallback: boolean
}

export interface CategorySuggestion {
  groupId: string
  groupName: string
  subGroupId: string
  subGroupName: string
  confidence: number
  reason: string
}

export interface GroupInfo {
  id: string
  name: string
  subGroups: { id: string; name: string }[]
}

type ActiveModelInfo = {
  model: string
  isCustom: boolean
}

export function useAI() {
  const [isUrlAccessible, setIsUrlAccessible] = useState(false)
  const [isCheckingUrl, setIsCheckingUrl] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSuggestingCategory, setIsSuggestingCategory] = useState(false)
  const [aiError, setAiError] = useState('')

  // 实时读取 AI 设置（非响应式快照，调用时取最新值，等价旧版 settingsStore.aiSettings）
  const getAiSettings = useCallback(() => selectAiSettings(useSettingsStore.getState()), [])

  const checkAiAvailable = useCallback((): { available: boolean; reason: string } => {
    const availability = getAIAvailability(getAiSettings())
    return availability.ok ? { available: true, reason: '' } : { available: false, reason: availability.reason }
  }, [getAiSettings])

  const isModelError = useCallback((errMsg: string) => {
    const lower = errMsg.toLowerCase()
    return MODEL_ERROR_KEYWORDS.some((key) => lower.includes(key.toLowerCase()))
  }, [])

  const getActiveModelInfo = useCallback((): ActiveModelInfo => {
    const settings = getAiSettings()
    return {
      model: settings.selectedModelId || DEFAULT_AI_MODEL,
      isCustom: settings.useCustomProvider
    }
  }, [getAiSettings])

  const resolveErrorMessage = useCallback(
    (error: unknown, action: '生成' | '分类') => {
      const providerError = error instanceof AIProviderRequestError ? error : null
      const errMsg = error instanceof Error ? error.message : String(error)
      const modelInfo = providerError
        ? { model: providerError.model || getActiveModelInfo().model, isCustom: providerError.isCustomModel }
        : getActiveModelInfo()

      if (errMsg.includes('余额') || errMsg.includes('balance') || errMsg.includes('quota')) {
        return 'AI 余额不足，请检查当前供应商额度'
      }
      if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('连接')) {
        return 'AI 服务连接失败，请检查网络'
      }
      if (isModelError(errMsg)) {
        if (modelInfo.isCustom) {
          return `自定义模型“${modelInfo.model}”不可用，请检查供应商配置或模型名后重试`
        }
        if (providerError?.fallbackAttempted) {
          return `uTools 模型“${modelInfo.model}”不可用，自动回退后仍失败，请检查 AI 配置后重试`
        }
        return `uTools 模型“${modelInfo.model}”当前不可用，请重新选择或稍后重试`
      }
      if (modelInfo.isCustom) {
        return `AI ${action}失败，请稍后重试；若持续失败，请检查自定义供应商和模型“${modelInfo.model}”`
      }
      return `AI ${action}失败，请稍后重试`
    },
    [getActiveModelInfo, isModelError]
  )

  const callAi = useCallback((messages: AIMessage[]) => runAIText(getAiSettings(), messages), [getAiSettings])

  // checkUrl 防抖（500ms），等价旧版 useDebounceFn
  const checkUrlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkUrl = useCallback((url: string) => {
    if (checkUrlTimer.current) clearTimeout(checkUrlTimer.current)
    checkUrlTimer.current = setTimeout(async () => {
      if (!url) {
        setIsUrlAccessible(false)
        return
      }
      if (!window.utools) {
        setIsUrlAccessible(true)
        return
      }

      setIsCheckingUrl(true)
      let target = url
      if (!/^https?:\/\//i.test(target)) target = 'https://' + target
      setIsUrlAccessible(true)

      try {
        const res = await probeUrl(target)
        if (!res.ok) setIsUrlAccessible(false)
      } catch {
        setIsUrlAccessible(false)
      } finally {
        setIsCheckingUrl(false)
      }
    }, 500)
  }, [])

  useEffect(() => {
    return () => {
      if (checkUrlTimer.current) clearTimeout(checkUrlTimer.current)
    }
  }, [])

  const generateMetadata = useCallback(
    async (input: string | GenerateMetadataInput): Promise<GenerateMetadataResult | null> => {
      const params =
        typeof input === 'string'
          ? { url: input, title: '', desc: '', forceNetworkFallback: false }
          : {
              url: input.url,
              title: input.title?.trim() || '',
              desc: input.desc?.trim() || '',
              forceNetworkFallback: !!input.forceNetworkFallback
            }
      if (!params.url) return null

      const { available, reason } = checkAiAvailable()
      if (!available) {
        setAiError(reason)
        return null
      }

      setIsGenerating(true)
      setAiError('')

      try {
        const prompt = `你是一个专业的书签整理助手。请基于已有线索，为该网址生成适合保存到书签里的中文标题和简介。

网址：${params.url}
页面标题：${params.title || '无'}
页面描述：${params.desc || '无'}
是否已触发联网兜底：${params.forceNetworkFallback ? '是' : '否'}

请返回 JSON 格式：{"title":"...","desc":"...","source":"ai"|"network"}
要求：
1. 结合网址、页面标题、页面描述理解内容；优先输出自然、简洁、准确的中文。
2. title: 极简且精准，去除“首页”“登录”“Documentation”等冗余词，不超过 15 字。
3. desc: 一句话概括核心功能与价值，专业客观，不超过 40 字。
4. 如果页面标题/描述较弱，但已通过联网兜底拿到线索，source 返回 "network"；否则返回 "ai"。
5. 只返回 JSON，不要附加解释。`

        const res = await callAi([
          {
            role: 'system',
            content: `你是一个专业的书签整理助手。请分析网址线索并返回 JSON。输出标题和简介必须适合中文书签展示。`
          },
          { role: 'user', content: prompt }
        ])

        const match = res.match(/\{[\s\S]*\}/)
        const jsonStr = match ? match[0] : res
        let data: Record<string, unknown>
        try {
          data = JSON.parse(jsonStr) as Record<string, unknown>
        } catch (parseErr) {
          console.warn('[AI] generateMetadata JSON.parse 失败，原始内容片段:', jsonStr.slice(0, 200), parseErr)
          return null
        }
        const result = {
          title: String(data.title || '').trim(),
          desc: String(data.desc || '').trim(),
          source: data.source === 'network' || params.forceNetworkFallback ? 'network' : 'ai',
          usedNetworkFallback: params.forceNetworkFallback
        } satisfies GenerateMetadataResult

        return result
      } catch (error) {
        console.error('[AI] 调用失败:', error)
        setAiError(resolveErrorMessage(error, '生成'))
        return null
      } finally {
        setIsGenerating(false)
      }
    },
    [callAi, checkAiAvailable, resolveErrorMessage]
  )

  const suggestCategory = useCallback(
    async (url: string, existingGroups: GroupInfo[], currentGroupId?: string): Promise<CategorySuggestion | null> => {
      if (!url || existingGroups.length === 0) return null

      const { available, reason } = checkAiAvailable()
      if (!available) {
        setAiError(reason)
        return null
      }

      setIsSuggestingCategory(true)
      setAiError('')

      try {
        const currentGroup = currentGroupId ? existingGroups.find((group) => group.id === currentGroupId) : null
        const groupsDescription = existingGroups
          .map((group) => {
            const subNames = group.subGroups.map((subGroup) => subGroup.name).join('、')
            const isCurrent = currentGroup && group.id === currentGroupId ? ' [当前选中]' : ''
            return `- "${group.name}"${isCurrent}（子分组：${subNames || '无'}）`
          })
          .join('\n')

        const avoidCurrentTip = currentGroup
          ? `\n注意：用户当前在"${currentGroup.name}"分组中。除非该网址与当前分组高度相关（置信度>0.8），否则优先推荐其他分组，帮助用户发现更好的分类选择。`
          : ''

        const prompt = `你是一个专业的书签分类助手。请认真分析以下网址的内容和用途，从用户的分组结构中推荐最合适的分类。

【待分类网址】
${url}

【用户现有分组】
${groupsDescription}
${avoidCurrentTip}

【分析要求】
第一步：分析网址特征
- 识别网址的主要领域（如：开发工具、设计资源、社交媒体、文档等）
- 判断内容类型（如：工具网站、教程文档、娱乐视频等）

第二步：匹配分组
- 对比网址特征与各分组的用途
- 综合考虑主分组和子分组的匹配度

第三步：返回推荐结果（JSON格式）
{
  "analysis": "简述你对该网址的分析（如：这是一个前端开发工具网站）",
  "groupName": "推荐的主分组名称（必须是上面列表中存在的）",
  "subGroupName": "推荐的子分组名称（必须是该主分组下存在的）",
  "confidence": 0.85,
  "reason": "推荐理由（10-15字，说明为什么这个分类合适）"
}

【重要规则】
1. 必须从现有分组中选择，不要创造新分组
2. confidence 范围 0-1，0.7以下表示不太确定，0.85以上表示高度匹配
3. 如果没有任何合适的分组，groupName 返回空字符串
4. analysis 要简洁准确地描述网址特征，帮助用户理解你的判断依据`

        const res = await callAi([
          {
            role: 'system',
            content: `你是一个书签分类助手，根据用户分组结构推荐最佳分类。只返回JSON，不要其他内容。`
          },
          { role: 'user', content: prompt }
        ])

        const match = res.match(/\{[\s\S]*\}/)
        const jsonStr = match ? match[0] : res
        let data: Record<string, unknown>
        try {
          data = JSON.parse(jsonStr) as Record<string, unknown>
        } catch (parseErr) {
          console.warn('[AI] suggestCategory JSON.parse 失败，原始内容片段:', jsonStr.slice(0, 200), parseErr)
          return null
        }

        const dataGroupName = typeof data.groupName === 'string' ? data.groupName : ''
        const dataSubGroupName = typeof data.subGroupName === 'string' ? data.subGroupName : ''
        const matchedGroup = existingGroups.find(
          (group) =>
            group.name === dataGroupName ||
            group.name.includes(dataGroupName) ||
            dataGroupName.includes(group.name)
        )
        if (!matchedGroup) return null

        const matchedSubGroup = dataSubGroupName
          ? matchedGroup.subGroups.find(
              (subGroup) =>
                subGroup.name === dataSubGroupName ||
                subGroup.name.includes(dataSubGroupName) ||
                dataSubGroupName.includes(subGroup.name)
            )
          : matchedGroup.subGroups[0]

        const result = {
          groupId: matchedGroup.id,
          groupName: matchedGroup.name,
          subGroupId: matchedSubGroup?.id || matchedGroup.subGroups[0]?.id || '',
          subGroupName: matchedSubGroup?.name || matchedGroup.subGroups[0]?.name || '',
          confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
          reason: typeof data.reason === 'string' ? data.reason : '基于 URL 内容推荐'
        } satisfies CategorySuggestion

        return result
      } catch (error) {
        console.error('[AI] 分类建议失败:', error)
        setAiError(resolveErrorMessage(error, '分类'))
        return null
      } finally {
        setIsSuggestingCategory(false)
      }
    },
    [callAi, checkAiAvailable, resolveErrorMessage]
  )

  return {
    isUrlAccessible,
    isCheckingUrl,
    isGenerating,
    isSuggestingCategory,
    aiError,
    checkUrl,
    checkAiAvailable,
    generateMetadata,
    suggestCategory
  }
}
