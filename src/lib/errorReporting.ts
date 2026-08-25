import * as Sentry from '@sentry/browser'
import { createTransport } from '@sentry/browser'

type TransportFactory = NonNullable<Sentry.BrowserOptions['transport']>
type Transport = ReturnType<TransportFactory>
type BaseTransportOptions = Parameters<TransportFactory>[0]

export const ERROR_REPORT_PROJECT = 'goose-marks'
export const ERROR_REPORT_FLUSH_MS = 2000

export type ErrorReportHttpRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  body: string | Uint8Array
}

export type ErrorReportHttpResponse = {
  statusCode: number
  headers?: Record<string, string | undefined>
}

export type ErrorReportBridge = {
  getConfig: () => { enabled: boolean; dsn?: string }
  send: (request: ErrorReportHttpRequest) => Promise<ErrorReportHttpResponse>
}

export type FlushQueue<T> = {
  enqueue: (item: T) => void
  flush: () => Promise<void>
  size: () => number
}

export const createFlushQueue = <T>(
  flushMs: number,
  send: (items: T[]) => Promise<void>
): FlushQueue<T> => {
  const items: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Promise<void> = Promise.resolve()

  const runFlush = async () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    if (items.length === 0) return
    const batch = items.splice(0, items.length)
    await send(batch)
  }

  const schedule = () => {
    if (timer != null) return
    timer = setTimeout(() => {
      timer = null
      pending = pending.then(runFlush, runFlush)
    }, flushMs)
  }

  return {
    enqueue: (item) => {
      items.push(item)
      schedule()
    },
    flush: () => {
      pending = pending.then(runFlush, runFlush)
      return pending
    },
    size: () => items.length,
  }
}

type QueuedRequest = {
  url: string
  headers?: Record<string, string>
  body: string | Uint8Array
  resolve: (response: {
    statusCode?: number
    headers?: {
      'x-sentry-rate-limits': string | null
      'retry-after': string | null
    }
  }) => void
  reject: (error: unknown) => void
}

export const makeQueuedNodeTransport = (
  send: ErrorReportBridge['send'],
  flushMs = ERROR_REPORT_FLUSH_MS
) => {
  return (options: BaseTransportOptions): Transport => {
    const queue = createFlushQueue<QueuedRequest>(flushMs, async (batch) => {
      await Promise.all(batch.map(async (item) => {
        try {
          const response = await send({
            url: item.url,
            method: 'POST',
            headers: item.headers,
            body: item.body,
          })
          item.resolve({
            statusCode: response.statusCode,
            headers: {
              'x-sentry-rate-limits': response.headers?.['x-sentry-rate-limits'] ?? null,
              'retry-after': response.headers?.['retry-after'] ?? null,
            },
          })
        } catch (error) {
          item.reject(error)
        }
      }))
    })

    const transport = createTransport(options, (request) => {
      return new Promise((resolve, reject) => {
        queue.enqueue({
          url: options.url,
          headers: options.headers,
          body: request.body,
          resolve,
          reject,
        })
      })
    })

    const originalFlush = transport.flush.bind(transport)
    transport.flush = async (timeout) => {
      await queue.flush()
      return originalFlush(timeout)
    }

    return transport
  }
}

export const readRendererErrorReportConfig = () => {
  const bridge = typeof window === 'undefined' ? undefined : window.gooseErrorReport
  if (!bridge) return { enabled: false as const }
  try {
    const config = bridge.getConfig()
    if (!config?.enabled || !config.dsn) return { enabled: false as const }
    return { enabled: true as const, dsn: config.dsn }
  } catch {
    return { enabled: false as const }
  }
}

export const initErrorReporting = () => {
  try {
    const config = readRendererErrorReportConfig()
    if (!config.enabled) return false

    const bridge = window.gooseErrorReport
    if (!bridge) return false

    const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

    Sentry.init({
      dsn: config.dsn,
      release: `${ERROR_REPORT_PROJECT}@${version}`,
      environment: window.utools ? 'utools' : 'standalone',
      sendDefaultPii: false,
      transport: makeQueuedNodeTransport(bridge.send),
      initialScope: {
        tags: { project: ERROR_REPORT_PROJECT },
      },
    })
    return true
  } catch {
    return false
  }
}
