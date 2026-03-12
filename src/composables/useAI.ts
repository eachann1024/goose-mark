
import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { DEFAULT_AI_MODEL } from '@/constants/ai'

const PRODUCT_LOCAL_MODE_CONTEXT = '产品新增“本地模式”：可配合扩展使用；开启本地优先时会先读本地快照覆盖当前数据；跨设备同步后每台设备需单独选择本地存储路径。'
const MODEL_ERROR_KEYWORDS = ['model', '模型', 'not found', 'unknown', 'unsupported', 'invalid', '不存在', '不可用', '无效']

type ActiveModelInfo = {
  model: string
  isCustom: boolean
}

class AiRequestError extends Error {
  override cause: unknown
  modelInfo: ActiveModelInfo
  fallbackAttempted: boolean

  constructor(cause: unknown, modelInfo: ActiveModelInfo, fallbackAttempted = false) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'AiRequestError'
    this.cause = cause
    this.modelInfo = modelInfo
    this.fallbackAttempted = fallbackAttempted
  }
}

export interface CategorySuggestion {
  groupId: string
  groupName: string
  subGroupId: string
  subGroupName: string
  confidence: number // 0-1
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

  /** 检查 AI 是否可用，返回 { available, reason } */
  const checkAiAvailable = (): { available: boolean; reason: string } => {
    if (!window.utools) {
      return { available: false, reason: '当前不在 uTools 环境中运行' }
    }
    if (!window.utools.ai || typeof window.utools.ai !== 'function') {
      return { available: false, reason: '请在 uTools 设置中开启 AI 功能' }
    }
    return { available: true, reason: '' }
  }

  const isModelError = (errMsg: string) => {
    const lower = errMsg.toLowerCase()
    return MODEL_ERROR_KEYWORDS.some(key => lower.includes(key.toLowerCase()))
  }

  const getActiveModelInfo = (): ActiveModelInfo => {
    const customModel = settingsStore.customAiModel.trim()
    if (settingsStore.useCustomAiModel && customModel) {
      return { model: customModel, isCustom: true }
    }
    return { model: DEFAULT_AI_MODEL, isCustom: false }
  }

  const resolveErrorMessage = (
    error: unknown,
    action: '生成' | '分类',
    modelInfo: ActiveModelInfo,
    fallbackAttempted = false
  ) => {
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('余额') || errMsg.includes('balance') || errMsg.includes('quota')) {
      return 'AI 余额不足，请在 uTools 中充值'
    }
    if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('连接')) {
      return 'AI 服务连接失败，请检查网络'
    }
    if (isModelError(errMsg)) {
      if (modelInfo.isCustom) {
        return `自定义模型“${modelInfo.model}”不可用，请检查模型名是否填写正确，或关闭“使用自定义 AI 模型”后重试`
      }
      if (fallbackAttempted) {
        return `默认模型 ${DEFAULT_AI_MODEL} 当前不可用，自动回退后仍失败，请检查 uTools AI 配置后重试`
      }
      return `默认模型 ${DEFAULT_AI_MODEL} 当前不可用，请稍后重试`
    }
    if (modelInfo.isCustom) {
      return `AI ${action}失败，请稍后重试；若持续失败，请检查自定义模型“${modelInfo.model}”是否可用`
    }
    return `AI ${action}失败，请稍后重试`
  }

  const callAi = async (messages: Array<{ role: 'system' | 'user'; content: string }>) => {
    const aiCaller = window.utools!.ai!
    const modelInfo = getActiveModelInfo()
    try {
      return await aiCaller({ model: modelInfo.model, messages })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      // 仅默认模型允许自动回退，避免覆盖用户显式设置的模型
      if (!modelInfo.isCustom && isModelError(errMsg)) {
        console.warn(`[AI] 模型 ${modelInfo.model} 不可用，回退到 uTools 默认模型`)
        try {
          return await aiCaller({ messages })
        } catch (fallbackError) {
          throw new AiRequestError(fallbackError, modelInfo, true)
        }
      }
      throw new AiRequestError(e, modelInfo)
    }
  }

  const checkUrl = useDebounceFn(async (url: string) => {
    if (!url) {
      isUrlAccessible.value = false
      return
    }
    // In Dev environment (no uTools), skip strict probe check to allow UI testing
    if (!window.utools) {
       isUrlAccessible.value = true
       return
    }
  
    isCheckingUrl.value = true
    let target = url
    // Auto-prepend https if missing for check
    if (!/^https?:\/\//i.test(target)) {
       target = 'https://' + target
    }
    
    // Optimistic update
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

  const generateMetadata = async (url: string) => {
    if (!url) return null

    const { available, reason } = checkAiAvailable()
    if (!available) {
      aiError.value = reason
      return null
    }

    isGenerating.value = true
    aiError.value = ''
    try {
      const prompt = `你是一个专业的书签整理助手。请分析以下网址，提取核心信息并润色。
  
  网址: ${url}
  产品上下文：${PRODUCT_LOCAL_MODE_CONTEXT}
  
  请返回 JSON 格式：{"title": "...", "desc": "..." }
  要求：
  1. title: 极简且精准的名称（如 "GitHub"、"Bilibili"）。去除 "- 首页"、"Login" 等冗余后缀。优先中文（若常用）。不超过 15 字。
  2. desc: 用一句话概括核心功能与价值（如 "全球最大的代码托管与协作平台"）。语气专业、客观。不超过 40 字。`
  
      const res = await callAi([
        {
          role: 'system',
          content: `你是一个专业的书签整理助手。请分析网址内容并返回 JSON。已知上下文：${PRODUCT_LOCAL_MODE_CONTEXT}`
        },
        {
          role: 'user',
          content: prompt
        }
      ])
      const payload = typeof res === 'string'
        ? res
        : typeof res?.content === 'string'
          ? res.content
          : JSON.stringify(res)
      const match = payload.match(/\{[\s\S]*\}/)
      const jsonStr = match ? match[0] : payload
      const data = JSON.parse(jsonStr)
      return {
        title: data.title,
        desc: data.desc
      }
    } catch (e) {
      console.error('[AI] 调用失败:', e)
      const sourceError = e instanceof AiRequestError ? e.cause : e
      const modelInfo = e instanceof AiRequestError ? e.modelInfo : getActiveModelInfo()
      const fallbackAttempted = e instanceof AiRequestError ? e.fallbackAttempted : false
      aiError.value = resolveErrorMessage(sourceError, '生成', modelInfo, fallbackAttempted)
      return null
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * 使用 AI 根据 URL 建议最合适的分类
   * @param url 待分类的网址
   * @param existingGroups 现有分组列表
   * @param currentGroupId 当前选中的分组ID（可选，用于避免总是推荐当前分组）
   */
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

    try {
      // 构建分组列表描述
      const currentGroup = currentGroupId ? existingGroups.find(g => g.id === currentGroupId) : null
      const groupsDescription = existingGroups.map(g => {
        const subNames = g.subGroups.map(s => s.name).join('、')
        const isCurrent = currentGroup && g.id === currentGroupId ? ' [当前选中]' : ''
        return `- "${g.name}"${isCurrent}（子分组：${subNames || '无'}）`
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

      const payload = typeof res === 'string'
        ? res
        : typeof res?.content === 'string'
          ? res.content
          : JSON.stringify(res)

      const match = payload.match(/\{[\s\S]*\}/)
      const jsonStr = match ? match[0] : payload
      const data = JSON.parse(jsonStr)

      // 验证并映射到实际 ID
      const matchedGroup = existingGroups.find(
        g => g.name === data.groupName || g.name.includes(data.groupName) || data.groupName.includes(g.name)
      )
      if (!matchedGroup) {
        return null
      }

      const matchedSub = data.subGroupName
        ? matchedGroup.subGroups.find(
            s => s.name === data.subGroupName || s.name.includes(data.subGroupName) || data.subGroupName.includes(s.name)
          )
        : matchedGroup.subGroups[0]

      return {
        groupId: matchedGroup.id,
        groupName: matchedGroup.name,
        subGroupId: matchedSub?.id || matchedGroup.subGroups[0]?.id || '',
        subGroupName: matchedSub?.name || matchedGroup.subGroups[0]?.name || '',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
        reason: data.reason || '基于 URL 内容推荐'
      }
    } catch (e) {
      console.error('[AI] 分类建议失败:', e)
      const sourceError = e instanceof AiRequestError ? e.cause : e
      const modelInfo = e instanceof AiRequestError ? e.modelInfo : getActiveModelInfo()
      const fallbackAttempted = e instanceof AiRequestError ? e.fallbackAttempted : false
      aiError.value = resolveErrorMessage(sourceError, '分类', modelInfo, fallbackAttempted)
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
