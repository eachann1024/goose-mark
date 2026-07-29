import { describe, expect, test } from 'bun:test'
import {
  allocateFairBookmarkAiTextItems,
  budgetBookmarkAiInput,
  createBookmarkAiBudgetLimits,
  extractBookmarkAiEntityIds,
  selectRecentBookmarkAiHistory,
  truncateBookmarkAiText
} from '../../src/lib/bookmarkAiBudget'

describe('bookmark AI character budget', () => {
  test('rejects partitions that exceed the total budget', () => {
    expect(() => createBookmarkAiBudgetLimits({ totalCharacters: 10 })).toThrow(
      '分区总和不能超过'
    )
  })

  test('fairly allocates context so the first long item cannot starve later items', () => {
    const result = allocateFairBookmarkAiTextItems([
      { id: 'first', content: '甲'.repeat(100) },
      { id: 'second', content: '乙'.repeat(100) },
      { id: 'third', content: '丙'.repeat(100) }
    ], 35, '|')

    expect(result.text.length).toBeLessThanOrEqual(35)
    expect(result.items.every((item) => item.allocatedCharacters > 0)).toBe(true)
    expect(Math.max(...result.items.map((item) => item.allocatedCharacters))
      - Math.min(...result.items.map((item) => item.allocatedCharacters))).toBeLessThanOrEqual(1)
  })

  test('redistributes unused shares from short items', () => {
    const result = allocateFairBookmarkAiTextItems([
      { id: 'short', content: '短' },
      { id: 'long', content: '长'.repeat(100) }
    ], 20, '|')

    expect(result.items[0].content).toBe('短')
    expect(result.items[1].allocatedCharacters).toBeGreaterThan(10)
    expect(result.text.length).toBe(20)
  })

  test('preserves the latest user instruction and recent entity ids', () => {
    const history = selectRecentBookmarkAiHistory([
      { role: 'user', content: '很早以前的问题' },
      { role: 'assistant', content: '旧回答'.repeat(30) },
      { role: 'tool', content: '{"bookmarkId":"bookmark-92831","title":"目标"}' },
      { role: 'user', content: `请修改 bookmarkId: bookmark-92831，并保留这个明确指令${'。'.repeat(80)}` },
      { role: 'assistant', content: '最近回答'.repeat(30) }
    ], 100)

    expect(history.latestUserPreserved).toBe(true)
    expect(history.messages.some((message) => message.content.includes('请修改'))).toBe(true)
    expect(history.preservedEntityIds).toContain('bookmark-92831')
    expect(history.messages.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(100)
  })

  test('extracts typed and bare entity ids and keeps them during truncation', () => {
    const text = `bookmarkId="bm-123" proposal-xyz789 ${'正文'.repeat(100)}`
    expect(extractBookmarkAiEntityIds(text)).toEqual(['bm-123', 'proposal-xyz789'])
    const truncated = truncateBookmarkAiText(text, 80)
    expect(truncated.length).toBeLessThanOrEqual(80)
    expect(truncated).toContain('bm-123')
  })

  test('budgets every partition independently and reserves output capacity', () => {
    const result = budgetBookmarkAiInput({
      system: '系'.repeat(100),
      history: [{ role: 'user', content: '问'.repeat(100) }],
      explicitContext: [{ id: 'context', content: '文'.repeat(100) }],
      toolOutput: [{ id: 'tool', content: '工'.repeat(100) }],
      limits: {
        totalCharacters: 100,
        system: 20,
        history: 20,
        explicitContext: 20,
        toolOutput: 20,
        outputReserve: 20
      }
    })

    expect(result.system.length).toBeLessThanOrEqual(20)
    expect(result.history.messages[0].content.length).toBeLessThanOrEqual(20)
    expect(result.explicitContext.usedCharacters).toBeLessThanOrEqual(20)
    expect(result.toolOutput.usedCharacters).toBeLessThanOrEqual(20)
    expect(result.outputReserveCharacters).toBe(20)
    expect(result.usedInputCharacters).toBeLessThanOrEqual(80)
  })
})
