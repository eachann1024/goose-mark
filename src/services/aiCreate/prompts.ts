import type { AIStructuredOutput } from '@/lib/aiProvider'
import type { AICreatePermissions } from './settings'

export interface PromptSubGroup {
  id: string
  name: string
  samples: string[]
}

export interface PromptGroup {
  id: string
  name: string
  subGroups: PromptSubGroup[]
}

export const PICK_URL_OUTPUT: AIStructuredOutput = {
  name: 'pick_url',
  description: '从文本中挑出用户想收藏的网址',
  schema: {
    type: 'object',
    properties: { url: { type: 'string' } },
    required: ['url'],
    additionalProperties: false
  }
}

export const ORGANIZE_OUTPUT: AIStructuredOutput = {
  name: 'bookmark_draft',
  description: '书签标题、简介与分组',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      groupId: { type: ['string', 'null'] },
      subGroupId: { type: ['string', 'null'] },
      newGroupName: { type: ['string', 'null'] },
      newSubGroupName: { type: ['string', 'null'] }
    },
    required: ['title', 'description', 'groupId', 'subGroupId', 'newGroupName', 'newSubGroupName'],
    additionalProperties: false
  }
}

export const JUDGE_OUTPUT: AIStructuredOutput = {
  name: 'bookmark_intent',
  description: '判断用户这句话是否在收藏一个真实网站',
  schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' }
    },
    required: ['ok'],
    additionalProperties: false
  }
}

export const JUDGE_SYSTEM = `你判断用户这句话能不能用来收藏一个真实网站。只输出 JSON：{"ok": boolean}。
ok 为 true 的唯一条件：能定位到一个具体网站、产品或域名。
乱码、无意义重复、闲聊、情绪、菜名或词组堆砌、没有网站或产品名，全部 ok 为 false。
拿不准就 ok 为 false。不要脑补网站。`

export function buildJudgePrompt(text: string) {
  return `用户原话：\n${text}`
}

export const SEARCH_QUERY_OUTPUT: AIStructuredOutput = {
  name: 'search_query',
  description: '从用户原话抽出用于搜索网站的关键词',
  schema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false
  }
}

export const PICK_URL_SYSTEM = '你从用户给出的文本和候选网址中，挑出用户真正想收藏的那一个网址。只输出 JSON：{"url": "候选中的原样网址"}。'

export const SEARCH_QUERY_SYSTEM = `你要从用户原话里抽出搜索词，用来在搜索引擎查找用户想收藏的网站。只输出 JSON：{"query": string}。
规则：保留产品名、网站名和「官网」这类定位词；去掉「帮我查询」「收藏到某分组」这类操作说明。query 不超过 40 字。`

export function buildSearchQueryPrompt(text: string) {
  return `用户原话：\n${text}`
}

export const PICK_HIT_SYSTEM = `你根据用户原话和搜索结果，选出用户要收藏的那个网站。只输出 JSON：{"url": string}。
规则：url 必须是结果列表里出现过的网址原样；都不符合时 url 为空字符串。不要编造网址。`

export function buildPickHitPrompt(text: string, hits: { title: string; url: string; snippet: string }[]) {
  const lines = hits.map((hit, i) => `${i + 1}. ${hit.title}\n${hit.url}${hit.snippet ? `\n${hit.snippet}` : ''}`).join('\n\n')
  return `用户原话：\n${text}\n\n搜索结果：\n${lines}`
}

export function buildPickUrlPrompt(text: string, candidates: string[]) {
  return `文本：\n${text}\n\n候选网址：\n${candidates.map((url, i) => `${i + 1}. ${url}`).join('\n')}`
}

export const ORGANIZE_SYSTEM = `你是书签整理助手。根据网站信息生成书签标题、简介并选择分组。只输出 JSON，字段：
{"title": string, "description": string, "groupId": string|null, "subGroupId": string|null, "newGroupName": string|null, "newSubGroupName": string|null}

规则：
1. 全部使用简体中文；外语网站也要翻译成中文。
2. title 不超过 20 字，用「网站/产品名 + 核心定位」，简洁。
3. description 不超过 150 字，一段话。书签是用户点开就走的，直接写这个网站是做什么的、有什么用（意图和用途）；不要营销腔，不要以「该网站」「本站」之类空话开头。
4. 分组：优先放进最合适的已有子分组，返回其 groupId 与 subGroupId，此时 newGroupName、newSubGroupName 为 null。只有已有分组都不合适且被允许新建时，才填写 newGroupName / newSubGroupName（新建主分组时 groupId、subGroupId 为 null；仅新建子分组时 groupId 为所属主分组 id、subGroupId 为 null）。不允许新建时必须选已有的。
5. 用户原话里如果点名了分组，优先按原话放入名称相符的分组，不要改放到别的分组。`

export function buildOrganizePrompt(input: {
  url: string
  title: string
  description: string
  content: string
  groups: PromptGroup[]
  permissions: AICreatePermissions
  instruction?: string
}) {
  const tree = input.groups
    .map((g) => {
      const subs = g.subGroups
        .map((s) => `  - 子分组 id=${s.id} 名称=${s.name}${s.samples.length ? `（已有：${s.samples.join('、')}）` : ''}`)
        .join('\n')
      return `- 主分组 id=${g.id} 名称=${g.name}\n${subs}`
    })
    .join('\n')
  return [
    input.instruction ? `用户原话：${input.instruction}` : '',
    `网址：${input.url}`,
    `页面标题：${input.title || '（无）'}`,
    `meta 描述：${input.description || '（无）'}`,
    `正文摘录：\n${input.content || '（未抓取到正文，请仅凭网址、标题和描述判断）'}`,
    `当前分组：\n${tree || '（暂无分组）'}`,
    `权限：允许新建主分组=${input.permissions.allowCreateGroup ? '是' : '否'}；允许新建子分组=${input.permissions.allowCreateSubGroup ? '是' : '否'}`
  ].filter(Boolean).join('\n\n')
}
