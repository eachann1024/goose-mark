// preload 运行在 CJS，避免与主项目 ESM 冲突
if (typeof window !== 'undefined') {
  if (typeof utools !== 'undefined') {
    window.utools = utools
  }

  // 暴露 Node require，供渲染层按需加载 fs/path/os/crypto 等模块
  // 说明：uTools 插件环境下该能力可用；普通浏览器环境下不会执行 preload
  if (typeof require === 'function') {
    window.require = require
  }
}
