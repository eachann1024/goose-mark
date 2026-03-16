interface UToolsBrowserWindow {
  show(): void
  webContents?: {
    executeJavaScript(code: string): Promise<unknown>
    send(channel: string, ...args: unknown[]): void
  }
}

interface UBrowserApi {
  goto(url: string, headers?: Record<string, string>, timeout?: number): UBrowserApi
  run(options?: { width?: number; height?: number; show?: boolean }): Promise<unknown[]>
}

interface UToolsAiOption {
  model?: string
  messages: UToolsAiMessage[]
}

interface UToolsAiMessage {
  role: 'system' | 'user' | 'assistant'
  content?: string
  reasoning_content?: string
}

interface UToolsApi {
  getPath(name: string): string
  setSubInput(onChange: (params: { text: string }) => void, placeholder?: string, isFocus?: boolean): boolean
  setSubInputValue?(text: string): boolean
  subInputFocus?(): void
  removeSubInput(): boolean
  onPluginEnter(callback: (params: { code: string; type: string; payload: any }) => void): void
  shellOpenExternal(url: string): void
  setFeature?(feature: {
    code: string
    explain: string
    cmds: Array<string | Record<string, unknown>>
    mainHide?: boolean
    mainPush?: boolean
  }): void
  getFeatures?(): Array<{ code: string; explain?: string; cmds?: unknown[]; mainHide?: boolean; mainPush?: boolean }>
  removeFeature?(code: string): boolean
  // uTools AI API - 需要用户在 uTools 中配置 AI 服务
  ai?(option: UToolsAiOption, streamCallback?: (chunk: { text?: string; content?: string }) => void): Promise<string | { text?: string; content?: string }>
  isDarkColors?(): boolean
  getWindowType?(): 'main' | 'detach' | 'browser'
  outPlugin(isKill?: boolean): boolean
  createBrowserWindow?(url: string, options?: Record<string, unknown>, callback?: () => void): UToolsBrowserWindow | undefined
  ubrowser?: UBrowserApi
  getVersion?(): string
  copyText?(text: string): void
  setExpendHeight?(height: number): void
  showNotification?(text: string): void
  hideMainWindow?(): void
  // 文件对话框 API
  showOpenDialog?(options: {
    title?: string
    filters?: Array<{ name: string; extensions: string[] }>
    properties?: ('openFile' | 'openDirectory' | 'multiSelections')[]
  }): Promise<string[] | undefined>
  readFileSync?(path: string, encoding: 'utf-8'): string | undefined
}

declare global {
  interface Window {
    utools?: UToolsApi
    require?: NodeRequire
  }
}

export {}
