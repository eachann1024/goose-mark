import type { ChildProcess } from 'child_process'

export interface BrowserInfo {
  id: string
  name: string
  installed?: boolean
}

const getNodeModule = <T = unknown>(name: string): T | null => {
  if (typeof window === 'undefined' || !window.require) return null
  try {
    return window.require(name) as T
  } catch {
    return null
  }
}

// 完整的浏览器列表，按类别分组
export const ALL_BROWSERS: BrowserInfo[] = [
  { id: 'default', name: '系统默认浏览器' },
  // AI 类浏览器
  { id: 'doubao-browser', name: '豆包浏览器' },
  { id: 'dia', name: 'Dia' },
  { id: 'arc-search', name: 'Arc Search' },
  { id: 'perplexity', name: 'Perplexity' },
  { id: 'sui-browser', name: 'Sui Browser' },
  // 国内主流浏览器
  { id: '360safe', name: '360安全浏览器' },
  { id: '360chrome', name: '360极速浏览器' },
  { id: 'qq-browser', name: 'QQ浏览器' },
  { id: 'sogou', name: '搜狗浏览器' },
  { id: 'uc-browser', name: 'UC浏览器' },
  { id: 'quark', name: '夸克浏览器' },
  { id: 'liebao', name: '猎豹浏览器' },
  { id: 'maxthon', name: '傲游浏览器' },
  { id: 'twinkstar', name: '星愿浏览器' },
  { id: 'cent', name: 'Cent Browser' },
  { id: 'yandex', name: 'Yandex Browser' },
  { id: 'chrome-plus', name: 'Chrome++' },
  // 国际主流浏览器
  { id: 'chrome', name: 'Google Chrome' },
  { id: 'arc', name: 'Arc' },
  { id: 'edge', name: 'Microsoft Edge' },
  { id: 'safari', name: 'Safari' },
  { id: 'firefox', name: 'Firefox' },
  { id: 'brave', name: 'Brave' },
  { id: 'opera', name: 'Opera' },
  { id: 'opera-gx', name: 'Opera GX' },
  { id: 'vivaldi', name: 'Vivaldi' },
  { id: 'orion', name: 'Orion' },
  { id: 'sigmaos', name: 'SigmaOS' },
  { id: 'zen', name: 'Zen Browser' },
  { id: 'tor', name: 'Tor Browser' },
  { id: 'waterfox', name: 'Waterfox' },
  { id: 'floorp', name: 'Floorp' },
  { id: 'librewolf', name: 'LibreWolf' },
  { id: 'pale-moon', name: 'Pale Moon' },
  { id: 'basilisk', name: 'Basilisk' },
  { id: 'epic', name: 'Epic Browser' },
  { id: 'avast', name: 'Avast Secure Browser' },
  { id: 'avg', name: 'AVG Secure Browser' },
  { id: 'duckduckgo', name: 'DuckDuckGo Browser' },
  { id: 'midori', name: 'Midori' },
  { id: 'min', name: 'Min' },
  { id: 'falkon', name: 'Falkon' },
  { id: 'beaker', name: 'Beaker' },
  { id: 'wavebox', name: 'Wavebox' },
  { id: 'station', name: 'Station' },
  { id: 'soul', name: 'Soul Browser' },
  { id: 'naver-whale', name: 'Naver Whale' },
]

// macOS .app 名称到 browser id 的映射
const MACOS_BROWSER_APPS: Record<string, string> = {
  // AI 类
  'Doubao Browser.app': 'doubao-browser',
  'Dia.app': 'dia',
  'Arc Search.app': 'arc-search',
  'Perplexity.app': 'perplexity',
  // 国内
  '360安全浏览器.app': '360safe',
  '360极速浏览器.app': '360chrome',
  'QQ浏览器.app': 'qq-browser',
  '搜狗高速浏览器.app': 'sogou',
  'UC浏览器.app': 'uc-browser',
  '夸克浏览器.app': 'quark',
  '猎豹浏览器.app': 'liebao',
  '傲游浏览器.app': 'maxthon',
  '星愿浏览器.app': 'twinkstar',
  'Cent Browser.app': 'cent',
  // 国际
  'Google Chrome.app': 'chrome',
  'Arc.app': 'arc',
  'Microsoft Edge.app': 'edge',
  'Safari.app': 'safari',
  'Firefox.app': 'firefox',
  'Brave Browser.app': 'brave',
  'Opera.app': 'opera',
  'Opera GX.app': 'opera-gx',
  'Vivaldi.app': 'vivaldi',
  'Orion.app': 'orion',
  'SigmaOS.app': 'sigmaos',
  'Zen Browser.app': 'zen',
  'Zen.app': 'zen',
  'Tor Browser.app': 'tor',
  'Waterfox.app': 'waterfox',
  'Floorp.app': 'floorp',
  'LibreWolf.app': 'librewolf',
  'Pale Moon.app': 'pale-moon',
  'Epic Browser.app': 'epic',
  'Avast Secure Browser.app': 'avast',
  'AVG Secure Browser.app': 'avg',
  'DuckDuckGo Browser.app': 'duckduckgo',
  'Midori.app': 'midori',
  'Min.app': 'min',
  'Falkon.app': 'falkon',
  'Wavebox.app': 'wavebox',
  'Station.app': 'station',
  'Soul Browser.app': 'soul',
  'Naver Whale.app': 'naver-whale',
  'Yandex.app': 'yandex',
}

// macOS open -a 使用的 app display name
const MACOS_APP_NAMES: Record<string, string> = {
  'doubao-browser': 'Doubao Browser',
  'dia': 'Dia',
  'arc-search': 'Arc Search',
  'perplexity': 'Perplexity',
  '360safe': '360安全浏览器',
  '360chrome': '360极速浏览器',
  'qq-browser': 'QQ浏览器',
  'sogou': '搜狗高速浏览器',
  'uc-browser': 'UC浏览器',
  'quark': '夸克浏览器',
  'liebao': '猎豹浏览器',
  'maxthon': '傲游浏览器',
  'twinkstar': '星愿浏览器',
  'cent': 'Cent Browser',
  'chrome': 'Google Chrome',
  'arc': 'Arc',
  'edge': 'Microsoft Edge',
  'safari': 'Safari',
  'firefox': 'Firefox',
  'brave': 'Brave Browser',
  'opera': 'Opera',
  'opera-gx': 'Opera GX',
  'vivaldi': 'Vivaldi',
  'orion': 'Orion',
  'sigmaos': 'SigmaOS',
  'zen': 'Zen Browser',
  'tor': 'Tor Browser',
  'waterfox': 'Waterfox',
  'floorp': 'Floorp',
  'librewolf': 'LibreWolf',
  'pale-moon': 'Pale Moon',
  'basilisk': 'Basilisk',
  'epic': 'Epic Browser',
  'avast': 'Avast Secure Browser',
  'avg': 'AVG Secure Browser',
  'duckduckgo': 'DuckDuckGo Browser',
  'midori': 'Midori',
  'min': 'Min',
  'falkon': 'Falkon',
  'wavebox': 'Wavebox',
  'station': 'Station',
  'soul': 'Soul Browser',
  'naver-whale': 'Naver Whale',
  'yandex': 'Yandex',
}

// Windows 可执行文件名（用于 where 命令和注册表检测）
const WINDOWS_EXE_NAMES: Record<string, string[]> = {
  'doubao-browser': ['DoubaoBrowser'],
  'dia': ['Dia'],
  'chrome': ['chrome'],
  'edge': ['msedge'],
  'firefox': ['firefox'],
  'brave': ['brave'],
  'opera': ['opera'],
  'opera-gx': ['opera_gx'],
  'vivaldi': ['vivaldi'],
  'tor': ['tor'],
  'waterfox': ['waterfox'],
  'floorp': ['floorp'],
  'librewolf': ['librewolf'],
  '360safe': ['360se'],
  '360chrome': ['360chrome'],
  'qq-browser': ['qqbrowser'],
  'sogou': ['sogou'],
  'uc-browser': ['ucbrowser'],
  'quark': ['quark'],
  'liebao': ['liebao'],
  'maxthon': ['maxthon'],
  'cent': ['centbrowser'],
  'yandex': ['yandex'],
  'avast': ['avastbrowser'],
  'avg': ['avgbrowser'],
  'duckduckgo': ['duckduckgo'],
}

// Linux 命令候选（按优先级排列）
const LINUX_CMD_CANDIDATES: Record<string, string[]> = {
  'chrome': ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  'edge': ['microsoft-edge', 'microsoft-edge-stable'],
  'firefox': ['firefox', 'firefox-esr'],
  'brave': ['brave', 'brave-browser'],
  'opera': ['opera'],
  'vivaldi': ['vivaldi'],
  'tor': ['torbrowser', 'tor-browser'],
  'waterfox': ['waterfox'],
  'floorp': ['floorp'],
  'librewolf': ['librewolf'],
  'falkon': ['falkon'],
  'midori': ['midori'],
  'yandex': ['yandex-browser'],
}

function getPlatform(): 'mac' | 'windows' | 'linux' | 'unknown' {
  const os = getNodeModule<{ platform?: () => string }>('os')
  const platform = os?.platform?.()
  if (platform === 'darwin') return 'mac'
  if (platform === 'win32') return 'windows'
  if (platform === 'linux') return 'linux'
  return 'unknown'
}

function scanMacOS(): string[] {
  const cp = getNodeModule<typeof import('child_process')>('child_process')
  if (!cp) return []

  const { execSync } = cp
  const os = getNodeModule<{ homedir?: () => string }>('os')
  const homeDir = os?.homedir?.() || ''
  const paths = ['/Applications']
  if (homeDir) paths.push(`${homeDir}/Applications`)

  const installed = new Set<string>()

  for (const basePath of paths) {
    try {
      const result = execSync(`ls -1 "${basePath}" 2>/dev/null`, { encoding: 'utf-8' })
      const apps = result.split('\n').map(s => s.trim()).filter(Boolean)
      for (const app of apps) {
        const browserId = MACOS_BROWSER_APPS[app]
        if (browserId) installed.add(browserId)
      }
    } catch {
      // ignore
    }
  }

  return Array.from(installed)
}

function scanWindows(): string[] {
  const cp = getNodeModule<typeof import('child_process')>('child_process')
  if (!cp) return []

  const { execSync } = cp
  const installed = new Set<string>()

  // 1. 用 where 命令快速检测常见 exe
  for (const [id, exeNames] of Object.entries(WINDOWS_EXE_NAMES)) {
    for (const exe of exeNames) {
      try {
        execSync(`where ${exe} 2>nul`, { encoding: 'utf-8' })
        installed.add(id)
        break
      } catch {
        // try next
      }
    }
  }

  // 2. 注册表扫描补充更多
  try {
    const result = execSync(
      'reg query "HKLM\\Software\\Clients\\StartMenuInternet" /s 2>nul',
      { encoding: 'utf-8' }
    )
    const lower = result.toLowerCase()
    const keywordMap: Record<string, string[]> = {
      'chrome': ['chrome'],
      'edge': ['edge', 'msedge'],
      'firefox': ['firefox'],
      'opera': ['opera'],
      'opera-gx': ['opera gx'],
      'brave': ['brave'],
      'vivaldi': ['vivaldi'],
      'tor': ['tor'],
      '360safe': ['360se', '360安全'],
      '360chrome': ['360chrome', '360极速'],
      'qq-browser': ['qqbrowser', 'qq浏览器'],
      'sogou': ['sogou', '搜狗'],
      'uc-browser': ['ucbrowser', 'uc浏览器'],
      'quark': ['quark', '夸克'],
      'liebao': ['liebao', '猎豹'],
      'maxthon': ['maxthon', '傲游'],
      'cent': ['cent', 'centbrowser'],
      'avast': ['avast'],
      'avg': ['avg'],
      'duckduckgo': ['duckduckgo'],
      'yandex': ['yandex'],
    }
    for (const [id, keywords] of Object.entries(keywordMap)) {
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          installed.add(id)
          break
        }
      }
    }
  } catch {
    // ignore
  }

  return Array.from(installed)
}

function scanLinux(): string[] {
  const cp = getNodeModule<typeof import('child_process')>('child_process')
  if (!cp) return []

  const { execSync } = cp
  const installed = new Set<string>()

  for (const [id, cmds] of Object.entries(LINUX_CMD_CANDIDATES)) {
    for (const cmd of cmds) {
      try {
        execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8' })
        installed.add(id)
        break
      } catch {
        // try next candidate
      }
    }
  }

  return Array.from(installed)
}

/**
 * 扫描当前系统已安装的浏览器。
 * 只返回已安装的浏览器列表（+ 默认选项）。
 */
export function scanInstalledBrowsers(): BrowserInfo[] {
  const platform = getPlatform()

  let installedIds: string[] = []
  switch (platform) {
    case 'mac':
      installedIds = scanMacOS()
      break
    case 'windows':
      installedIds = scanWindows()
      break
    case 'linux':
      installedIds = scanLinux()
      break
  }

  const installedSet = new Set(installedIds)
  const result: BrowserInfo[] = []

  // 默认浏览器始终在最前
  result.push({ id: 'default', name: '系统默认浏览器', installed: true })

  for (const browser of ALL_BROWSERS) {
    if (browser.id === 'default') continue
    if (installedSet.has(browser.id)) {
      result.push({ ...browser, installed: true })
    }
  }

  return result
}

/**
 * 返回浏览器名称，找不到时返回 id 本身
 */
export function getBrowserName(id: string): string {
  return ALL_BROWSERS.find(b => b.id === id)?.name || id
}

/**
 * 用指定浏览器打开 URL。
 * 返回 true 表示已尝试执行，false 表示无法执行（应回退到默认方式）。
 */
export function openUrlWithBrowser(url: string, browserId: string): boolean {
  if (browserId === 'default' || !browserId) return false

  const cp = getNodeModule<typeof import('child_process')>('child_process')
  if (!cp) return false

  const { exec } = cp
  const platform = getPlatform()

  let command = ''

  if (platform === 'mac') {
    const appName = MACOS_APP_NAMES[browserId]
    if (!appName) return false
    const escapedUrl = url.replace(/"/g, '\\"')
    command = `open -a "${appName}" "${escapedUrl}"`
  } else if (platform === 'windows') {
    const exeNames = WINDOWS_EXE_NAMES[browserId]
    if (!exeNames || exeNames.length === 0) return false
    const escapedUrl = url.replace(/"/g, '\\"')
    command = `start "" "${exeNames[0]}" "${escapedUrl}"`
  } else if (platform === 'linux') {
    const candidates = LINUX_CMD_CANDIDATES[browserId]
    if (!candidates) return false
    // 同步检测第一个可用的命令
    let foundCmd = ''
    for (const cmd of candidates) {
      try {
        cp.execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8' })
        foundCmd = cmd
        break
      } catch {
        continue
      }
    }
    if (!foundCmd) return false
    const escapedUrl = url.replace(/"/g, '\\"')
    command = `${foundCmd} "${escapedUrl}" &`
  } else {
    return false
  }

  try {
    exec(command, (error: Error | null) => {
      if (error) {
        console.warn(`[BrowserScanner] 用 ${browserId} 打开失败:`, error)
      }
    })
    return true
  } catch {
    return false
  }
}
