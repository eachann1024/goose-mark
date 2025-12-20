
import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { probeUrl } from '@/services/siteProbe'

export function useAI() {
  const isUrlAccessible = ref(false)
  const isCheckingUrl = ref(false)
  const isGenerating = ref(false)
  const aiError = ref('')

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
    if (!url || !isUrlAccessible.value) return null
  
    const aiCaller = window.utools?.ai
    if (!aiCaller) {
      aiError.value = '当前 uTools 未开启 AI 或版本不支持'
      return null
    }
  
    isGenerating.value = true
    aiError.value = ''
    try {
      const prompt = `你是一个专业的书签整理助手。请分析以下网址，提取核心信息并润色。
  
  网址: ${url}
  
  请返回 JSON 格式：{"title": "...", "desc": "..." }
  要求：
  1. title: 极简且精准的名称（如 "GitHub"、"Bilibili"）。去除 "- 首页"、"Login" 等冗余后缀。优先中文（若常用）。不超过 15 字。
  2. desc: 用一句话概括核心功能与价值（如 "全球最大的代码托管与协作平台"）。语气专业、客观。不超过 40 字。`
  
      const res = await aiCaller({
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
      aiError.value = 'AI 生成失败，请确保 uTools 已配置 AI 服务'
      return null
    } finally {
      isGenerating.value = false
    }
  }

  return {
    isUrlAccessible,
    isCheckingUrl,
    isGenerating,
    aiError,
    checkUrl,
    generateMetadata
  }
}
