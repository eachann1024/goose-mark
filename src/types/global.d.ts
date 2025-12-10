interface UToolsApi {
  getPath(name: string): string
  setSubInput(onChange: (params: { text: string }) => void, placeholder?: string, isFocus?: boolean): boolean
  removeSubInput(): boolean
  onPluginEnter(callback: (params: { code: string; type: string; payload: any }) => void): void
  shellOpenExternal(url: string): void
  askAI(prompt: string): Promise<string>
  isDarkColors?(): boolean
}

declare global {
  interface Window {
    utools?: UToolsApi
    require?: NodeRequire
  }
}

export {}
