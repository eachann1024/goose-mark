import { Checkbox as AriaCheckbox } from 'react-aria-components'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Checkbox —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * Vue 契约：reka-ui CheckboxRoot 的 modelValue（true | false | 'indeterminate'）。
 * React 等价：checked（boolean | 'indeterminate'） + onCheckedChange。
 * - lucide-vue-next <Check> → lucide-react <Check>；indeterminate 用 <Minus>。
 * - 状态选择器 data-[selected] / data-[indeterminate]（react-aria）。
 */
export interface CheckboxProps {
  checked?: boolean | 'indeterminate'
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  name?: string
  value?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  id?: string
}

export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className,
  ...rest
}: CheckboxProps) {
  const isIndeterminate = checked === 'indeterminate'

  return (
    <AriaCheckbox
      isSelected={isIndeterminate ? false : checked}
      isIndeterminate={isIndeterminate}
      defaultSelected={defaultChecked}
      onChange={onCheckedChange}
      isDisabled={disabled}
      className={cn(
        'group grid place-content-center peer h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-input bg-background text-background shadow-sm transition-colors',
        'outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        'data-[selected]:border-foreground data-[selected]:bg-foreground data-[selected]:text-background',
        'data-[indeterminate]:border-foreground data-[indeterminate]:bg-foreground data-[indeterminate]:text-background',
        className,
      )}
      {...rest}
    >
      <span className="grid place-content-center text-current opacity-0 group-data-[selected]:opacity-100 group-data-[indeterminate]:opacity-100">
        {isIndeterminate ? <Minus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </span>
    </AriaCheckbox>
  )
}
