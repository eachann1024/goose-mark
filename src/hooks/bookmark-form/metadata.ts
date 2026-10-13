import type { AISettingsLike, AIMessage } from '@/lib/aiProvider';
import { selectAiSettings, useSettingsStore } from '@/stores/settings';
import { getAIAvailability, AIProviderRequestError, runAIText } from '@/lib/aiProvider';
import { DEFAULT_AI_MODEL } from '@/constants/ai';
import type { MetadataSource } from '../useAI';
import { buildMetadataUserPrompt, METADATA_SYSTEM_PROMPT, METADATA_OUTPUT } from '@/constants/aiPrompts';
import { parseAIJsonObject, truncateAIText } from '@/lib/aiOutput';

/**
 * 新建/编辑书签表单：模块级 Zustand 单例 + URL 防抖取图标等副作用。
 * AI 走 lib/aiProvider，配置读自 settings store。
 */

export const MODEL_ERROR_KEYWORDS = ['model', '模型', 'not found', 'unknown', 'unsupported', 'invalid', '不存在', '不可用', '无效'];

// ---- 框架无关纯辅助函数（从旧版迁移）----

export const getActiveAiSettings = (): AISettingsLike => selectAiSettings(useSettingsStore.getState());
export const checkAiAvailable = (): {
  available: boolean;
  reason: string;
} => {
  const availability = getAIAvailability(getActiveAiSettings());
  return availability.ok ? {
    available: true,
    reason: ''
  } : {
    available: false,
    reason: availability.reason
  };
};
export const isModelError = (errMsg: string) => {
  const lower = errMsg.toLowerCase();
  return MODEL_ERROR_KEYWORDS.some(key => lower.includes(key.toLowerCase()));
};
export const resolveErrorMessage = (error: unknown, action: '生成' | '分类') => {
  const providerError = error instanceof AIProviderRequestError ? error : null;
  const errMsg = error instanceof Error ? error.message : String(error);
  const settings = getActiveAiSettings();
  const modelInfo = providerError ? {
    model: providerError.model || settings.selectedModelId || DEFAULT_AI_MODEL,
    isCustom: providerError.isCustomModel
  } : {
    model: settings.selectedModelId || DEFAULT_AI_MODEL,
    isCustom: settings.useCustomProvider
  };
  if (errMsg.includes('余额') || errMsg.includes('balance') || errMsg.includes('quota')) {
    return 'AI 余额不足，请检查当前供应商额度';
  }
  if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('连接')) {
    return 'AI 服务连接失败，请检查网络';
  }
  if (isModelError(errMsg)) {
    if (modelInfo.isCustom) return `自定义模型“${modelInfo.model}”不可用，请检查供应商配置或模型名后重试`;
    if (providerError?.fallbackAttempted) return `uTools 模型“${modelInfo.model}”不可用，自动回退后仍失败，请检查 AI 配置后重试`;
    return `uTools 模型“${modelInfo.model}”当前不可用，请重新选择或稍后重试`;
  }
  if (modelInfo.isCustom) return `AI ${action}失败，请稍后重试；若持续失败，请检查接口配置和模型“${modelInfo.model}”`;
  return `AI ${action}失败，请稍后重试`;
};
export const generateMetadataDirect = async (input: {
  url: string;
  title?: string;
  desc?: string;
  forceNetworkFallback?: boolean;
}): Promise<{
  title: string;
  desc: string;
  source: MetadataSource;
  usedNetworkFallback: boolean;
} | null> => {
  const params = {
    url: input.url,
    title: input.title?.trim() || '',
    desc: input.desc?.trim() || '',
    forceNetworkFallback: !!input.forceNetworkFallback
  };
  if (!params.url) return null;
  const prompt = buildMetadataUserPrompt(params);
  const messages: AIMessage[] = [{
    role: 'system',
    content: METADATA_SYSTEM_PROMPT
  }, {
    role: 'user',
    content: prompt
  }];
  const res = await runAIText(getActiveAiSettings(), messages, {
    output: METADATA_OUTPUT
  });
  try {
    const data = parseAIJsonObject(res);
    return {
      title: truncateAIText(data.title, 15),
      desc: truncateAIText(data.desc, 40),
      source: data.source === 'network' || params.forceNetworkFallback ? 'network' : 'ai',
      usedNetworkFallback: params.forceNetworkFallback
    };
  } catch {
    return null;
  }
};
