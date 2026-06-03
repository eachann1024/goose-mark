import type { Bookmark, Group, SubGroup } from '@/types/bookmark'

export const TRASH_GROUP_ID = 'g-trash'

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

// 从 URL 中解析参数（保留用于其他用途）
export const parseUrlParams = (input: string): Record<string, string> => {
  if (!input) return {}
  try {
    const url = new URL(input)
    const params: Record<string, string> = {}
    for (const [key, value] of url.searchParams) {
      params[key] = value
    }
    return params
  } catch {
    return {}
  }
}

export const createSeedGroups = (): Group[] => {
  const now = Date.now()
  return [
    {
      id: 'g-nav',
      name: '导航',
      createdAt: now,
      updatedAt: now,
      children: [
        { id: 'sg-nav-common', name: '常用网站', bookmarkIds: [], createdAt: now, updatedAt: now },
        { id: 'sg-nav-tools', name: '实用工具', bookmarkIds: [], createdAt: now, updatedAt: now }
      ]
    },
    {
      id: 'g-ai',
      name: 'AI 工具',
      createdAt: now,
      updatedAt: now,
      children: [
        { id: 'sg-ai-chat', name: '对话 AI', bookmarkIds: [], createdAt: now, updatedAt: now },
        { id: 'sg-ai-create', name: '创作 AI', bookmarkIds: [], createdAt: now, updatedAt: now }
      ]
    },
    {
      id: TRASH_GROUP_ID,
      name: '回收站',
      createdAt: now,
      updatedAt: now,
      children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [], createdAt: now, updatedAt: now }]
    }
  ]
}

export interface BookmarkSeed {
  groups: Group[]
  bookmarks: Bookmark[]
}

/**
 * 构造初始书签数据（首次安装时的种子数据）。
 * 数据结构与旧版 Vue/Pinia store 完全一致：二级分组（Group.children）+
 * 书签 locations 多归属 + 回收站分组（TRASH_GROUP_ID）。
 */
export const createBookmarkSeed = (): BookmarkSeed => {
  const now = Date.now()
  const groups = createSeedGroups()
  const bookmarks: Bookmark[] = []

  const addSeedBookmark = (title: string, url: string, groupId: string, subGroupId: string, tags: string[] = []) => {
    const id = uid()
    bookmarks.push({
      id,
      title,
      url,
      desc: '',
      tags,
      locations: [{ groupId, subGroupId }],
      createdAt: now,
      updatedAt: now
    })
    return id
  }

  const findSub = (groupId: string, subId: string): SubGroup | undefined => {
    const g = groups.find((gr) => gr.id === groupId)
    return g?.children.find((c) => c.id === subId)
  }

  const navCommon = findSub('g-nav', 'sg-nav-common')
  if (navCommon) {
    ;[
      { t: '百度', u: 'https://www.baidu.com' },
      { t: 'Google', u: 'https://www.google.com' },
      { t: '淘宝', u: 'https://www.taobao.com' },
      { t: '京东', u: 'https://www.jd.com' },
      { t: '微信网页版', u: 'https://wx.qq.com' },
      { t: '12306', u: 'https://www.12306.cn' },
      { t: '百度网盘', u: 'https://pan.baidu.com' },
      { t: '高德地图', u: 'https://ditu.amap.com' },
      { t: '百度地图', u: 'https://map.baidu.com' },
      { t: '知乎', u: 'https://www.zhihu.com' },
      { t: 'B站', u: 'https://www.bilibili.com' },
      { t: '豆瓣', u: 'https://www.douban.com' },
      { t: '微博', u: 'https://weibo.com' }
    ].forEach((b) => navCommon.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-nav', 'sg-nav-common')))
  }

  const aiChat = findSub('g-ai', 'sg-ai-chat')
  if (aiChat) {
    ;[
      { t: 'ChatGPT', u: 'https://chatgpt.com' },
      { t: 'Claude', u: 'https://claude.ai' },
      { t: 'Google Gemini', u: 'https://gemini.google.com' },
      { t: 'Perplexity', u: 'https://www.perplexity.ai' },
      { t: 'DeepSeek', u: 'https://chat.deepseek.com' },
      { t: 'Kimi', u: 'https://www.kimi.com' },
      { t: '通义千问', u: 'https://tongyi.aliyun.com' },
      { t: '文心一言', u: 'https://yiyan.baidu.com' },
      { t: '天工 AI', u: 'https://www.tiangong.cn' },
      { t: 'Hugging Face', u: 'https://huggingface.co' }
    ].forEach((b) => aiChat.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-ai', 'sg-ai-chat', ['AI'])))
  }

  const aiCreate = findSub('g-ai', 'sg-ai-create')
  if (aiCreate) {
    ;[
      { t: 'Midjourney', u: 'https://www.midjourney.com' },
      { t: 'Stable Diffusion', u: 'https://stability.ai' },
      { t: 'DALL-E', u: 'https://openai.com/dall-e-3' },
      { t: 'Runway', u: 'https://runwayml.com' },
      { t: 'Sora', u: 'https://openai.com/sora' },
      { t: 'Gamma', u: 'https://gamma.app' },
      { t: 'Poe', u: 'https://poe.com' },
      { t: 'Cursor', u: 'https://cursor.sh' },
      { t: 'GitHub Copilot', u: 'https://github.com/features/copilot' },
      { t: 'Notion AI', u: 'https://www.notion.so/product/ai' }
    ].forEach((b) => aiCreate.bookmarkIds.push(addSeedBookmark(b.t, b.u, 'g-ai', 'sg-ai-create', ['AI', '创作'])))
  }

  return { groups, bookmarks }
}
