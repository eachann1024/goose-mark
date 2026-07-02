// preload 运行在 CJS，避免与主项目 ESM 冲突
if (typeof window !== 'undefined') {
  if (typeof utools !== 'undefined') {
    window.utools = utools

    const WINDOW_HEIGHT_STORAGE_KEY = 'settings'
    const MIN_WINDOW_HEIGHT = 600
    const MAX_WINDOW_HEIGHT = 1000
    const DEFAULT_WINDOW_HEIGHT = 800

    const clampWindowHeight = (height) => {
      const numericHeight = Number(height)
      if (!Number.isFinite(numericHeight)) return null
      return Math.min(MAX_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, Math.round(numericHeight)))
    }

    // 仅当 settings 里确实存有历史 windowHeight 时才应用；
    // 无存值时返回 null，不调用 setExpendHeight，高度交还 plugin.json 配置控制。
    const readStoredWindowHeight = () => {
      let rawValue = null

      try {
        if (utools?.dbStorage && typeof utools.dbStorage.getItem === 'function') {
          rawValue = utools.dbStorage.getItem(WINDOW_HEIGHT_STORAGE_KEY)
        }
      } catch {}

      if (rawValue == null) {
        try {
          rawValue = window.localStorage?.getItem?.(WINDOW_HEIGHT_STORAGE_KEY) ?? null
        } catch {}
      }

      if (!rawValue) return null

      try {
        const parsed = JSON.parse(rawValue)
        if (parsed != null && typeof parsed === 'object' && 'windowHeight' in parsed) {
          return clampWindowHeight(parsed.windowHeight)
        }
        if (parsed?.state != null && typeof parsed.state === 'object' && parsed.state.windowHeight != null) {
          return clampWindowHeight(parsed.state.windowHeight)
        }
        return null
      } catch {
        return null
      }
    }

    const applyStoredWindowHeight = () => {
      if (typeof utools.setExpendHeight !== 'function') return
      const storedHeight = readStoredWindowHeight()
      const height = storedHeight ?? DEFAULT_WINDOW_HEIGHT
      utools.setExpendHeight(height)
    }
    // 后台页加载时先应用一次；后续每次 onPluginEnter 再应用，
    // 解决“首次有效、再次打开失效”的问题。
    applyStoredWindowHeight()

    const getCurrentElectronWindow = () => {
      try {
        const electron = typeof require === 'function' ? require('electron') : null
        const fromRemote = electron?.remote?.getCurrentWindow?.()
        if (fromRemote) return fromRemote
      } catch {}

      try {
        const remote = typeof require === 'function' ? require('@electron/remote') : null
        const fromRemotePackage = remote?.getCurrentWindow?.()
        if (fromRemotePackage) return fromRemotePackage
      } catch {}

      return null
    }

    window.__gooseMarksWindowControl = {
      getPosition() {
        const currentWindow = getCurrentElectronWindow()
        try {
          const bounds = currentWindow?.getBounds?.()
          if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
            return { x: Math.round(bounds.x), y: Math.round(bounds.y) }
          }
        } catch {}

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

        const currentWindow = getCurrentElectronWindow()
        try {
          if (typeof currentWindow?.setPosition === 'function') {
            currentWindow.setPosition(x, y, false)
            return true
          }
        } catch {}
        try {
          if (typeof currentWindow?.setBounds === 'function') {
            currentWindow.setBounds({ x, y })
            return true
          }
        } catch {}
        try {
          if (typeof window.moveTo === 'function') {
            window.moveTo(x, y)
          }
        } catch {}
        return false
      }
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

    const normalizeToolParams = (params) => {
      if (!params || typeof params !== 'object' || Array.isArray(params)) return {}
      return params
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

    // 挂载 uTools 顶部 subInput 搜索框（placeholder '搜索书签...'），
    // 用户在 subInput 输入时 dispatch UTOOLS_INPUT_EVENT 通知渲染层；
    // __gooseMarksSuppressNextChange / __gooseMarksLastAppValue 防回环。
    const mountDefaultSearchInput = (focus = true) => {
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
        mountDefaultSearchInput(true)
        applyStoredWindowHeight()
        window.dispatchEvent(new CustomEvent(UTOOLS_PLUGIN_ENTER_EVENT, {
          detail: entry.params,
        }))
      })
    }

    if (typeof utools.onPluginOut === 'function') {
      utools.onPluginOut((isKill) => {
        if (typeof utools.removeSubInput === 'function') {
          utools.removeSubInput()
        }
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
        utools.registerTool(toolName, async (params) => {
          return await invokeRendererMcpTool(toolName, params)
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
