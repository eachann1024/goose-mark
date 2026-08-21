import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ERROR_REPORT_FLUSH_MS,
  ERROR_REPORT_PROJECT,
  createFlushQueue,
  makeQueuedNodeTransport,
  readRendererErrorReportConfig,
} from '../../src/lib/errorReporting'

const require = createRequire(import.meta.url)
const {
  PROJECT_NAME,
  parseErrorReportingConfig,
  readErrorReportingConfig,
  sendErrorReportHttp,
  installGooseErrorReport,
  resolveErrorReportingConfigPath,
}: {
  PROJECT_NAME: string
  parseErrorReportingConfig: (raw: unknown, projectName?: string) => { enabled: boolean; dsn?: string }
  readErrorReportingConfig: (homeDir?: string) => { enabled: boolean; dsn?: string }
  sendErrorReportHttp: (request: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string | Uint8Array
  }) => Promise<{ statusCode: number; headers?: Record<string, string | undefined> }>
  installGooseErrorReport: (target: Record<string, unknown>) => void
  resolveErrorReportingConfigPath: (homeDir?: string) => string
} = require('../../preload/error-reporting.cjs')

const FAKE_DSN = 'https://public@example.test/1'

const listen = (onRequest: (req: IncomingMessage, body: string, res: { writeHead: Function; end: Function }) => void) =>
  new Promise<{ server: Server; url: string }>((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => {
        onRequest(req, Buffer.concat(chunks).toString('utf8'), res)
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('listen failed')
      resolve({ server, url: `http://127.0.0.1:${address.port}/envelope` })
    })
  })

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('error reporting config', () => {
  test('项目名必须是 goose-marks', () => {
    expect(PROJECT_NAME).toBe('goose-marks')
    expect(ERROR_REPORT_PROJECT).toBe('goose-marks')
    expect(PROJECT_NAME).toBe(ERROR_REPORT_PROJECT)
  })

  test('配置路径只读 ~/.config/goose/error-reporting.json', () => {
    expect(resolveErrorReportingConfigPath('/Users/demo')).toBe(
      '/Users/demo/.config/goose/error-reporting.json'
    )
  })

  test('没文件则完全关闭', () => {
    const home = mkdtempSync(join(tmpdir(), 'goose-marks-error-report-'))
    expect(readErrorReportingConfig(home)).toEqual({ enabled: false })
  })

  test('enabled false 即使有 dsn 也完全关闭', () => {
    expect(parseErrorReportingConfig(JSON.stringify({
      projects: {
        'goose-marks': { enabled: false, dsn: FAKE_DSN },
      },
    }))).toEqual({ enabled: false })
  })

  test('缺少 projects.goose-marks 则关闭', () => {
    expect(parseErrorReportingConfig(JSON.stringify({
      projects: {
        'goose-note': { enabled: true, dsn: FAKE_DSN },
      },
    }))).toEqual({ enabled: false })
  })

  test('enabled true 且有 dsn 才开启', () => {
    const home = mkdtempSync(join(tmpdir(), 'goose-marks-error-report-'))
    mkdirSync(join(home, '.config', 'goose'), { recursive: true })
    writeFileSync(join(home, '.config', 'goose', 'error-reporting.json'), JSON.stringify({
      projects: {
        'goose-marks': { enabled: true, dsn: `  ${FAKE_DSN}  ` },
      },
    }))
    expect(readErrorReportingConfig(home)).toEqual({ enabled: true, dsn: FAKE_DSN })
  })

  test('非法 JSON 关闭', () => {
    expect(parseErrorReportingConfig('{')).toEqual({ enabled: false })
  })

  test('兼容顶层 enabled + 字符串 DSN', () => {
    expect(parseErrorReportingConfig(JSON.stringify({
      enabled: true,
      projects: {
        'goose-marks': `  ${FAKE_DSN}  `,
      },
    }))).toEqual({ enabled: true, dsn: FAKE_DSN })
  })

  test('顶层 enabled false 即使有字符串 DSN 也关闭', () => {
    expect(parseErrorReportingConfig(JSON.stringify({
      enabled: false,
      projects: {
        'goose-marks': FAKE_DSN,
      },
    }))).toEqual({ enabled: false })
  })
})

describe('queued transport', () => {
  test('flush 间隔是 2 秒', () => {
    expect(ERROR_REPORT_FLUSH_MS).toBe(2000)
  })

  test('入队后不会立刻发送，flush 才发出', async () => {
    const sent: string[][] = []
    const queue = createFlushQueue<string>(2000, async (items) => {
      sent.push([...items])
    })
    queue.enqueue('a')
    queue.enqueue('b')
    expect(queue.size()).toBe(2)
    expect(sent).toEqual([])
    await queue.flush()
    expect(sent).toEqual([['a', 'b']])
    expect(queue.size()).toBe(0)
  })

  test('自定义 transport 经 send 桥在 flush 后发出', async () => {
    const sent: Array<{ url: string; body: string }> = []
    const transport = makeQueuedNodeTransport(async (request) => {
      sent.push({
        url: request.url,
        body: typeof request.body === 'string' ? request.body : Buffer.from(request.body).toString('utf8'),
      })
      return { statusCode: 200 }
    }, 2000)({
      url: 'http://127.0.0.1/envelope',
      recordDroppedEvent: () => {},
    })

    const sending = transport.send([
      { event_id: '1' },
      [[{ type: 'event' }, { message: 'boom' }]],
    ] as never)
    expect(sent).toEqual([])
    await transport.flush(1000)
    const response = await sending
    expect(response.statusCode).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('http://127.0.0.1/envelope')
    expect(sent[0]?.body).toContain('boom')
  })
})

describe('preload node http + bridge', () => {
  test('preload 用 Node 发 HTTP', async () => {
    const received: string[] = []
    const { server, url } = await listen((_req, body, res) => {
      received.push(body)
      res.writeHead(200, { 'x-sentry-rate-limits': '60:error:key' })
      res.end('ok')
    })
    try {
      const response = await sendErrorReportHttp({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: 'envelope-body',
      })
      expect(response.statusCode).toBe(200)
      expect(response.headers?.['x-sentry-rate-limits']).toBe('60:error:key')
      expect(received).toEqual(['envelope-body'])
    } finally {
      server.close()
    }
  })

  test('没有 bridge 时渲染层完全关闭', () => {
    ;(globalThis as { window?: { gooseErrorReport?: unknown } }).window = {}
    expect(readRendererErrorReportConfig()).toEqual({ enabled: false })
  })

  test('bridge 可安装且只读配置', () => {
    const target: Record<string, unknown> = {}
    installGooseErrorReport(target)
    const bridge = target.gooseErrorReport as { getConfig: () => { enabled: boolean; dsn?: string } }
    expect(typeof bridge.getConfig).toBe('function')
    const config = bridge.getConfig()
    expect(typeof config.enabled).toBe('boolean')
    if (config.enabled) expect(typeof config.dsn).toBe('string')
  })
})
