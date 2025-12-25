
import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'

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
    if (!window.utools.ai) {
      return { available: false, reason: '请在 uTools 设置中开启 AI 功能' }
    }
    return { available: true, reason: '' }
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

    const aiCaller = window.utools!.ai!
    isGenerating.value = true
    aiError.value = ''
    try {
      const prompt = `你是一个专业的书签整理助手。请分析以下网址，提取核心信息并润色。
  
  网址: ${url}
  
  请返回 JSON 格式：{"title": "...", "desc": "..." }
  要求：
  1. title: 极简且精准的名称（如 "GitHub"、"Bilibili"）。去除 "- 首页"、"Login" 等冗余后缀。优先中文（若常用）。不超过 15 字。
  2. desc: 用一句话概括核心功能与价值（如 "全球最大的代码托管与协作平台"）。语气专业、客观。不超过 40 字。`
  
      const model = settingsStore.useCustomAiModel && settingsStore.customAiModel.trim()
        ? settingsStore.customAiModel.trim()
        : undefined
      const res = await aiCaller({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的书签整理助手。请分析网址内容并返回 JSON。'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
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
      const errMsg = e instanceof Error ? e.message : String(e)
      if (errMsg.includes('余额') || errMsg.includes('balance') || errMsg.includes('quota')) {
        aiError.value = 'AI 余额不足，请在 uTools 中充值'
      } else if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('连接')) {
        aiError.value = 'AI 服务连接失败，请检查网络'
      } else {
        aiError.value = 'AI 生成失败，请稍后重试'
      }
      return null
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * 使用 AI 根据 URL 建议最合适的分类
   */
  const suggestCategory = async (
    url: string,
    existingGroups: GroupInfo[]
  ): Promise<CategorySuggestion | null> => {
    if (!url || existingGroups.length === 0) return null

    const { available, reason } = checkAiAvailable()
    if (!available) {
      aiError.value = reason
      return null
    }

    const aiCaller = window.utools!.ai!
    isSuggestingCategory.value = true
    aiError.value = ''

    try {
      // 构建分组列表描述
      const groupsDescription = existingGroups.map(g => {
        const subNames = g.subGroups.map(s => s.name).join('、')
        return `- "${g.name}"（子分组：${subNames || '无'}）`
      }).join('\n')

      const prompt = `你是一个书签分类助手。请根据用户的现有分组结构，为以下网址推荐最合适的分类。

网址: ${url}

用户现有分组：
${groupsDescription}

请返回 JSON 格式：
{
  "groupName": "推荐的主分组名称（必须是上面列表中存在的）",
  "subGroupName": "推荐的子分组名称（必须是该主分组下存在的，如果没有合适的就填空字符串）",
  "confidence": 0.8,
  "reason": "简短说明推荐理由（不超过20字）"
}

要求：
1. 只能从现有分组中选择，不要创造新分组
2. confidence 是 0-1 的置信度，越高表示越匹配
3. 如果没有任何合适的分组，groupName 返回空字符串`

      const model = settingsStore.useCustomAiModel && settingsStore.customAiModel.trim()
        ? settingsStore.customAiModel.trim()
        : undefined

      const res = await aiCaller({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个书签分类助手，根据用户分组结构推荐最佳分类。只返回JSON，不要其他内容。'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })

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
      const errMsg = e instanceof Error ? e.message : String(e)
      if (errMsg.includes('余额') || errMsg.includes('balance') || errMsg.includes('quota')) {
        aiError.value = 'AI 余额不足，请在 uTools 中充值'
      } else if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('连接')) {
        aiError.value = 'AI 服务连接失败，请检查网络'
      } else {
        aiError.value = 'AI 分类失败，请稍后重试'
      }
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
