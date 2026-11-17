window.ztools = window.ztools || window.utools
window.utools = window.utools || window.ztools
if (typeof utools === 'undefined' && window.utools) {
  globalThis.utools = window.utools
}

// preload 运行在 CJS，避免与主项目 ESM 冲突
const { fetchPublicText, fetchPublicBinary, getResolvedProxy } = require('./web-fetch.cjs')
const { installGooseErrorReport } = require('./error-reporting.cjs')
if (typeof window !== 'undefined') {
  installGooseErrorReport(window)
  if (typeof utools !== 'undefined') {
    window.utools = utools

    const SETTINGS_DOC_ID = 'gm:settings'
    const WINDOW_HEIGHT_MIRROR_KEY = 'goose-marks.window-height'
    const WINDOW_HEIGHT_STORAGE_KEY = 'settings'
    const MIN_WINDOW_HEIGHT = 600
    const MAX_WINDOW_HEIGHT = 1000
    const DEFAULT_WINDOW_HEIGHT = 800

    const clampWindowHeight = (height) => {
      const numericHeight = Number(height)
      if (!Number.isFinite(numericHeight)) return null
      return Math.min(MAX_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, Math.round(numericHeight)))
    }

    const readWindowHeightFromObject = (parsed) => {
      if (parsed == null || typeof parsed !== 'object') return null
      if ('windowHeight' in parsed) return clampWindowHeight(parsed.windowHeight)
      if (parsed?.state != null && typeof parsed.state === 'object' && parsed.state.windowHeight != null) {
        return clampWindowHeight(parsed.state.windowHeight)
      }
      if (parsed?.data != null && typeof parsed.data === 'object' && parsed.data.windowHeight != null) {
        return clampWindowHeight(parsed.data.windowHeight)
      }
      return null
    }

    const readWindowHeightFromRawJson = (rawValue) => {
      if (!rawValue) return null
      try {
        return readWindowHeightFromObject(JSON.parse(rawValue))
      } catch {
        return null
      }
    }

    // 优先读进程内 localStorage 镜像，避免 preload / onPluginEnter 同步跨进程读取 PouchDB 造成启动阻塞。
    const readFastLocalWindowHeight = () => {
      try {
        const direct = window.localStorage?.getItem?.(WINDOW_HEIGHT_MIRROR_KEY)
        if (direct != null && direct !== '') {
          const clamped = clampWindowHeight(direct)
          if (clamped != null) return clamped
        }
      } catch {}

      try {
        const legacyRaw = window.localStorage?.getItem?.(WINDOW_HEIGHT_STORAGE_KEY) ?? null
        const fromLegacy = readWindowHeightFromRawJson(legacyRaw)
        if (fromLegacy != null) return fromLegacy
      } catch {}

      return null
    }

    const applyStoredWindowHeight = () => {
      if (typeof utools.setExpendHeight !== 'function') return
      const fastHeight = readFastLocalWindowHeight()
      if (fastHeight != null) {
        utools.setExpendHeight(fastHeight)
        return
      }
      // 首次运行尚无 localStorage 镜像时：先设默认高度，再走异步 db.promises 读取并缓存，不阻塞启动。
      utools.setExpendHeight(DEFAULT_WINDOW_HEIGHT)
      const asyncGet = utools?.db?.promises?.get
      if (typeof asyncGet === 'function') {
        Promise.resolve(asyncGet(SETTINGS_DOC_ID))
          .then((doc) => {
            const fromDoc = readWindowHeightFromObject(doc)
            if (fromDoc == null) return
            try {
              window.localStorage?.setItem?.(WINDOW_HEIGHT_MIRROR_KEY, String(fromDoc))
            } catch {}
            try {
              utools.setExpendHeight(fromDoc)
            } catch {}
          })
          .catch(() => {})
      }
    }

    // Electron remote 的 BrowserWindow 代理走同步跨进程 IPC，在 macOS/Windows 窗口切换或轮询时可能阻塞甚至超时；
    // 统一走标准窗口坐标与 moveTo API。
    window.__gooseMarksWindowControl = {
      getPosition() {
        const x = Math.round(window.screenX)
        const y = Math.round(window.screenY)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        return { x, y }
      },
      setPosition(position) {
        if (!position) return false
        const x = Math.round(Number(position.x))
        const y = Math.round(Number(position.y))
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false

        try {
          if (typeof window.moveTo === 'function') {
            window.moveTo(x, y)
            return true
          }
        } catch {}
        return false
      }
    }

    // AI 网页研究桥：Node 端读取并执行 DNS/内网地址校验，避免渲染层直连任意地址。
    // 自动走系统/环境代理；Buffer 不能直接传 renderer，二进制以 base64 返回。
    window.gooseWeb = {
      fetchText: (url, options) => fetchPublicText(url, options),
      fetchBinary: async (url, options) => {
        const result = await fetchPublicBinary(url, options)
        return {
          ok: result.ok,
          url: result.url,
          status: result.status,
          contentType: result.contentType,
          base64: result.buffer ? result.buffer.toString('base64') : ''
        }
      },
      getProxy: () => getResolvedProxy()
    }

    const UTOOLS_INPUT_EVENT = 'goose-marks:utools-search'
    const UTOOLS_SYNC_EVENT = 'goose-marks:utools-search-sync'
    const UTOOLS_PLUGIN_ENTER_EVENT = 'goose-marks:plugin-enter'
    const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
    const UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT = 'goose-marks:restore-default-search-input'
    const MCP_TOOL_REQUEST_EVENT = 'goose-marks:mcp-tool-request'
    const MCP_TOOL_RESPONSE_EVENT = 'goose-marks:mcp-tool-response'
    const MCP_TOOL_READY_EVENT = 'goose-marks:mcp-tool-ready'
    const MCP_TOOL_READY_TIMEOUT_MS = 15000
    const MCP_TOOL_EXEC_TIMEOUT_MS = 30000
    const MCP_TOOL_NAMES = [
      'get_mcp_capabilities',
      'get_bookmark_tree',
      'list_groups',
      'list_bookmarks',
      'search_bookmarks',
      'get_bookmark',
      'open_bookmark',
      'create_group',
      'update_group',
      'remove_group',
      'create_sub_group',
      'update_sub_group',
      'remove_sub_group',
      'create_bookmark',
      'update_bookmark',
      'set_bookmark_locations',
      'remove_bookmark',
      'restore_bookmark',
    ]

    window.__gooseMarksSuppressNextChange = false
    window.__gooseMarksLastAppValue = ''
    window.__gooseMarksPluginEnterSerial = 0
    window.__gooseMarksLastPluginEnterSerial = 0
    window.__gooseMarksLastPluginEnterParams = null
    window.__gooseMarksPendingPluginEnterEvents = []
    window.__gooseMarksMcpReady = false

    const pendingMcpRequests = new Map()

    const buildMcpRequestId = () => `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    // plugin.json 负责声明 JSON Schema；这里再做一次边界收敛，避免任意原型、
    // 过深对象或超大参数跨 preload/renderer 事件边界。
    const normalizeToolParams = (params) => {
      const sanitize = (value, depth = 0) => {
        if (depth > 6 || value == null) return null
        if (typeof value === 'string') return value.slice(0, 10000)
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return Number.isFinite(value) ? value : null
        if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1))
        if (typeof value !== 'object') return null

        const safe = {}
        for (const [key, item] of Object.entries(value).slice(0, 100)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
          safe[key] = sanitize(item, depth + 1)
        }
        return safe
      }

      if (!params || typeof params !== 'object' || Array.isArray(params)) return {}
      return sanitize(params)
    }

    const waitForMcpBridgeReady = (timeoutMs = MCP_TOOL_READY_TIMEOUT_MS) => new Promise((resolve, reject) => {
      if (window.__gooseMarksMcpReady) {
        resolve()
        return
      }

      let settled = false

      const cleanup = () => {
        window.removeEventListener(MCP_TOOL_READY_EVENT, handleReady)
        clearTimeout(timer)
      }

      const handleReady = () => {
        if (settled) return
        settled = true
        window.__gooseMarksMcpReady = true
        cleanup()
        resolve()
      }

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('书签 MCP 桥接尚未就绪，请先打开插件页面完成初始化'))
      }, timeoutMs)

      window.addEventListener(MCP_TOOL_READY_EVENT, handleReady, { once: true })
    })

    const invokeRendererMcpTool = async (toolName, params, timeoutMs = MCP_TOOL_EXEC_TIMEOUT_MS) => {
      await waitForMcpBridgeReady()

      return new Promise((resolve, reject) => {
        const requestId = buildMcpRequestId()
        const timer = setTimeout(() => {
          pendingMcpRequests.delete(requestId)
          reject(new Error(`工具 ${toolName} 执行超时`))
        }, timeoutMs)

        pendingMcpRequests.set(requestId, { resolve, reject, timer })

        window.dispatchEvent(new CustomEvent(MCP_TOOL_REQUEST_EVENT, {
          detail: {
            requestId,
            tool: toolName,
            params: normalizeToolParams(params),
          },
        }))
      })
    }

    // 主面板与独立/分离窗统一挂 uTools 顶部 subInput（避免与页内搜索重复）。
    // 模板入口等场景仍会 removeSubInput，由 shouldUseDefaultSearchInput 之外的路径处理。
    const shouldUseDefaultSearchInput = () => true

    const removeDefaultSearchInput = () => {
      if (typeof utools.removeSubInput === 'function') {
        utools.removeSubInput()
      }
    }

    // 挂载 uTools 顶部 subInput 搜索框。
    // 用户在 subInput 输入时 dispatch UTOOLS_INPUT_EVENT 通知渲染层；
    // __gooseMarksSuppressNextChange / __gooseMarksLastAppValue 防回环。
    const mountDefaultSearchInput = (focus = true) => {
      if (!shouldUseDefaultSearchInput()) {
        removeDefaultSearchInput()
        return
      }
      if (typeof utools.setSubInput !== 'function') return
      utools.setSubInput(({ text }) => {
        if (window.__gooseMarksSuppressNextChange && text === window.__gooseMarksLastAppValue) {
          window.__gooseMarksSuppressNextChange = false
          return
        }
        window.dispatchEvent(new CustomEvent(UTOOLS_INPUT_EVENT, {
          detail: { text },
        }))
      }, '搜索书签...', focus)
    }

    const clearDefaultSearchCache = () => {
      window.__gooseMarksSuppressNextChange = false
      window.__gooseMarksLastAppValue = ''
    }

    window.addEventListener(MCP_TOOL_READY_EVENT, () => {
      window.__gooseMarksMcpReady = true
    })

    window.addEventListener(MCP_TOOL_RESPONSE_EVENT, (event) => {
      const detail = event.detail || {}
      const requestId = detail.requestId
      if (!requestId || !pendingMcpRequests.has(requestId)) return

      const pending = pendingMcpRequests.get(requestId)
      pendingMcpRequests.delete(requestId)
      clearTimeout(pending.timer)

      if (detail.ok) {
        pending.resolve(detail.result)
        return
      }

      pending.reject(new Error(detail.error || '工具执行失败'))
    })

    if (typeof utools.onPluginEnter === 'function') {
      utools.onPluginEnter((params) => {
        const nextSerial = (window.__gooseMarksPluginEnterSerial || 0) + 1
        const entry = {
          serial: nextSerial,
          params: params || {},
        }
        window.__gooseMarksPluginEnterSerial = nextSerial
        window.__gooseMarksLastPluginEnterSerial = nextSerial
        window.__gooseMarksLastPluginEnterParams = entry.params
        window.__gooseMarksPendingPluginEnterEvents = [
          ...(window.__gooseMarksPendingPluginEnterEvents || []),
          entry,
        ].slice(-8)
        // 模板书签入口（前缀与 src/hooks/useUTools.ts 的 FEATURE_PREFIX 保持一致）：
        // 渲染层首屏直接挂载模板输入页（仅 logo + 输入框），这里不挂 subInput
        // （避免抢占页内输入框焦点）。窗口高度始终用用户设置，不按页面临时改。
        if (entry.params && typeof entry.params.code === 'string' && entry.params.code.startsWith('bm_tpl:')) {
          removeDefaultSearchInput()
          clearDefaultSearchCache()
        } else {
          mountDefaultSearchInput(true)
        }
        applyStoredWindowHeight()
        window.dispatchEvent(new CustomEvent(UTOOLS_PLUGIN_ENTER_EVENT, {
          detail: entry.params,
        }))
      })
    }

    if (typeof utools.onPluginOut === 'function') {
      utools.onPluginOut((isKill) => {
        removeDefaultSearchInput()
        clearDefaultSearchCache()
        window.dispatchEvent(new CustomEvent(UTOOLS_PLUGIN_OUT_EVENT, {
          detail: { isKill: isKill === true },
        }))
      })
    }

    // 渲染层 → subInput 同步（带 suppress 标记防回环）
    window.addEventListener(UTOOLS_SYNC_EVENT, (event) => {
      const detail = event.detail || {}
      const text = typeof detail.text === 'string' ? detail.text : ''
      if (!shouldUseDefaultSearchInput()) return
      if (text === window.__gooseMarksLastAppValue) return
      window.__gooseMarksLastAppValue = text
      if (typeof utools.setSubInputValue === 'function') {
        window.__gooseMarksSuppressNextChange = true
        utools.setSubInputValue(text)
      }
    })

    // 重挂 subInput 并回填上次搜索值（渲染层初始化/布局切换时触发）
    window.addEventListener(UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT, () => {
      mountDefaultSearchInput(true)
      if (!shouldUseDefaultSearchInput()) return
      if (typeof utools.setSubInputValue === 'function') {
        utools.setSubInputValue(window.__gooseMarksLastAppValue || '')
      }
    })

    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, () => {
      window.__gooseMarksPendingPluginEnterEvents = []
      clearDefaultSearchCache()
    })

    if (typeof utools.registerTool === 'function') {
      MCP_TOOL_NAMES.forEach((toolName) => {
        utools.registerTool(toolName, async (params, context) => {
          const reportProgress = (progress, message) => {
            try {
              const reported = context?.sendProgress?.({ progress, total: 1, message })
              if (reported && typeof reported.catch === 'function') reported.catch(() => {})
            } catch {}
          }
          reportProgress(0, `正在执行 ${toolName}`)
          const result = await invokeRendererMcpTool(toolName, params)
          reportProgress(1, `${toolName} 执行完成`)
          return result
        })
      })
    }
  }

  // 暴露 Node require，供渲染层按需加载 fs/path/os/crypto 等模块
  // 说明：uTools 插件环境下该能力可用；普通浏览器环境下不会执行 preload
  if (typeof require === 'function') {
    window.require = require
  }
}
