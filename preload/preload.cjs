// preload 运行在 CJS，避免与主项目 ESM 冲突
if (typeof window !== 'undefined') {
  if (typeof utools !== 'undefined') {
    window.utools = utools

    const UTOOLS_INPUT_EVENT = 'goose-marks:utools-search'
    const UTOOLS_SYNC_EVENT = 'goose-marks:utools-search-sync'
    const UTOOLS_PLUGIN_ENTER_EVENT = 'goose-marks:plugin-enter'
    const UTOOLS_PLUGIN_OUT_EVENT = 'goose-marks:plugin-out'
    const UTOOLS_RESTORE_DEFAULT_SEARCH_EVENT = 'goose-marks:restore-default-search-input'

    window.__gooseMarksSuppressNextChange = false
    window.__gooseMarksLastAppValue = ''
    window.__gooseMarksPluginEnterSerial = 0
    window.__gooseMarksLastPluginEnterSerial = 0
    window.__gooseMarksLastPluginEnterParams = null
    window.__gooseMarksPendingPluginEnterEvents = []

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
  }

  // 暴露 Node require，供渲染层按需加载 fs/path/os/crypto 等模块
  // 说明：uTools 插件环境下该能力可用；普通浏览器环境下不会执行 preload
  if (typeof require === 'function') {
    window.require = require
  }
}
