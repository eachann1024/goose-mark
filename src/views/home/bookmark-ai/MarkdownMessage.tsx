import { createElement, Fragment, type ReactNode } from 'react'
import { marked } from 'marked'
import { Ico } from '../icon'

type MarkdownToken = {
  type: string
  raw?: string
  text?: string
  lang?: string
  href?: string
  title?: string | null
  depth?: number
  ordered?: boolean
  start?: number | ''
  loose?: boolean
  checked?: boolean
  tokens?: MarkdownToken[]
  items?: MarkdownToken[]
  header?: Array<MarkdownToken | { tokens?: MarkdownToken[]; text?: string }>
  rows?: Array<Array<MarkdownToken | { tokens?: MarkdownToken[]; text?: string }>>
}

function safeHref(value?: string) {
  if (!value) return ''
  try {
    const url = new URL(value, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
      ? url.href
      : ''
  } catch {
    return ''
  }
}

function inlineTokens(token: MarkdownToken) {
  if (Array.isArray(token.tokens)) return token.tokens
  return [{ type: 'text', text: token.text ?? token.raw ?? '' } satisfies MarkdownToken]
}

function renderTokens(
  tokens: MarkdownToken[],
  keyPrefix: string,
  onCopyCode: (code: string) => void,
): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`
    const children = () => renderTokens(inlineTokens(token), `${key}-inline`, onCopyCode)

    switch (token.type) {
      case 'space':
        return null
      case 'text':
      case 'escape':
        return <Fragment key={key}>{token.text ?? token.raw ?? ''}</Fragment>
      case 'paragraph':
        return <p key={key}>{children()}</p>
      case 'heading': {
        const heading = `h${Math.min(6, Math.max(1, token.depth ?? 2))}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
        return createElement(heading, { key }, children())
      }
      case 'strong':
        return <strong key={key}>{children()}</strong>
      case 'em':
        return <em key={key}>{children()}</em>
      case 'del':
        return <del key={key}>{children()}</del>
      case 'br':
        return <br key={key} />
      case 'codespan':
        return <code key={key}>{token.text ?? ''}</code>
      case 'code': {
        const code = token.text ?? ''
        return (
          <div className="bookmark-ai-code" key={key}>
            <div className="bookmark-ai-code-head">
              <span>{token.lang?.trim() || '代码'}</span>
              <button type="button" onClick={() => onCopyCode(code)} aria-label="复制代码">
                <Ico name="copy" />复制
              </button>
            </div>
            <pre><code>{code}</code></pre>
          </div>
        )
      }
      case 'blockquote':
        return <blockquote key={key}>{renderTokens(token.tokens ?? [], `${key}-quote`, onCopyCode)}</blockquote>
      case 'hr':
        return <hr key={key} />
      case 'link': {
        const href = safeHref(token.href)
        return href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" title={token.title ?? undefined}>
            {children()}
          </a>
        ) : <Fragment key={key}>{children()}</Fragment>
      }
      case 'image': {
        const src = safeHref(token.href)
        return src ? <img key={key} src={src} alt={token.text || 'AI 生成的图片'} loading="lazy" /> : null
      }
      case 'list': {
        const List = token.ordered ? 'ol' : 'ul'
        const start = token.ordered && typeof token.start === 'number' ? token.start : undefined
        return (
          <List key={key} start={start}>
            {renderTokens(token.items ?? [], `${key}-items`, onCopyCode)}
          </List>
        )
      }
      case 'list_item':
        return (
          <li key={key}>
            {typeof token.checked === 'boolean' ? (
              <span className="bookmark-ai-task-mark" aria-label={token.checked ? '已完成' : '未完成'}>
                {token.checked ? <Ico name="check" /> : null}
              </span>
            ) : null}
            {renderTokens(token.tokens ?? [], `${key}-content`, onCopyCode)}
          </li>
        )
      case 'table':
        return (
          <div className="bookmark-ai-table-wrap" key={key}>
            <table>
              <thead>
                <tr>{(token.header ?? []).map((cell, cellIndex) => (
                  <th key={`${key}-h-${cellIndex}`}>
                    {renderTokens(cell.tokens ?? [{ type: 'text', text: cell.text ?? '' }], `${key}-h-${cellIndex}`, onCopyCode)}
                  </th>
                ))}</tr>
              </thead>
              <tbody>{(token.rows ?? []).map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, cellIndex) => (
                  <td key={`${key}-r-${rowIndex}-${cellIndex}`}>
                    {renderTokens(cell.tokens ?? [{ type: 'text', text: cell.text ?? '' }], `${key}-r-${rowIndex}-${cellIndex}`, onCopyCode)}
                  </td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )
      case 'html':
        // 模型输出的 HTML 永远按纯文本展示，禁止注入 DOM。
        return <pre className="bookmark-ai-raw-html" key={key}>{token.raw ?? token.text ?? ''}</pre>
      default:
        return <Fragment key={key}>{children()}</Fragment>
    }
  })
}

export function MarkdownMessage({ content, onCopyCode }: { content: string; onCopyCode: (code: string) => void }) {
  const tokens = marked.lexer(content, { gfm: true, breaks: true }) as MarkdownToken[]
  return <div className="bookmark-ai-markdown">{renderTokens(tokens, 'md', onCopyCode)}</div>
}
