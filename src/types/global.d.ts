interface UToolsAiOption {
  prompt: string
  model?: string
}

interface UToolsApi {
  getPath(name: string): string
  setSubInput(onChange: (params: { text: string }) => void, placeholder?: string, isFocus?: boolean): boolean
  removeSubInput(): boolean
  onPluginEnter(callback: (params: { code: string; type: string; payload: any }) => void): void
  shellOpenExternal(url: string): void
  // uTools AI API - 需要用户在 uTools 中配置 AI 服务
  ai(option: UToolsAiOption, streamCallback?: (chunk: { text: string }) => void): Promise<string>
  isDarkColors?(): boolean
}

declare global {
  interface Window {
    utools?: UToolsApi
    require?: NodeRequire
  }
}

export {}

