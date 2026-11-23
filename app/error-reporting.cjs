'use strict'

const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { URL } = require('url')

const PROJECT_NAME = 'goose-marks'
const CONFIG_SEGMENTS = ['.config', 'goose', 'error-reporting.json']
const REQUEST_TIMEOUT_MS = 10_000

const headerValue = (value) => {
  if (Array.isArray(value)) return value[0]
  return typeof value === 'string' ? value : undefined
}

const resolveErrorReportingConfigPath = (homeDir = os.homedir()) =>
  path.join(homeDir, ...CONFIG_SEGMENTS)

const parseErrorReportingConfig = (raw, projectName = PROJECT_NAME) => {
  if (raw == null || raw === '') return { enabled: false }

  let parsed
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return { enabled: false }
  }

  if (!parsed || typeof parsed !== 'object') return { enabled: false }

  const project = parsed.projects?.[projectName]
  // 形状 A：顶层 enabled + projects[id] = string DSN
  if (typeof project === 'string') {
    const dsn = project.trim()
    if (parsed.enabled === true && dsn) return { enabled: true, dsn }
    return { enabled: false }
  }
  // 形状 B：projects[id] = { enabled, dsn }
  if (!project || typeof project !== 'object' || project.enabled !== true) {
    return { enabled: false }
  }

  const dsn = typeof project.dsn === 'string' ? project.dsn.trim() : ''
  if (!dsn) return { enabled: false }
  return { enabled: true, dsn }
}

const readErrorReportingConfig = (homeDir = os.homedir()) => {
  try {
    const configPath = resolveErrorReportingConfigPath(homeDir)
    if (!fs.existsSync(configPath)) return { enabled: false }
    return parseErrorReportingConfig(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return { enabled: false }
  }
}

const MAX_ENVELOPE_BYTES = 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Set([
  'application/x-sentry-envelope',
  'text/plain;charset=utf-8',
])

const parseSentryDsn = (dsn) => {
  if (typeof dsn !== 'string' || !dsn.trim()) return null
  let parsed
  try {
    parsed = new URL(dsn.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const publicKey = parsed.username ? decodeURIComponent(parsed.username) : ''
  if (!publicKey) return null

  const cleanPath = parsed.pathname.replace(/\/+$/, '')
  const lastSlash = cleanPath.lastIndexOf('/')
  if (lastSlash < 0) return null
  const projectId = cleanPath.slice(lastSlash + 1)
  if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) return null
  const pathPrefix = cleanPath.slice(0, lastSlash)

  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    envelopePath: `${pathPrefix}/api/${projectId}/envelope/`,
    authHeader: `Sentry sentry_version=7, sentry_key=${publicKey}`,
  }
}

const normalizeEnvelopeBody = (body) => {
  if (body == null) return null
  if (Buffer.isBuffer(body)) return body
  if (typeof body === 'string') return Buffer.from(body, 'utf8')
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  return null
}

const sendErrorReportHttp = (request = {}, homeDir = os.homedir()) => {
  const config = readErrorReportingConfig(homeDir)
  if (!config.enabled || !config.dsn) {
    return Promise.resolve({ statusCode: 200, headers: {} })
  }

  const target = parseSentryDsn(config.dsn)
  if (!target) {
    return Promise.reject(new Error('invalid error reporting dsn'))
  }

  const payload = normalizeEnvelopeBody(request?.body)
  if (!payload || payload.length === 0) {
    return Promise.reject(new Error('error report body must not be empty'))
  }
  if (payload.length > MAX_ENVELOPE_BYTES) {
    return Promise.reject(new Error('error report body exceeds size limit'))
  }

  const rawContentType = typeof request?.contentType === 'string' ? request.contentType.trim() : ''
  const contentType = ALLOWED_CONTENT_TYPES.has(rawContentType)
    ? rawContentType
    : 'application/x-sentry-envelope'

  return new Promise((resolve, reject) => {
    const lib = target.protocol === 'https:' ? https : http
    const requestHeaders = {
      'Content-Type': contentType,
      'X-Sentry-Auth': target.authHeader,
      'Content-Length': String(payload.length),
    }

    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.envelopePath,
        method: 'POST',
        headers: requestHeaders,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: {
              'x-sentry-rate-limits': headerValue(res.headers['x-sentry-rate-limits']),
              'retry-after': headerValue(res.headers['retry-after']),
            },
          })
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new Error('error report request timed out'))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

const installGooseErrorReport = (target) => {
  if (!target || typeof target !== 'object') return
  target.gooseErrorReport = {
    getConfig: () => readErrorReportingConfig(),
    send: (request) => sendErrorReportHttp(request),
  }
}

module.exports = {
  PROJECT_NAME,
  CONFIG_SEGMENTS,
  resolveErrorReportingConfigPath,
  parseErrorReportingConfig,
  parseSentryDsn,
  readErrorReportingConfig,
  sendErrorReportHttp,
  installGooseErrorReport,
}
