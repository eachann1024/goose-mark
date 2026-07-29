import { expect, test } from '@playwright/test'
import {
  buildBookmarkAiComposerPayload,
  getBookmarkAiReferenceSuggestions,
  normalizeBookmarkAiSkillCommand,
  parseBookmarkAiLocalSkills,
  validateBookmarkAiReferences,
  type BookmarkAiLibrarySnapshot,
  type BookmarkAiReference
} from '../../src/lib/bookmarkAiContext'
import type { Bookmark, Group } from '../../src/types/bookmark'
import { TRASH_GROUP_ID } from '../../src/stores/bookmarkSeed'

const now = 1
const groups: Group[] = [
  {
    id: 'group-dev',
    name: '开发资料',
    createdAt: now,
    updatedAt: now,
    children: [
      { id: 'sub-frontend', name: '前端工具', bookmarkIds: ['bookmark-vue'], createdAt: now, updatedAt: now }
    ]
  },
  {
    id: TRASH_GROUP_ID,
    name: '回收站',
    createdAt: now,
    updatedAt: now,
    children: [
      { id: 'trash-sub', name: '已删除', bookmarkIds: ['bookmark-trash'], createdAt: now, updatedAt: now }
    ]
  }
]

const bookmarks: Bookmark[] = [
  {
    id: 'bookmark-vue',
    title: '前端开发文档',
    url: 'https://example.com/vue',
    desc: 'Vue 组件参考',
    tags: ['框架'],
    locations: [{ groupId: 'group-dev', subGroupId: 'sub-frontend' }],
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'bookmark-trash',
    title: '前端旧文档',
    url: 'https://example.com/old',
    tags: [],
    locations: [{ groupId: TRASH_GROUP_ID, subGroupId: 'trash-sub' }],
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'bookmark-deleted',
    title: '数据中台',
    url: 'https://example.com/data',
    tags: [],
    isDeleted: true,
    createdAt: now,
    updatedAt: now
  }
]

const snapshot: BookmarkAiLibrarySnapshot = {
  bookmarks,
  groups,
  activeGroupId: 'group-dev',
  activeSubGroupId: 'sub-frontend'
}

test('@ 候选支持拼音并排除回收站和已删除资源', () => {
  const items = getBookmarkAiReferenceSuggestions('qd', snapshot)
  expect(items.some((item) => item.id === 'bookmark-vue')).toBe(true)
  expect(items.some((item) => item.id === 'bookmark-trash')).toBe(false)
  expect(items.some((item) => item.id === 'bookmark-deleted')).toBe(false)
  expect(items.some((item) => item.id === 'group-dev')).toBe(true)
  expect(items.some((item) => item.id === 'sub-frontend')).toBe(true)
})

test('@ 候选稳定排序且最多返回 30 项', () => {
  const many: Bookmark[] = Array.from({ length: 40 }, (_, index) => ({
    id: `bookmark-${index}`,
    title: `文档 ${index}`,
    url: `https://example.com/${index}`,
    tags: [],
    createdAt: now,
    updatedAt: now
  }))
  const items = getBookmarkAiReferenceSuggestions('', { ...snapshot, bookmarks: many })
  expect(items).toHaveLength(30)
  expect(new Set(items.map((item) => `${item.kind}:${item.id}`)).size).toBe(30)
})

test('结构化 payload 保序、引用去重并解析内置 Skill', () => {
  const reference: BookmarkAiReference = {
    kind: 'bookmark',
    id: 'bookmark-vue',
    titleSnapshot: '前端开发文档',
    descriptionSnapshot: 'Vue 组件参考'
  }
  const payload = buildBookmarkAiComposerPayload([
    { type: 'text', text: '/search-bookmarks 请参考 ' },
    { type: 'reference', reference },
    { type: 'text', text: ' 和 ' },
    { type: 'reference', reference }
  ], [{ source: 'builtin', id: 'searchBookmarks', command: 'search-bookmarks', name: '搜索书签', description: '' }])
  expect(payload.promptText).toBe('/search-bookmarks 请参考 @前端开发文档 和 @前端开发文档')
  expect(payload.freeformText).toBe('/search-bookmarks 请参考  和')
  expect(payload.references).toEqual([reference])
  expect(payload.invokedSkill?.id).toBe('searchBookmarks')
})

test('缺失、删除和回收站引用不会被静默视为有效', () => {
  const references: BookmarkAiReference[] = [
    { kind: 'bookmark', id: 'bookmark-vue', titleSnapshot: '有效', descriptionSnapshot: '' },
    { kind: 'bookmark', id: 'bookmark-trash', titleSnapshot: '回收站', descriptionSnapshot: '' },
    { kind: 'bookmark', id: 'missing', titleSnapshot: '缺失', descriptionSnapshot: '' }
  ]
  const result = validateBookmarkAiReferences(references, snapshot)
  expect(result.valid.map((item) => item.id)).toEqual(['bookmark-vue'])
  expect(result.invalid.map((item) => item.reason)).toEqual(['trashed', 'missing'])
})

test('本地 Skill 规范化、保留首项并避让内置命令', () => {
  expect(normalizeBookmarkAiSkillCommand(' My_Skill ')).toBe('my-skill')
  expect(normalizeBookmarkAiSkillCommand('中文技能')).toBe('')
  const skills = parseBookmarkAiLocalSkills({
    status: 'ready',
    skills: [
      { path: '/home/me/.agents/skills/one/SKILL.md', content: '---\nname: my_skill\ndescription: 第一个\n---\n正文' },
      { path: '/home/me/.agents/skills/two/SKILL.md', content: '---\nname: my-skill\ndescription: 重复\n---\n正文' },
      { path: '/home/me/.agents/skills/chat/SKILL.md', content: '---\nname: chat\n---\n覆盖内置' }
    ]
  })
  expect(skills).toHaveLength(1)
  expect(skills[0]).toMatchObject({ command: 'my-skill', description: '第一个' })
})
