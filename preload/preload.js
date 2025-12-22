// preload 运行在 CJS，避免与主项目 ESM 冲突
if (typeof window !== 'undefined' && typeof utools !== 'undefined') {
  window.utools = utools
  
  // 默认高度，与 settings store 保持一致
  const DEFAULT_HEIGHT = 700
  
  try {
    const raw = utools.dbStorage?.getItem('settings')
    const data = raw ? JSON.parse(raw) : null
    const height = Number(data?.windowHeight)
    // 使用存储的高度，或者 fallback 到默认值
    const targetHeight = Number.isFinite(height) && height >= 100 ? height : DEFAULT_HEIGHT
    if (typeof utools.setExpendHeight === 'function') {
      utools.setExpendHeight(targetHeight)
    }
  } catch {
    // 解析失败时使用默认高度
    if (typeof utools.setExpendHeight === 'function') {
      utools.setExpendHeight(DEFAULT_HEIGHT)
    }
  }
}
