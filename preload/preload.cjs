// preload 运行在 CJS，避免与主项目 ESM 冲突
if (typeof window !== 'undefined' && typeof utools !== 'undefined') {
  window.utools = utools
}
