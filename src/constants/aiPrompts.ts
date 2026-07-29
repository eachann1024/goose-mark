import agentEntryPrompt from '@/agent/AGENTS.md?raw'
import generateMetadataSkill from '@/agent/generateMetadata/SKILL.md?raw'
import categorizeBookmarkSkill from '@/agent/categorizeBookmark/SKILL.md?raw'
import saveBookmarkSkill from '@/agent/saveBookmark/SKILL.md?raw'

export type MetadataPromptInput = {
  url: string
  title?: string
  desc?: string
  forceNetworkFallback?: boolean
}

export type GroupPromptInfo = {
  name: string
  subGroups: { name: string }[]
  isCurrent?: boolean
}

const composeSystemPrompt = (skill: string) => `${agentEntryPrompt.trim()}\n\n${skill.trim()}`

export type AIStructuredOutput = {
  name: string
  description: string
  schema: Record<string, unknown>
}

export const METADATA_OUTPUT: AIStructuredOutput = {
  name: 'bookmark_metadata',
  description: '书签标题、简介和信息来源',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 15 },
      desc: { type: 'string', maxLength: 40 },
      source: { type: 'string', enum: ['ai', 'network'] }
    },
    required: ['title', 'desc', 'source'],
    additionalProperties: false
  }
}

export const CATEGORY_OUTPUT: AIStructuredOutput = {
  name: 'bookmark_category',
  description: '从现有分组中选择一个书签分类',
  schema: {
    type: 'object',
    properties: {
      groupName: { type: 'string' },
      subGroupName: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reason: { type: 'string', maxLength: 30 }
    },
    required: ['groupName', 'subGroupName', 'confidence', 'reason'],
    additionalProperties: false
  }
}

export const AGGRESSIVE_SAVE_OUTPUT: AIStructuredOutput = {
  name: 'organized_bookmark',
  description: '书签元信息和一个到三个现有分类位置',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 15 },
      desc: { type: 'string', maxLength: 40 },
      categories: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            groupName: { type: 'string' },
            subGroupName: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string', maxLength: 30 }
          },
          required: ['groupName', 'subGroupName', 'confidence', 'reason'],
          additionalProperties: false
        }
      }
    },
    required: ['title', 'desc', 'categories'],
    additionalProperties: false
  }
}

export const METADATA_SYSTEM_PROMPT = composeSystemPrompt(generateMetadataSkill)
export const CATEGORY_SYSTEM_PROMPT = composeSystemPrompt(categorizeBookmarkSkill)
export const AGGRESSIVE_SAVE_SYSTEM_PROMPT = composeSystemPrompt(saveBookmarkSkill)

export function buildMetadataUserPrompt(input: MetadataPromptInput): string {
  return JSON.stringify({
    url: input.url,
    pageTitle: input.title?.trim() || null,
    pageDescription: input.desc?.trim() || null,
    usedNetworkFallback: Boolean(input.forceNetworkFallback)
  })
}

export function buildCategoryUserPrompt(input: {
  url: string
  groups: GroupPromptInfo[]
  currentGroupName?: string
  concise?: boolean
}): string {
  return JSON.stringify({
    url: input.url,
    currentGroupName: input.currentGroupName?.trim() || null,
    groups: input.groups.map((group) => ({
      name: group.name,
      subGroups: group.subGroups.map((subGroup) => subGroup.name),
      isCurrent: Boolean(group.isCurrent)
    }))
  })
}

export function buildAggressiveSaveUserPrompt(input: {
  url: string
  pageTitle?: string
  pageDesc?: string
  groups: GroupPromptInfo[]
}): string {
  return JSON.stringify({
    url: input.url,
    pageTitle: input.pageTitle?.trim() || null,
    pageDescription: input.pageDesc?.trim() || null,
    groups: input.groups.map((group) => ({
      name: group.name,
      subGroups: group.subGroups.map((subGroup) => subGroup.name)
    }))
  })
}
