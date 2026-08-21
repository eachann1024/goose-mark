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

const sendErrorReportHttp = ({ url, method = 'POST', headers = {}, body = '' }) =>
  new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch (error) {
      reject(error)
      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error('error report url must be http(s)'))
      return
    }

    const lib = parsed.protocol === 'https:' ? https : http
    const payload = body == null
      ? Buffer.alloc(0)
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(body)

    const requestHeaders = { ...headers }
    if (requestHeaders['Content-Length'] == null && requestHeaders['content-length'] == null) {
      requestHeaders['Content-Length'] = String(payload.length)
    }

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
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
  readErrorReportingConfig,
  sendErrorReportHttp,
  installGooseErrorReport,
}
