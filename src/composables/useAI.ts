import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { DEFAULT_AI_MODEL } from '@/constants/ai'
import { trackEvent } from '@/services/analytics'
import {
  AIProviderRequestError,
  getAIAvailability,
  getAIProviderMode,
  runAIText,
  type AIMessage
} from '@/lib/aiProvider'

const PRODUCT_LOCAL_MODE_CONTEXT = '产品新增“本地模式”：可配合扩展使用；开启本地优先时会先读本地快照覆盖当前数据；跨设备同步后每台设备需单独选择本地存储路径。'
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

type ActiveModelInfo = {
  model: string
  isCustom: boolean
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

export function useAI() {
  const settingsStore = useSettingsStore()
  const isUrlAccessible = ref(false)
  const isCheckingUrl = ref(false)
  const isGenerating = ref(false)
  const isSuggestingCategory = ref(false)
  const aiError = ref('')

  const checkAiAvailable = (): { available: boolean; reason: string } => {
    const availability = getAIAvailability(settingsStore.aiSettings)
    return availability.ok
      ? { available: true, reason: '' }
      : { available: false, reason: availability.reason }
  }

  const isModelError = (errMsg: string) => {
    const lower = errMsg.toLowerCase()
    return MODEL_ERROR_KEYWORDS.some(key => lower.includes(key.toLowerCase()))
  }

  const getActiveModelInfo = (): ActiveModelInfo => {
    const settings = settingsStore.aiSettings
    return {
      model: settings.selectedModelId || DEFAULT_AI_MODEL,
      isCustom: settings.useCustomProvider
    }
  }

  const buildAIEventPayload = (featureName: 'metadata' | 'category_suggestion', extra?: Record<string, string | number | boolean>) => {
    const settings = settingsStore.aiSettings
    return {
      feature_name: featureName,
      provider_type: getAIProviderMode(settings),
      selected_model_id: settings.selectedModelId || DEFAULT_AI_MODEL,
      ...extra
    }
  }

  const resolveErrorMessage = (
    error: unknown,
    action: '生成' | '分类'
  ) => {
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
  }

  const callAi = async (messages: AIMessage[]) => runAIText(settingsStore.aiSettings, messages)

  const checkUrl = useDebounceFn(async (url: string) => {
    if (!url) {
      isUrlAccessible.value = false
      return
    }

    if (!window.utools) {
      isUrlAccessible.value = true
      return
    }

    isCheckingUrl.value = true
    let target = url
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target
    }

    isUrlAccessible.value = true

    try {
      const res = await probeUrl(target)
      if (!res.ok) isUrlAccessible.value = false
    } catch {
      isUrlAccessible.value = false
    } finally {
      isCheckingUrl.value = false
    }
  }, 500)

  const generateMetadata = async (input: string | GenerateMetadataInput): Promise<GenerateMetadataResult | null> => {
    const params = typeof input === 'string'
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
      aiError.value = reason
      return null
    }

    isGenerating.value = true
    aiError.value = ''
    trackEvent('bookmark_ai_request_submitted', buildAIEventPayload('metadata', {
      used_network_fallback: params.forceNetworkFallback
    }))

    try {
      const prompt = `你是一个专业的书签整理助手。请基于已有线索，为该网址生成适合保存到书签里的中文标题和简介。

网址：${params.url}
页面标题：${params.title || '无'}
页面描述：${params.desc || '无'}
是否已触发联网兜底：${params.forceNetworkFallback ? '是' : '否'}
产品上下文：${PRODUCT_LOCAL_MODE_CONTEXT}

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
          content: `你是一个专业的书签整理助手。请分析网址线索并返回 JSON。输出标题和简介必须适合中文书签展示。已知上下文：${PRODUCT_LOCAL_MODE_CONTEXT}`
        },
        {
          role: 'user',
          content: prompt
        }
      ])

      const match = res.match(/\{[\s\S]*\}/)
      const jsonStr = match ? match[0] : res
      const data = JSON.parse(jsonStr)
      const result = {
        title: String(data.title || '').trim(),
        desc: String(data.desc || '').trim(),
        source: data.source === 'network' || params.forceNetworkFallback ? 'network' : 'ai',
        usedNetworkFallback: params.forceNetworkFallback
      } satisfies GenerateMetadataResult

      trackEvent('bookmark_ai_request_succeeded', buildAIEventPayload('metadata', {
        used_network_fallback: result.usedNetworkFallback,
        metadata_source: result.source
      }))

      return result
    } catch (error) {
      console.error('[AI] 调用失败:', error)
      aiError.value = resolveErrorMessage(error, '生成')
      trackEvent('bookmark_ai_request_failed', buildAIEventPayload('metadata', {
        used_network_fallback: params.forceNetworkFallback,
        error_message: aiError.value
      }))
      return null
    } finally {
      isGenerating.value = false
    }
  }

  const suggestCategory = async (
    url: string,
    existingGroups: GroupInfo[],
    currentGroupId?: string
  ): Promise<CategorySuggestion | null> => {
    if (!url || existingGroups.length === 0) return null

    const { available, reason } = checkAiAvailable()
    if (!available) {
      aiError.value = reason
      return null
    }

    isSuggestingCategory.value = true
    aiError.value = ''
    trackEvent('bookmark_ai_request_submitted', buildAIEventPayload('category_suggestion'))

    try {
      const currentGroup = currentGroupId ? existingGroups.find(group => group.id === currentGroupId) : null
      const groupsDescription = existingGroups.map(group => {
        const subNames = group.subGroups.map(subGroup => subGroup.name).join('、')
        const isCurrent = currentGroup && group.id === currentGroupId ? ' [当前选中]' : ''
        return `- "${group.name}"${isCurrent}（子分组：${subNames || '无'}）`
      }).join('\n')

      const avoidCurrentTip = currentGroup
        ? `\n注意：用户当前在"${currentGroup.name}"分组中。除非该网址与当前分组高度相关（置信度>0.8），否则优先推荐其他分组，帮助用户发现更好的分类选择。`
        : ''

      const prompt = `你是一个专业的书签分类助手。请认真分析以下网址的内容和用途，从用户的分组结构中推荐最合适的分类。

【待分类网址】
${url}

【产品上下文】
${PRODUCT_LOCAL_MODE_CONTEXT}

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
          content: `你是一个书签分类助手，根据用户分组结构推荐最佳分类。只返回JSON，不要其他内容。已知上下文：${PRODUCT_LOCAL_MODE_CONTEXT}`
        },
        {
          role: 'user',
          content: prompt
        }
      ])

      const match = res.match(/\{[\s\S]*\}/)
      const jsonStr = match ? match[0] : res
      const data = JSON.parse(jsonStr)

      const matchedGroup = existingGroups.find(
        group => group.name === data.groupName || group.name.includes(data.groupName) || data.groupName.includes(group.name)
      )
      if (!matchedGroup) {
        return null
      }

      const matchedSubGroup = data.subGroupName
        ? matchedGroup.subGroups.find(
            subGroup => subGroup.name === data.subGroupName || subGroup.name.includes(data.subGroupName) || data.subGroupName.includes(subGroup.name)
          )
        : matchedGroup.subGroups[0]

      const result = {
        groupId: matchedGroup.id,
        groupName: matchedGroup.name,
        subGroupId: matchedSubGroup?.id || matchedGroup.subGroups[0]?.id || '',
        subGroupName: matchedSubGroup?.name || matchedGroup.subGroups[0]?.name || '',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
        reason: data.reason || '基于 URL 内容推荐'
      } satisfies CategorySuggestion

      trackEvent('bookmark_ai_request_succeeded', buildAIEventPayload('category_suggestion', {
        suggested_group_id: result.groupId,
        suggested_sub_group_id: result.subGroupId
      }))

      return result
    } catch (error) {
      console.error('[AI] 分类建议失败:', error)
      aiError.value = resolveErrorMessage(error, '分类')
      trackEvent('bookmark_ai_request_failed', buildAIEventPayload('category_suggestion', {
        error_message: aiError.value
      }))
      return null
    } finally {
      isSuggestingCategory.value = false
    }
  }

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
