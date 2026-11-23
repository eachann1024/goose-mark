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

  // 不向渲染层暴露通用 window.require；仅提供固定用途、带根目录白名单与 realpath 校验的桥接。
  try {
    const os = require('os')
    window.__gooseSystemInfo = {
      osVersion: typeof os.release === 'function' ? os.release() : '',
      arch: typeof process !== 'undefined' && typeof process.arch === 'string' ? process.arch : '',
    }
  } catch {}

  try {
    const fs = require('fs')
    const fsp = fs.promises
    const path = require('path')
    const crypto = require('crypto')
    const os = require('os')

    const isInsideRoot = (rootDir, targetPath) => {
      const resolvedRoot = path.resolve(rootDir)
      const resolvedTarget = path.resolve(targetPath)
      const rel = path.relative(resolvedRoot, resolvedTarget)
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    }

    const ensureSafeDir = (rootDir, subPath = '') => {
      fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 })
      const realRoot = fs.realpathSync(rootDir)
      const dir = subPath ? path.join(realRoot, subPath) : realRoot
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      const realDir = fs.realpathSync(dir)
      if (!isInsideRoot(realRoot, realDir)) {
        throw new Error('路径越界')
      }
      return realDir
    }

    const getPluginDataRoot = () => {
      let root
      try {
        root = typeof utools !== 'undefined' ? utools.getPluginLocalDataPath?.() : undefined
      } catch {}
      if (!root) {
        let home
        try {
          home = typeof utools !== 'undefined' ? utools.getPath?.('home') : undefined
        } catch {}
        root = path.join(home || os.homedir(), '.goose-marks')
      }
      return path.resolve(root)
    }

    const BOOT_SNAPSHOT_FILENAME = 'boot-snapshot-v1.json'
    const LOCAL_CREDENTIALS_FILENAME = 'ai-credentials.json'
    const RECOVERY_FILENAME_RE = /^goose-marks\.bookmark-recovery\.[A-Za-z0-9._-]+\.json$/
    const CHECKPOINT_FILENAME_RE = /^goose-marks\.bookmark-recovery\.checkpoint\.[a-f0-9]{64}\.json$/
    const MAX_ICON_BYTES = 2 * 1024 * 1024
    const ICON_EXT_RE = /\.(png|jpe?g|webp|gif|svg|ico)$/i

    window.__gooseBootCache = {
      readSync() {
        try {
          const root = getPluginDataRoot()
          const file = path.join(root, BOOT_SNAPSHOT_FILENAME)
          if (!fs.existsSync(file)) return null
          const realRoot = fs.realpathSync(root)
          const realFile = fs.realpathSync(file)
          if (!isInsideRoot(realRoot, realFile)) return null
          return fs.readFileSync(realFile, 'utf8')
        } catch {
          return null
        }
      },
      writeSync(content) {
        if (typeof content !== 'string') return false
        try {
          const realDir = ensureSafeDir(getPluginDataRoot())
          const file = path.join(realDir, BOOT_SNAPSHOT_FILENAME)
          const temp = `${file}.${crypto.randomUUID()}.tmp`
          try {
            fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 })
            fs.renameSync(temp, file)
            return true
          } finally {
            if (fs.existsSync(temp)) fs.unlinkSync(temp)
          }
        } catch {
          return false
        }
      },
      async writeAsync(content) {
        if (typeof content !== 'string') return false
        try {
          const realDir = ensureSafeDir(getPluginDataRoot())
          const file = path.join(realDir, BOOT_SNAPSHOT_FILENAME)
          const temp = `${file}.${crypto.randomUUID()}.tmp`
          try {
            await fsp.writeFile(temp, content, { encoding: 'utf8', mode: 0o600 })
            await fsp.rename(temp, file)
            return true
          } finally {
            await fsp.unlink(temp).catch(() => {})
          }
        } catch {
          return false
        }
      },
      clear() {
        try {
          const root = getPluginDataRoot()
          const file = path.join(root, BOOT_SNAPSHOT_FILENAME)
          if (!fs.existsSync(file)) return
          const realRoot = fs.realpathSync(root)
          const realFile = fs.realpathSync(file)
          if (isInsideRoot(realRoot, realFile)) {
            fs.unlinkSync(realFile)
          }
        } catch {}
      },
    }

    const resolveRecoveryFile = (isCheckpoint, filename) => {
      if (typeof filename !== 'string' || !RECOVERY_FILENAME_RE.test(filename)) {
        throw new Error('无效的恢复文件名')
      }
      const baseDir = ensureSafeDir(getPluginDataRoot(), 'bookmark-recovery')
      const dir = isCheckpoint ? ensureSafeDir(baseDir, 'checkpoints') : baseDir
      const target = path.join(dir, filename)
      if (!isInsideRoot(dir, target)) {
        throw new Error('恢复文件路径越界')
      }
      return { dir, target }
    }

    window.__gooseBookmarkRecovery = {
      sha256(content) {
        return crypto.createHash('sha256').update(String(content ?? '')).digest('hex')
      },
      writeFileSync(isCheckpoint, filename, content, skipIfExists) {
        const { target } = resolveRecoveryFile(!!isCheckpoint, filename)
        if (skipIfExists && fs.existsSync(target)) {
          return { written: false, existed: true }
        }
        const temp = `${target}.${crypto.randomUUID()}.tmp`
        try {
          const fd = fs.openSync(temp, 'wx', 0o600)
          try {
            fs.writeFileSync(fd, String(content), 'utf8')
            fs.fsyncSync(fd)
          } finally {
            fs.closeSync(fd)
          }
          fs.renameSync(temp, target)
          return { written: true, existed: false }
        } finally {
          if (fs.existsSync(temp)) fs.unlinkSync(temp)
        }
      },
      async writeFileAsync(isCheckpoint, filename, content, skipIfExists) {
        const { target } = resolveRecoveryFile(!!isCheckpoint, filename)
        if (skipIfExists) {
          try {
            await fsp.access(target)
            return { written: false, existed: true }
          } catch {}
        }
        const temp = `${target}.${crypto.randomUUID()}.tmp`
        try {
          const handle = await fsp.open(temp, 'wx', 0o600)
          try {
            await handle.writeFile(String(content), 'utf8')
            await handle.sync()
          } finally {
            await handle.close()
          }
          await fsp.rename(temp, target)
          return { written: true, existed: false }
        } finally {
          await fsp.unlink(temp).catch(() => {})
        }
      },
      rotateCheckpointsSync(keepFilename, limit, maxBytes) {
        const dir = ensureSafeDir(ensureSafeDir(getPluginDataRoot(), 'bookmark-recovery'), 'checkpoints')
        const files = fs.readdirSync(dir)
          .filter((name) => CHECKPOINT_FILENAME_RE.test(name))
          .map((name) => {
            const target = path.join(dir, name)
            return { name, target, stat: fs.lstatSync(target) }
          })
          .filter((entry) => entry.stat.isFile())
          .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs || a.target.localeCompare(b.target))
        let bytes = files.reduce((total, entry) => total + entry.stat.size, 0)
        let count = files.length
        for (const entry of files) {
          if (count <= limit && (bytes <= maxBytes || count <= 2)) break
          if (entry.name === keepFilename) continue
          const current = fs.lstatSync(entry.target)
          if (current.ino !== entry.stat.ino || current.mtimeMs !== entry.stat.mtimeMs) continue
          fs.unlinkSync(entry.target)
          bytes -= entry.stat.size
          count--
        }
      },
      async rotateCheckpointsAsync(keepFilename, limit, maxBytes) {
        const dir = ensureSafeDir(ensureSafeDir(getPluginDataRoot(), 'bookmark-recovery'), 'checkpoints')
        const names = (await fsp.readdir(dir)).filter((name) => CHECKPOINT_FILENAME_RE.test(name))
        const stats = await Promise.all(names.map(async (name) => {
          const target = path.join(dir, name)
          try {
            return { name, target, stat: await fsp.lstat(target) }
          } catch {
            return null
          }
        }))
        const files = stats
          .filter((entry) => entry && entry.stat.isFile())
          .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs || a.target.localeCompare(b.target))
        let bytes = files.reduce((total, entry) => total + entry.stat.size, 0)
        let count = files.length
        for (const entry of files) {
          if (count <= limit && (bytes <= maxBytes || count <= 2)) break
          if (entry.name === keepFilename) continue
          try {
            const current = await fsp.lstat(entry.target)
            if (current.ino !== entry.stat.ino || current.mtimeMs !== entry.stat.mtimeMs) continue
            await fsp.unlink(entry.target)
            bytes -= entry.stat.size
            count--
          } catch {}
        }
      },
      removePendingSync(filename) {
        try {
          const { target } = resolveRecoveryFile(false, filename)
          if (fs.existsSync(target)) fs.unlinkSync(target)
        } catch {}
      },
    }

    window.__gooseBackup = {
      async saveWithDialog(defaultName, content) {
        if (typeof utools === 'undefined' || typeof utools.showSaveDialog !== 'function') {
          throw new Error('当前环境不支持保存对话框')
        }
        const safeName = path.basename(String(defaultName || 'goose-marks-backup.json'))
        const target = await utools.showSaveDialog({
          title: '导出完整备份',
          defaultPath: safeName,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (!target) return 'cancelled'
        const file = await fsp.open(target, 'wx', 0o600)
        try {
          await file.writeFile(String(content ?? ''), 'utf8')
          await file.sync()
        } finally {
          await file.close()
        }
        return 'saved'
      },
      async readIconFile(filePath) {
        if (typeof filePath !== 'string' || !filePath || !ICON_EXT_RE.test(filePath)) {
          throw new Error('不支持的图标文件类型')
        }
        const allowedRoots = [getPluginDataRoot()]
        try {
          const userData = typeof utools !== 'undefined' ? utools.getPath?.('userData') : undefined
          if (userData) allowedRoots.push(path.resolve(userData))
        } catch {}

        const before = await fsp.lstat(filePath)
        if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_ICON_BYTES) {
          throw new Error('文件缺失、不是普通文件或超过大小限制')
        }
        const realTarget = await fsp.realpath(filePath)
        const inAllowedRoot = allowedRoots.some((root) => {
          try {
            if (!fs.existsSync(root)) return false
            return isInsideRoot(fs.realpathSync(root), realTarget)
          } catch {
            return false
          }
        })
        if (!inAllowedRoot) {
          throw new Error('图标文件路径不在允许的数据目录内')
        }
        const handle = await fsp.open(realTarget, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
        try {
          const after = await handle.stat()
          if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) {
            throw new Error('文件在读取时发生变化')
          }
          const bytes = await handle.readFile()
          if (bytes.byteLength > MAX_ICON_BYTES) {
            throw new Error('文件超过大小限制')
          }
          return bytes.toString('base64')
        } finally {
          await handle.close()
        }
      },
    }

    window.__gooseLocalCredentials = {
      read() {
        try {
          const root = getPluginDataRoot()
          const file = path.join(root, LOCAL_CREDENTIALS_FILENAME)
          if (!fs.existsSync(file)) return null
          const realRoot = fs.realpathSync(root)
          const realFile = fs.realpathSync(file)
          if (!isInsideRoot(realRoot, realFile)) return null
          return fs.readFileSync(realFile, 'utf8')
        } catch {
          return null
        }
      },
      write(content) {
        if (typeof content !== 'string') return false
        try {
          const realDir = ensureSafeDir(getPluginDataRoot())
          const file = path.join(realDir, LOCAL_CREDENTIALS_FILENAME)
          const temp = `${file}.${crypto.randomUUID()}.tmp`
          try {
            fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 })
            fs.renameSync(temp, file)
            return true
          } finally {
            if (fs.existsSync(temp)) fs.unlinkSync(temp)
          }
        } catch {
          return false
        }
      },
    }
  } catch {}
}
