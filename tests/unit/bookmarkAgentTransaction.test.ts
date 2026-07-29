import { beforeEach, describe, expect, test } from 'bun:test'
import { useBookmarkStore } from '../../src/stores/bookmark'
import {
  bookmarkApprovalJournalPort,
  BOOKMARK_AI_CHATS_SCHEMA_VERSION,
  createEmptyBookmarkAiChatsState,
  migrateBookmarkAiChatsState,
  useBookmarkAiChats
} from '../../src/stores/bookmarkAiChats'
import {
  executeBookmarkApprovalProposal,
  preflightBookmarkApprovalProposal,
  prepareBookmarkApprovalProposal,
  undoBookmarkApprovalProposal
} from '../../src/services/bookmarkAgent/transaction'
import {
  bookmarkTransactionAdapter,
  createBookmarkTransactionOperations,
  type BookmarkMutationAction
} from '../../src/services/bookmarkAgent/transaction/storeAdapter'

const now = 1_900_000_000_000
let sequence = 0

function proposalId(label: string) {
  sequence += 1
  return `transaction-${label}-${sequence}`
}

function seed() {
  useBookmarkStore.setState({
    groups: [
      {
        id: 'g-test',
        name: '测试',
        createdAt: now,
        updatedAt: now,
        children: [
          {
            id: 'sg-test',
            name: '默认',
            bookmarkIds: ['b-test'],
            createdAt: now,
            updatedAt: now
          }
        ]
      }
    ],
    bookmarks: [
      {
        id: 'b-test',
        title: '原始标题',
        url: 'https://example.com',
        desc: '',
        tags: [],
        locations: [{ groupId: 'g-test', subGroupId: 'sg-test' }],
        createdAt: now,
        updatedAt: now
      }
    ],
    activeGroupId: 'g-test',
    activeSubGroupId: 'sg-test',
    activeView: 'group',
    search: '',
    isReadOnly: false
  })
  useBookmarkAiChats.setState(createEmptyBookmarkAiChatsState())
}

async function prepare(label: string, actions: BookmarkMutationAction[]) {
  const id = proposalId(label)
  await prepareBookmarkApprovalProposal({
    proposalId: id,
    summary: label,
    operations: createBookmarkTransactionOperations(id, actions)
  }, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
  return id
}

beforeEach(seed)

describe('bookmark Agent 精确事务', () => {
  test('执行幂等且撤回只恢复受影响书签', async () => {
    const id = await prepare('update', [{
      type: 'updateBookmark',
      bookmarkId: 'b-test',
      title: '事务标题'
    }])

    const first = await executeBookmarkApprovalProposal(
      id,
      bookmarkApprovalJournalPort,
      bookmarkTransactionAdapter
    )
    const second = await executeBookmarkApprovalProposal(
      id,
      bookmarkApprovalJournalPort,
      bookmarkTransactionAdapter
    )

    expect(useBookmarkStore.getState().bookmarks[0].title).toBe('事务标题')
    expect(first.execution?.records).toHaveLength(1)
    expect(second.execution?.records).toHaveLength(1)

    await undoBookmarkApprovalProposal(id, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    expect(useBookmarkStore.getState().bookmarks[0].title).toBe('原始标题')
    expect(bookmarkApprovalJournalPort.get(id)?.status).toBe('undone')
  })

  test('执行后实体被外部修改时拒绝撤回', async () => {
    const id = await prepare('conflict', [{
      type: 'updateBookmark',
      bookmarkId: 'b-test',
      title: '事务标题'
    }])
    await executeBookmarkApprovalProposal(id, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    useBookmarkStore.getState().updateBookmark('b-test', { title: '用户后续修改' })

    await expect(
      undoBookmarkApprovalProposal(id, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    ).rejects.toThrow('拒绝撤回')
    expect(useBookmarkStore.getState().bookmarks[0].title).toBe('用户后续修改')
  })

  test('创建操作使用稳定实体 id，重复执行不会新增第二份', async () => {
    const id = await prepare('create', [{
      type: 'createBookmark',
      url: 'https://new.example.com',
      title: '新书签',
      desc: '',
      tags: [],
      groupId: 'g-test',
      subGroupId: 'sg-test'
    }])

    await executeBookmarkApprovalProposal(id, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    await executeBookmarkApprovalProposal(id, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    expect(useBookmarkStore.getState().bookmarks.filter((item) => item.title === '新书签')).toHaveLength(1)

    await undoBookmarkApprovalProposal(id, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    expect(useBookmarkStore.getState().bookmarks.filter((item) => item.title === '新书签')).toHaveLength(0)
  })

  test('conversation journal 可重建筛选，completed 重新预检后精确撤回且会话不串', async () => {
    const conversationA = 'conversation-a'
    const conversationB = 'conversation-b'
    const proposalA = proposalId('rehydrate-a')
    const proposalB = proposalId('rehydrate-b')
    const operationsA = createBookmarkTransactionOperations(proposalA, [{
      type: 'updateBookmark',
      bookmarkId: 'b-test',
      title: '会话 A 修改'
    }])
    const operationsB = createBookmarkTransactionOperations(proposalB, [{
      type: 'renameGroup',
      groupId: 'g-test',
      name: '会话 B 分组'
    }])
    await prepareBookmarkApprovalProposal({
      proposalId: proposalA,
      conversationId: conversationA,
      summary: '会话 A',
      operations: operationsA
    }, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    await prepareBookmarkApprovalProposal({
      proposalId: proposalB,
      conversationId: conversationB,
      summary: '会话 B',
      operations: operationsB
    }, bookmarkApprovalJournalPort, bookmarkTransactionAdapter)
    await executeBookmarkApprovalProposal(
      proposalA,
      bookmarkApprovalJournalPort,
      bookmarkTransactionAdapter
    )
    expect(bookmarkApprovalJournalPort.get(proposalA)).toMatchObject({
      conversationId: conversationA,
      status: 'completed',
      undo: { available: true }
    })

    const liveState = useBookmarkAiChats.getState()
    const rehydrated = migrateBookmarkAiChatsState({
      schemaVersion: BOOKMARK_AI_CHATS_SCHEMA_VERSION,
      currentConversationId: null,
      conversations: {},
      composerDraft: '',
      approvalJournal: structuredClone(liveState.approvalJournal),
      updatedAt: liveState.updatedAt
    }, BOOKMARK_AI_CHATS_SCHEMA_VERSION, { now: Date.now() })
    useBookmarkAiChats.setState(rehydrated)

    expect(useBookmarkAiChats.getState().listApprovalEntries(conversationA).map((item) => item.proposalId))
      .toEqual([proposalA])
    expect(useBookmarkAiChats.getState().listApprovalEntries(conversationB).map((item) => item.proposalId))
      .toEqual([proposalB])
    expect(bookmarkApprovalJournalPort.get(proposalA)?.validation.state).toBe('required')

    const preflight = await preflightBookmarkApprovalProposal(
      proposalA,
      bookmarkApprovalJournalPort,
      bookmarkTransactionAdapter
    )
    expect(preflight.ok).toBe(true)
    await undoBookmarkApprovalProposal(
      proposalA,
      bookmarkApprovalJournalPort,
      bookmarkTransactionAdapter
    )
    expect(useBookmarkStore.getState().bookmarks[0].title).toBe('原始标题')
    expect(bookmarkApprovalJournalPort.get(proposalA)?.status).toBe('undone')
    expect(bookmarkApprovalJournalPort.get(proposalB)?.status).toBe('prepared')
  })
})
