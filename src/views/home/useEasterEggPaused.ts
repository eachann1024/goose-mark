import { useEffect, useState } from 'react'
import { UTOOLS_PLUGIN_ENTER_EVENT, UTOOLS_PLUGIN_OUT_EVENT } from './homeRuntime'

/**
 * 彩蛋背景的暂停开关。
 *
 * 彩蛋是纯装饰的动态背景，只要窗口不可见就不该继续出帧：
 *  - uTools 面板收起（plugin-out）/ 重新唤起（plugin-enter）
 *  - 页面进入后台（visibilitychange）
 *
 * 用 React state 驱动组件的 paused prop（而不是在组件内部自己监听事件），
 * 恢复时走的是组件已有的 paused → kick 路径，只有一条恢复逻辑。
 */
export function useEasterEggPaused(): boolean {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let panelOpen = false
    const sync = () => setPaused(panelOpen || document.hidden)
    const onOut = () => {
      panelOpen = true
      sync()
    }
    const onEnter = () => {
      panelOpen = false
      sync()
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener(UTOOLS_PLUGIN_OUT_EVENT, onOut)
    window.addEventListener(UTOOLS_PLUGIN_ENTER_EVENT, onEnter)
    sync()
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener(UTOOLS_PLUGIN_OUT_EVENT, onOut)
      window.removeEventListener(UTOOLS_PLUGIN_ENTER_EVENT, onEnter)
    }
  }, [])

  return paused
}
