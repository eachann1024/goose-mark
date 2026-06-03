import { Switch as AriaSwitch } from 'react-aria-components'
import { cn } from '@/lib/utils'

/**
 * Switch —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * Vue 契约：:model-value(boolean) + @update:model-value。
 * React 等价：受控 checked + onCheckedChange（也支持非受控 defaultChecked）。
 *
 * react-aria 的状态选择器是 data-[selected]（非 reka-ui 的 data-[state=checked]），
 * 故 Tailwind 选择器同步改为 data-[selected]。视觉 token 与尺寸沿用旧版。
 */
export interface SwitchProps {
  checked?: boolean
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

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className,
  ...rest
}: SwitchProps) {
  return (
    <AriaSwitch
      isSelected={checked}
      defaultSelected={defaultChecked}
      onChange={onCheckedChange}
      isDisabled={disabled}
      className={cn(
        'group peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-start rounded-full border border-input p-0 shadow-sm transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        'data-[selected]:justify-end data-[selected]:border-foreground/10 data-[selected]:bg-foreground/70',
        'bg-muted',
        className,
      )}
      {...rest}
    >
      <span className="pointer-events-none m-0.5 block h-4 w-4 rounded-full bg-background shadow ring-0 transition-all" />
    </AriaSwitch>
  )
}
