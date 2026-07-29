import { expect, test } from '@playwright/test'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import type {
  BookmarkAgentChangeProposal,
  executeBookmarkAgentProposal as ExecuteBookmarkAgentProposal,
  prepareBookmarkAgentProposalJournal as PrepareBookmarkAgentProposalJournal,
} from '../../src/services/bookmarkAgent'
import type { useBookmarkStore as UseBookmarkStore } from '../../src/stores/bookmark'
import type { useBookmarkAiChats as UseBookmarkAiChats } from '../../src/stores/bookmarkAiChats'
import type { Bookmark, Group } from '../../src/types/bookmark'

let vite: ViteDevServer
let executeBookmarkAgentProposal: typeof ExecuteBookmarkAgentProposal
let prepareBookmarkAgentProposalJournal: typeof PrepareBookmarkAgentProposalJournal
let useBookmarkStore: typeof UseBookmarkStore
let useBookmarkAiChats: typeof UseBookmarkAiChats

test.beforeAll(async () => {
  const root = path.resolve(import.meta.dirname, '../..')
  vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true },
    resolve: { alias: { '@': path.join(root, 'src') } },
    logLevel: 'silent',
  })
  const [agentModule, storeModule, chatsModule] = await Promise.all([
    vite.ssrLoadModule('/src/services/bookmarkAgent.ts') as Promise<
      typeof import('../../src/services/bookmarkAgent')
    >,
    vite.ssrLoadModule('/src/stores/bookmark.ts') as Promise<
      typeof import('../../src/stores/bookmark')
    >,
    vite.ssrLoadModule('/src/stores/bookmarkAiChats.ts') as Promise<
      typeof import('../../src/stores/bookmarkAiChats')
    >,
  ])
  executeBookmarkAgentProposal = agentModule.executeBookmarkAgentProposal
  prepareBookmarkAgentProposalJournal = agentModule.prepareBookmarkAgentProposalJournal
  useBookmarkStore = storeModule.useBookmarkStore
  useBookmarkAiChats = chatsModule.useBookmarkAiChats
})

test.afterAll(async () => {
  await vite?.close()
})

const now = 1_900_000_000_000

const groups: Group[] = [
  {
    id: 'g-safe',
    name: '安全测试',
    createdAt: now,
    updatedAt: now,
    children: [
      {
        id: 'sg-safe',
        name: '默认',
        bookmarkIds: ['b-existing'],
        createdAt: now,
        updatedAt: now,
      },
    ],
  },
]

const bookmarks: Bookmark[] = [
  {
    id: 'b-existing',
    title: '已有书签',
    url: 'https://example.com',
    desc: '',
    tags: [],
    locations: [{ groupId: 'g-safe', subGroupId: 'sg-safe' }],
    createdAt: now,
    updatedAt: now,
  },
]

function seed(readOnly = false) {
  useBookmarkStore.setState({
    groups: structuredClone(groups),
    bookmarks: structuredClone(bookmarks),
    activeGroupId: 'g-safe',
    activeSubGroupId: 'sg-safe',
    activeView: 'group',
    search: '',
    isReadOnly: readOnly,
  })
  useBookmarkAiChats.setState({ approvalJournal: {} })
}

function dataSnapshot() {
  const state = useBookmarkStore.getState()
  return JSON.stringify({
    groups: state.groups,
    bookmarks: state.bookmarks,
    activeGroupId: state.activeGroupId,
    activeSubGroupId: state.activeSubGroupId,
  })
}

function proposal(
  actions: BookmarkAgentChangeProposal['actions'],
): BookmarkAgentChangeProposal {
  return {
    id: 'proposal-safety-test',
    summary: '安全测试提案',
    details: ['测试变更'],
    destructive: false,
    actions,
  }
}

test.beforeEach(() => seed())

test('提案对象本身不会修改书签库', () => {
  const before = dataSnapshot()
  const pending = proposal([
    {
      type: 'createBookmark',
      url: 'https://new.example.com',
      title: '待确认书签',
      desc: '',
      tags: [],
      groupId: 'g-safe',
      subGroupId: 'sg-safe',
    },
  ])

  expect(pending.actions).toHaveLength(1)
  expect(dataSnapshot()).toBe(before)
})

test('生产 prepare helper 将 conversationId 持久化到审批 journal', async () => {
  const pending = proposal([{
    type: 'updateBookmark',
    bookmarkId: 'b-existing',
    title: '待确认标题',
  }])
  await prepareBookmarkAgentProposalJournal(pending, 'conversation-production')

  expect(useBookmarkAiChats.getState().getApprovalEntry(pending.id)).toMatchObject({
    proposalId: pending.id,
    conversationId: 'conversation-production',
    status: 'prepared',
  })
  expect(useBookmarkAiChats.getState().listApprovalEntries('conversation-other')).toEqual([])
})

for (const dangerousURL of [
  'file:///etc/passwd',
  'http://localhost/admin',
  'http://127.0.0.1/private',
  'http://192.168.1.10/internal',
  'http://user:password@example.com/private',
]) {
  test(`危险网址被拒绝且不产生部分写入：${dangerousURL}`, async () => {
    const before = dataSnapshot()

    await expect(
      executeBookmarkAgentProposal(
        proposal([
          {
            type: 'createBookmark',
            url: dangerousURL,
            title: '不应创建',
            desc: '',
            tags: [],
            groupId: 'g-safe',
            subGroupId: 'sg-safe',
          },
        ]),
      ),
    ).rejects.toThrow()

    expect(dataSnapshot()).toBe(before)
  })
}

test('只读书签库拒绝执行提案且保持数据不变', async () => {
  seed(true)
  const before = dataSnapshot()

  await expect(
    executeBookmarkAgentProposal(
      proposal([
        {
          type: 'updateBookmark',
          bookmarkId: 'b-existing',
          title: '不应改名',
        },
      ]),
    ),
  ).rejects.toThrow('当前书签库为只读')

  expect(dataSnapshot()).toBe(before)
  expect(useBookmarkStore.getState().isReadOnly).toBe(true)
})

test('批量提案预校验失败时不会先执行前面的合法操作', async () => {
  const before = dataSnapshot()

  await expect(
    executeBookmarkAgentProposal(
      proposal([
        {
          type: 'updateBookmark',
          bookmarkId: 'b-existing',
          title: '不应提前改名',
        },
        {
          type: 'createBookmark',
          url: 'http://127.0.0.1/private',
          title: '非法地址',
          desc: '',
          tags: [],
          groupId: 'g-safe',
          subGroupId: 'sg-safe',
        },
      ]),
    ),
  ).rejects.toThrow('不能读取本机或内网地址')

  expect(dataSnapshot()).toBe(before)
})
