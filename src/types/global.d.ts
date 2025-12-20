interface UToolsAiOption {
  prompt: string
  model?: string
}

interface UToolsApi {
  getPath(name: string): string
  setSubInput(onChange: (params: { text: string }) => void, placeholder?: string, isFocus?: boolean): boolean
  setSubInputValue?(text: string): boolean
  subInputFocus?(): void
  removeSubInput(): boolean
  onPluginEnter(callback: (params: { code: string; type: string; payload: any }) => void): void
  shellOpenExternal(url: string): void
  setFeature?(feature: { code: string; explain: string; cmds: Array<string | Record<string, unknown>> }): void
  getFeatures?(): Array<{ code: string; explain?: string; cmds?: unknown[] }>
  removeFeature?(code: string): boolean
  // uTools AI API - 需要用户在 uTools 中配置 AI 服务
  ai(option: UToolsAiOption, streamCallback?: (chunk: { text: string }) => void): Promise<string>
  isDarkColors?(): boolean
  // 窗口类型: main=主窗口, detach=分离窗口, browser=createBrowserWindow 创建的窗口
  getWindowType?(): 'main' | 'detach' | 'browser'
  outPlugin(isKill?: boolean): boolean
}

declare global {
  interface Window {
    utools?: UToolsApi
    require?: NodeRequire
  }
}

export {}
