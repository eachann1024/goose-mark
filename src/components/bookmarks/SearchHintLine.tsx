import { Info } from 'lucide-react'

/**
 * SearchHintLine（React 版）
 * --------------------------------------------------------------------------
 * 搜索浮层的操作提示行。等价旧版 Vue SearchHintLine.vue。
 * i-ph-info-thin → lucide-react Info。纯展示组件，无埋点。
 */
export interface SearchHintLineProps {
  enableSubInput: boolean
  searchAutoExitText: string
}

export function SearchHintLine({ searchAutoExitText }: SearchHintLineProps) {
  const exitKey = 'Tab'
  const hintText = `按 ${exitKey} 退出；按 ↑ ↓ 选择，回车打开；${searchAutoExitText}`

  return (
    <div className="flex items-center gap-2 justify-center">
      <Info className="size-3.5" />
      <span>{hintText}</span>
    </div>
  )
}

export default SearchHintLine
