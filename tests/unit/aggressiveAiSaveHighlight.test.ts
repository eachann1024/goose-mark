import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const homeSource = readFileSync(new URL('../../src/views/home/HomePage.tsx', import.meta.url), 'utf8')
const homeStyles = readFileSync(new URL('../../src/views/home/home.css', import.meta.url), 'utf8')

describe('AI 保存完成高亮', () => {
  test('成功卡挂载流光状态并持续 3.5 秒', () => {
    expect(homeSource).toContain('ag-save-success-card is-highlighted')
    expect(homeStyles).toContain('ag-save-success-highlight 3.5s')
    expect(homeStyles).toContain('ag-save-success-flow 1.1667s ease-in-out 3')
  })

  test('减少动态效果时关闭流光', () => {
    expect(homeStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(homeStyles).toContain('.goose-home .ag-save-success-card.is-highlighted::before { display:none; }')
  })
})
